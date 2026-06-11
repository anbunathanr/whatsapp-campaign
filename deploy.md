# WhatsApp Campaign Platform — AWS Serverless Deployment Guide

## Architecture

```
Browser
  │
  ▼
CloudFront (HTTPS) ──── S3 (React SPA static files)
  │
  ▼ (API calls)
API Gateway (HTTP API)
  │
  ▼
Lambda (FastAPI + Mangum)
  │
  ├── S3 (ML model artifacts)
  └── Tesseract Lambda Layer (OCR)
```

**Services used:**
| Component | AWS Service |
|---|---|
| React Frontend | S3 + CloudFront |
| FastAPI Backend | Lambda + API Gateway (HTTP API) |
| ML Model Storage | Amazon S3 |
| OCR Engine | Tesseract via Lambda Layer |
| Secrets | Lambda Environment Variables |
| Logs | Amazon CloudWatch (auto) |

> **Fully serverless** — no EC2, no ECS, no ALB, no ElastiCache. Pay only when requests are made.

---

## Prerequisites

- AWS CLI configured (`aws configure`)
- Python 3.11+
- Node.js 18+
- Docker Desktop (for building the Tesseract Lambda Layer)

### Install AWS CLI
```powershell
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

### Configure AWS credentials
```powershell
aws configure
# AWS Access Key ID:     <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region name:   ap-south-1
# Default output format: json
```

### Verify
```powershell
aws sts get-caller-identity
```

---

## Step 1 — Set Variables

```powershell
$REGION     = "ap-south-1"
$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$APP_NAME   = "whatsapp-campaign"

Write-Host "Account: $ACCOUNT_ID | Region: $REGION"
```

---

## Step 2 — Train the Model Locally

```powershell
cd D:\shared\trial\whatsapp-campaign

python generate_data.py
python train_model.py
```

This produces:
- `industry_classifier_model_v2.pkl`
- `industry_classifier_model_v2_classes.joblib`

---

## Step 3 — Upload Model Artifacts to S3

```powershell
aws s3 mb s3://$APP_NAME-models-$ACCOUNT_ID --region $REGION

aws s3 cp industry_classifier_model_v2.pkl s3://$APP_NAME-models-$ACCOUNT_ID/
aws s3 cp industry_classifier_model_v2_classes.joblib s3://$APP_NAME-models-$ACCOUNT_ID/
```

---

## Step 4 — Build Tesseract Lambda Layer

Lambda doesn't include Tesseract. Build it using Docker to match the Lambda Amazon Linux runtime:

```powershell
mkdir layer

docker run --rm -v "${PWD}/layer:/layer" amazonlinux:2 bash -c `
  "yum install -y tesseract && mkdir -p /layer/bin /layer/lib /layer/share && cp /usr/bin/tesseract /layer/bin/ && cp -r /usr/share/tesseract* /layer/share/ && ldd /usr/bin/tesseract | grep '=> /' | awk '{print `$3}' | xargs -I{} cp {} /layer/lib/"

Compress-Archive -Path layer\* -DestinationPath tesseract-layer.zip -Force

aws lambda publish-layer-version `
  --layer-name tesseract-ocr `
  --zip-file fileb://tesseract-layer.zip `
  --compatible-runtimes python3.11 `
  --region $REGION

# Save the LayerVersionArn from output
$TESSERACT_LAYER_ARN = (aws lambda list-layer-versions --layer-name tesseract-ocr --query "LayerVersions[0].LayerVersionArn" --output text)
Write-Host "Tesseract Layer ARN: $TESSERACT_LAYER_ARN"
```

---

## Step 5 — Prepare Lambda Deployment Package

### 5a. Update `model_loader.py` for S3

Create `model_loader_lambda.py`:

```python
import joblib, boto3, io, os

S3_BUCKET = os.environ["MODEL_BUCKET"]

class ModelLoader:
    _model = None
    _classes = None

    @classmethod
    def get_model(cls):
        if cls._model is None:
            s3 = boto3.client("s3")
            buf = io.BytesIO()
            s3.download_fileobj(S3_BUCKET, "industry_classifier_model_v2.pkl", buf)
            buf.seek(0)
            cls._model = joblib.load(buf)

            buf2 = io.BytesIO()
            s3.download_fileobj(S3_BUCKET, "industry_classifier_model_v2_classes.joblib", buf2)
            buf2.seek(0)
            cls._classes = joblib.load(buf2)
        return cls._model

    @classmethod
    def get_classes(cls):
        return cls._classes

def get_model(): return ModelLoader.get_model()
def get_classes(): return ModelLoader.get_classes()
```

### 5b. Create `handler.py`

```python
from mangum import Mangum
from main import app

handler = Mangum(app, lifespan="off")
```

### 5c. Update Tesseract path in `main.py`

Change the hardcoded Windows path:
```python
# Replace this:
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# With this:
pytesseract.pytesseract.tesseract_cmd = os.environ.get("TESSERACT_CMD", "/opt/bin/tesseract")
```

### 5d. Package everything

```powershell
# Install dependencies into a package folder
pip install fastapi scikit-learn xgboost pandas numpy joblib pillow pytesseract boto3 mangum -t package/

# Copy application code
Copy-Item main.py, csv_processor.py, handler.py package/
Copy-Item model_loader_lambda.py package/model_loader.py

# Create zip
Compress-Archive -Path package\* -DestinationPath lambda_function.zip -Force
```

> If the zip exceeds 50 MB, use a [container image deployment](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html) instead.

---

## Step 6 — Create IAM Role for Lambda

```powershell
$TRUST_POLICY = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam create-role `
  --role-name $APP_NAME-lambda-role `
  --assume-role-policy-document $TRUST_POLICY

aws iam attach-role-policy `
  --role-name $APP_NAME-lambda-role `
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy `
  --role-name $APP_NAME-lambda-role `
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Wait for role propagation
Start-Sleep -Seconds 10
```

---

## Step 7 — Deploy the Lambda Function

```powershell
$ROLE_ARN = "arn:aws:iam::${ACCOUNT_ID}:role/$APP_NAME-lambda-role"
$MODEL_BUCKET = "$APP_NAME-models-$ACCOUNT_ID"

aws lambda create-function `
  --function-name $APP_NAME-api `
  --runtime python3.11 `
  --role $ROLE_ARN `
  --handler handler.handler `
  --zip-file fileb://lambda_function.zip `
  --timeout 60 `
  --memory-size 2048 `
  --environment "Variables={MODEL_BUCKET=$MODEL_BUCKET,TESSERACT_CMD=/opt/bin/tesseract}" `
  --layers $TESSERACT_LAYER_ARN `
  --region $REGION

# Wait for function to be active
aws lambda wait function-active-v2 --function-name $APP_NAME-api --region $REGION
Write-Host "Lambda deployed!"
```

---

## Step 8 — Create API Gateway (HTTP API)

```powershell
$LAMBDA_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:$APP_NAME-api"

$API_ID = (aws apigatewayv2 create-api `
  --name $APP_NAME-api `
  --protocol-type HTTP `
  --target $LAMBDA_ARN `
  --query ApiId --output text)

$API_URL = "https://$API_ID.execute-api.$REGION.amazonaws.com"
Write-Host "API URL: $API_URL"

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission `
  --function-name $APP_NAME-api `
  --statement-id apigateway-invoke `
  --action lambda:InvokeFunction `
  --principal apigateway.amazonaws.com `
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"
```

### Enable binary media types (for image/CSV uploads)

```powershell
aws apigatewayv2 update-api `
  --api-id $API_ID `
  --region $REGION
```

> In the AWS Console: API Gateway → Your API → API settings → add binary media types: `multipart/form-data`, `image/*`

### Test the API

```powershell
Invoke-RestMethod "$API_URL/health"
# Expected: { status: "healthy", model_loaded: true }
```

---

## Step 9 — Deploy React Frontend to S3 + CloudFront

### 9a. Build frontend with the API Gateway URL

```powershell
cd D:\shared\trial\whatsapp-campaign\frontend

# Create production env file
"VITE_API_URL=$API_URL" | Out-File .env.production -Encoding utf8

npm install
npm run build
```

> Make sure your React code uses `import.meta.env.VITE_API_URL` as the base URL for API calls.

### 9b. Create and upload to S3

```powershell
$FRONTEND_BUCKET = "$APP_NAME-frontend-$ACCOUNT_ID"

aws s3 mb s3://$FRONTEND_BUCKET --region $REGION

aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete
```

### 9c. Create CloudFront distribution

```powershell
# Create Origin Access Control
$OAC_ID = (aws cloudfront create-origin-access-control `
  --origin-access-control-config "Name=$APP_NAME-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" `
  --query "OriginAccessControl.Id" --output text)

# Create distribution
aws cloudfront create-distribution `
  --origin-domain-name "$FRONTEND_BUCKET.s3.$REGION.amazonaws.com" `
  --default-root-object index.html

# Note the Distribution Domain Name from output (e.g. d1234abcd.cloudfront.net)
$CF_DOMAIN = "https://YOUR_DISTRIBUTION.cloudfront.net"
Write-Host "Frontend URL: $CF_DOMAIN"
```

### 9d. Set S3 bucket policy for CloudFront

```powershell
$DISTRIBUTION_ARN = "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/YOUR_DISTRIBUTION_ID"

$POLICY = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$FRONTEND_BUCKET/*",
    "Condition": {"StringEquals": {"AWS:SourceArn": "$DISTRIBUTION_ARN"}}
  }]
}
"@

$POLICY | Out-File bucket-policy.json -Encoding utf8
aws s3api put-bucket-policy --bucket $FRONTEND_BUCKET --policy file://bucket-policy.json
```

### 9e. Configure SPA routing (handle React Router 404s)

In AWS Console → CloudFront → Distribution → Error Pages:
- Error code `403` → Response code `200`, Response page `/index.html`
- Error code `404` → Response code `200`, Response page `/index.html`

---

## Step 10 — Verify Deployment

```powershell
# Backend
Invoke-RestMethod "$API_URL/health"

# Frontend
Start-Process $CF_DOMAIN
```

---

## Updating the App

### Update backend (Lambda)
```powershell
# Rebuild package
pip install fastapi scikit-learn xgboost pandas numpy joblib pillow pytesseract boto3 mangum -t package/
Copy-Item main.py, csv_processor.py, handler.py package/
Copy-Item model_loader_lambda.py package/model_loader.py
Compress-Archive -Path package\* -DestinationPath lambda_function.zip -Force

aws lambda update-function-code `
  --function-name $APP_NAME-api `
  --zip-file fileb://lambda_function.zip `
  --region $REGION
```

### Update frontend
```powershell
cd D:\shared\trial\whatsapp-campaign\frontend
npm run build
aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation `
  --distribution-id YOUR_DISTRIBUTION_ID `
  --paths "/*"
```

### Update ML model (no code change needed)
```powershell
python generate_data.py && python train_model.py
aws s3 cp industry_classifier_model_v2.pkl s3://$APP_NAME-models-$ACCOUNT_ID/
aws s3 cp industry_classifier_model_v2_classes.joblib s3://$APP_NAME-models-$ACCOUNT_ID/
```

Lambda picks up the new model on the next cold start.

---

## Cost Estimate (Serverless — Pay-per-use)

| Service | Free Tier (12 months) | Beyond Free Tier |
|---|---|---|
| Lambda | 1M requests + 400K GB-seconds/month | ~$0.20/1M requests |
| API Gateway | 1M requests/month | ~$1.00/1M requests |
| S3 | 5 GB storage | ~$0.023/GB/month |
| CloudFront | 1 TB transfer/month | ~$0.085/GB |
| CloudWatch | 5 GB logs | ~$0.50/GB |

**Estimated cost for low traffic: ~$0–5/month** (mostly within free tier).

---

## IAM Permissions Summary

The developer deploying this needs only:
- `lambda:*` — create/update functions
- `apigateway:*` — create HTTP API
- `s3:*` — create buckets, upload files
- `cloudfront:*` — create distribution
- `iam:CreateRole`, `iam:AttachRolePolicy` — one-time role setup
- `logs:*` — view CloudWatch logs

No EC2, ECS, ALB, or ElastiCache access is required.
