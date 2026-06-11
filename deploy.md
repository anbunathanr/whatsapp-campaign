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
  ├── /api/auth/*  → Auth Lambdas (register, login, verify-mfa)
  │                     │
  │                     ├── DynamoDB (wc-users table)
  │                     └── Secrets Manager (opencrm/frappe-api-key)
  │
  └── /api/*       → ML Lambda (FastAPI + Mangum)
                        │
                        ├── S3 (ML model artifacts)
                        └── Tesseract Lambda Layer (OCR)
```

**Services used:**
| Component | AWS Service |
|---|---|
| React Frontend | S3 + CloudFront |
| Auth (Register/Login/OTP) | Lambda + DynamoDB + Secrets Manager |
| FastAPI ML Backend | Lambda + API Gateway (HTTP API) |
| ML Model Storage | Amazon S3 |
| OCR Engine | Tesseract via Lambda Layer |
| User Database | DynamoDB (`wc-users` table) |
| CRM Integration | n8n webhook (OTP email delivery) |
| Logs | Amazon CloudWatch (auto) |

> **Fully serverless** — no EC2, no ECS, no ALB, no ElastiCache, no Cognito. Pay only when requests are made.

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

### 5d. Package everything (Lambda Layer approach for large ML libraries)

Since scikit-learn + numpy + scipy exceed Lambda's 50 MB ZIP limit, split into:
- **Lambda Layer** — heavy ML dependencies (~250 MB unzipped, within 250 MB layer limit)
- **Function ZIP** — application code only (small)

```powershell
# --- ML Dependencies Layer ---
mkdir ml-layer\python
pip install scikit-learn xgboost pandas numpy joblib -t ml-layer\python\

Compress-Archive -Path ml-layer\* -DestinationPath ml-deps-layer.zip -Force

aws lambda publish-layer-version `
  --layer-name $APP_NAME-ml-deps `
  --zip-file fileb://ml-deps-layer.zip `
  --compatible-runtimes python3.11 `
  --region $REGION

$ML_LAYER_ARN = (aws lambda list-layer-versions --layer-name $APP_NAME-ml-deps --query "LayerVersions[0].LayerVersionArn" --output text)
Write-Host "ML Layer ARN: $ML_LAYER_ARN"

# --- Function code (small zip) ---
mkdir func-package
pip install fastapi pillow pytesseract boto3 mangum -t func-package/

Copy-Item main.py, csv_processor.py, handler.py func-package/
Copy-Item model_loader_lambda.py func-package/model_loader.py

Compress-Archive -Path func-package\* -DestinationPath lambda_function.zip -Force
```

> **No ECR needed.** Lambda supports up to 5 layers (250 MB unzipped each). This avoids container images entirely.
>
> If the layer still exceeds 250 MB unzipped, use a **Docker container image** deployed to Lambda directly via `aws lambda create-function --package-type Image`. Even in this case, you do NOT need ECR — use Lambda's built-in container image support with `docker save` + `aws lambda create-function --code ImageUri=...` from a local image. However the layer approach should work for this project's dependencies.

---

## Step 6 — Create IAM Roles for Lambda

### 6a. ML API Lambda Role (S3 access for model)

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
```

### 6b. Auth Lambda Role (DynamoDB + Secrets Manager)

```powershell
aws iam create-role `
  --role-name $APP_NAME-auth-lambda-role `
  --assume-role-policy-document $TRUST_POLICY

aws iam attach-role-policy `
  --role-name $APP_NAME-auth-lambda-role `
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy `
  --role-name $APP_NAME-auth-lambda-role `
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy `
  --role-name $APP_NAME-auth-lambda-role `
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite

# Wait for role propagation
Start-Sleep -Seconds 10
```

---

## Step 7 — Create DynamoDB Users Table

```powershell
aws dynamodb create-table `
  --table-name wc-users `
  --attribute-definitions AttributeName=email,AttributeType=S `
  --key-schema AttributeName=email,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

aws dynamodb wait table-exists --table-name wc-users --region $REGION
Write-Host "DynamoDB table 'wc-users' created."
```

---

## Step 8 — Deploy Auth Lambda Functions

Auth code is located in `cloud/lambda/`. These functions use:
- **DynamoDB** for user storage
- **AWS Secrets Manager** (`opencrm/frappe-api-key`) for n8n webhook auth
- **n8n webhook** to send OTP emails via CRM

### 8a. Package auth functions

```powershell
cd D:\shared\trial\whatsapp-campaign\cloud\lambda

# Register
Compress-Archive -Path register.py -DestinationPath register.zip -Force

# Login
Compress-Archive -Path login.py -DestinationPath login.zip -Force

# Verify MFA
Compress-Archive -Path verify_mfa.py -DestinationPath verify_mfa.zip -Force
```

### 8b. Deploy auth Lambdas

```powershell
$AUTH_ROLE_ARN = "arn:aws:iam::${ACCOUNT_ID}:role/$APP_NAME-auth-lambda-role"

# Register Lambda
aws lambda create-function `
  --function-name $APP_NAME-register `
  --runtime python3.11 `
  --role $AUTH_ROLE_ARN `
  --handler register.lambda_handler `
  --zip-file fileb://register.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={JWT_SECRET=REPLACE_WITH_SECURE_SECRET}" `
  --region $REGION

# Login Lambda
aws lambda create-function `
  --function-name $APP_NAME-login `
  --runtime python3.11 `
  --role $AUTH_ROLE_ARN `
  --handler login.lambda_handler `
  --zip-file fileb://login.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={JWT_SECRET=REPLACE_WITH_SECURE_SECRET}" `
  --region $REGION

# Verify MFA Lambda
aws lambda create-function `
  --function-name $APP_NAME-verify-mfa `
  --runtime python3.11 `
  --role $AUTH_ROLE_ARN `
  --handler verify_mfa.lambda_handler `
  --zip-file fileb://verify_mfa.zip `
  --timeout 30 `
  --memory-size 256 `
  --environment "Variables={JWT_SECRET=REPLACE_WITH_SECURE_SECRET}" `
  --region $REGION

Write-Host "Auth Lambdas deployed!"
```

> **Generate a strong JWT secret:**
> ```powershell
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

---

## Step 9 — Deploy the ML Lambda Function

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
  --layers $TESSERACT_LAYER_ARN $ML_LAYER_ARN `
  --region $REGION

# Wait for function to be active
aws lambda wait function-active-v2 --function-name $APP_NAME-api --region $REGION
Write-Host "Lambda deployed!"
```

---

## Step 10 — Create API Gateway (HTTP API) with Auth Routes

```powershell
# Create the HTTP API
$API_ID = (aws apigatewayv2 create-api `
  --name $APP_NAME-api `
  --protocol-type HTTP `
  --cors-configuration "AllowOrigins=*,AllowMethods=GET,POST,PUT,DELETE,OPTIONS,AllowHeaders=Content-Type,Authorization" `
  --query ApiId --output text)

$API_URL = "https://$API_ID.execute-api.$REGION.amazonaws.com"
Write-Host "API URL: $API_URL"
```

### 10a. Create Lambda integrations

```powershell
# ML API integration
$ML_LAMBDA_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:$APP_NAME-api"
$ML_INTEGRATION_ID = (aws apigatewayv2 create-integration `
  --api-id $API_ID `
  --integration-type AWS_PROXY `
  --integration-uri $ML_LAMBDA_ARN `
  --payload-format-version 2.0 `
  --query IntegrationId --output text)

# Register integration
$REG_LAMBDA_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:$APP_NAME-register"
$REG_INTEGRATION_ID = (aws apigatewayv2 create-integration `
  --api-id $API_ID `
  --integration-type AWS_PROXY `
  --integration-uri $REG_LAMBDA_ARN `
  --payload-format-version 2.0 `
  --query IntegrationId --output text)

# Login integration
$LOGIN_LAMBDA_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:$APP_NAME-login"
$LOGIN_INTEGRATION_ID = (aws apigatewayv2 create-integration `
  --api-id $API_ID `
  --integration-type AWS_PROXY `
  --integration-uri $LOGIN_LAMBDA_ARN `
  --payload-format-version 2.0 `
  --query IntegrationId --output text)

# Verify MFA integration
$MFA_LAMBDA_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:$APP_NAME-verify-mfa"
$MFA_INTEGRATION_ID = (aws apigatewayv2 create-integration `
  --api-id $API_ID `
  --integration-type AWS_PROXY `
  --integration-uri $MFA_LAMBDA_ARN `
  --payload-format-version 2.0 `
  --query IntegrationId --output text)
```

### 10b. Create routes

```powershell
# Auth routes
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/auth/register" --target "integrations/$REG_INTEGRATION_ID"
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/auth/login" --target "integrations/$LOGIN_INTEGRATION_ID"
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/auth/verify-mfa" --target "integrations/$MFA_INTEGRATION_ID"

# ML API routes (catch-all for FastAPI)
aws apigatewayv2 create-route --api-id $API_ID --route-key "GET /health" --target "integrations/$ML_INTEGRATION_ID"
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/classify-contact" --target "integrations/$ML_INTEGRATION_ID"
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/classify-csv" --target "integrations/$ML_INTEGRATION_ID"
aws apigatewayv2 create-route --api-id $API_ID --route-key "POST /api/analyze-campaign" --target "integrations/$ML_INTEGRATION_ID"
```

### 10c. Create stage and grant permissions

```powershell
aws apigatewayv2 create-stage --api-id $API_ID --stage-name '$default' --auto-deploy

# Grant API Gateway permission to invoke all Lambdas
$SOURCE_ARN = "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"

aws lambda add-permission --function-name $APP_NAME-api --statement-id apigw --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn $SOURCE_ARN
aws lambda add-permission --function-name $APP_NAME-register --statement-id apigw --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn $SOURCE_ARN
aws lambda add-permission --function-name $APP_NAME-login --statement-id apigw --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn $SOURCE_ARN
aws lambda add-permission --function-name $APP_NAME-verify-mfa --statement-id apigw --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn $SOURCE_ARN
```

> In the AWS Console: API Gateway → Your API → API settings → add binary media types: `multipart/form-data`, `image/*`

### Test the APIs

```powershell
# Health check
Invoke-RestMethod "$API_URL/health"

# Register test
Invoke-RestMethod -Method POST "$API_URL/api/auth/register" `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"Test@1234","firstName":"Test","lastName":"User"}'
```

---

## Step 11 — Deploy React Frontend to S3 + CloudFront

### 11a. Build frontend with the API Gateway URL

```powershell
cd D:\shared\trial\whatsapp-campaign\frontend

# Create production env file
"VITE_API_URL=$API_URL" | Out-File .env.production -Encoding utf8

npm install
npm run build
```

> Make sure your React code uses `import.meta.env.VITE_API_URL` as the base URL for API calls.

### 11b. Create and upload to S3

```powershell
$FRONTEND_BUCKET = "$APP_NAME-frontend-$ACCOUNT_ID"

aws s3 mb s3://$FRONTEND_BUCKET --region $REGION

aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete
```

### 11c. Create CloudFront distribution

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

### 11d. Set S3 bucket policy for CloudFront

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

### 11e. Configure SPA routing (handle React Router 404s)

In AWS Console → CloudFront → Distribution → Error Pages:
- Error code `403` → Response code `200`, Response page `/index.html`
- Error code `404` → Response code `200`, Response page `/index.html`

---

## Step 12 — Verify Deployment

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
# Rebuild function code only (layers stay unchanged)
mkdir func-package
pip install fastapi pillow pytesseract boto3 mangum -t func-package/
Copy-Item main.py, csv_processor.py, handler.py func-package/
Copy-Item model_loader_lambda.py func-package/model_loader.py
Compress-Archive -Path func-package\* -DestinationPath lambda_function.zip -Force

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
| DynamoDB | 25 GB + 25 RCU/WCU | PAY_PER_REQUEST ~$1.25/1M writes |
| S3 | 5 GB storage | ~$0.023/GB/month |
| CloudFront | 1 TB transfer/month | ~$0.085/GB |
| Secrets Manager | — | $0.40/secret/month |
| CloudWatch | 5 GB logs | ~$0.50/GB |

**Estimated cost for low traffic: ~$0–5/month** (mostly within free tier).

---

## IAM Permissions Summary

The developer deploying this needs only:
- `lambda:*` — create/update functions
- `apigateway:*` — create HTTP API
- `dynamodb:*` — create users table
- `s3:*` — create buckets, upload files
- `cloudfront:*` — create distribution
- `iam:CreateRole`, `iam:AttachRolePolicy` — one-time role setup
- `logs:*` — view CloudWatch logs

No EC2, ECS, ALB, ElastiCache, or Cognito access is required.

---

## Auth Flow Summary

```
1. Register:  POST /api/auth/register  → creates user in DynamoDB, sends OTP via n8n
2. Login:     POST /api/auth/login     → validates password, sends OTP via n8n
3. Verify:    POST /api/auth/verify-mfa → validates OTP, returns JWT token
4. All subsequent API calls include:   Authorization: Bearer <jwt-token>
```

Secret used for n8n webhook authentication:
- ARN: `arn:aws:secretsmanager:us-east-1:976193236457:secret:opencrm/frappe-api-key-iQgSaZ`
- Name: `opencrm/frappe-api-key`
