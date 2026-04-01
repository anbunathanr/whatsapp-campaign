# AWS Serverless Deployment Guide

## Architecture Overview

| Component | AWS Service |
|---|---|
| FastAPI Backend | AWS Lambda + API Gateway |
| ML Model & artifacts | Amazon S3 |
| React Frontend | Amazon S3 + CloudFront |
| OCR (Tesseract) | AWS Lambda Layer |
| Image/CSV uploads | API Gateway (binary support) |

> **Note on Tesseract OCR:** Lambda does not include Tesseract by default. You must package it as a Lambda Layer (see Step 3).

---

## Prerequisites

- AWS CLI configured (`aws configure`)
- Python 3.11, Node.js 18+
- Docker (for building the Lambda layer)
- AWS account with permissions for Lambda, API Gateway, S3, CloudFront, IAM
- aws configure 
- enter your access key, secret key, us-east-1, json

---

## Step 1 — Train & Export the Model Locally

```bash
python generate_data.py
python train_model.py
```

This produces:
- `industry_classifier_model_v2.pkl`
- `industry_classifier_model_v2_classes.joblib`
- `label_encoder.joblib`

---

## Step 2 — Upload Model Artifacts to S3

```bash
aws s3 mb s3://whatsapp-campaign-models

aws s3 cp industry_classifier_model_v2.pkl s3://whatsapp-campaign-models/
aws s3 cp industry_classifier_model_v2_classes.joblib s3://whatsapp-campaign-models/
aws s3 cp label_encoder.joblib s3://whatsapp-campaign-models/
```

---

## Step 3 — Build the Tesseract Lambda Layer

Lambda has no Tesseract binary. Build it using Docker to match the Lambda runtime environment.

```bash
docker run --rm -v "$PWD/layer":/layer amazonlinux:2 bash -c "
  yum install -y tesseract && \
  mkdir -p /layer/bin /layer/lib && \
  cp /usr/bin/tesseract /layer/bin/ && \
  cp -r /usr/share/tesseract /layer/ && \
  ldd /usr/bin/tesseract | grep '=> /' | awk '{print \$3}' | xargs -I{} cp {} /layer/lib/
"

cd layer && zip -r ../tesseract-layer.zip . && cd ..

aws lambda publish-layer-version \
  --layer-name tesseract-ocr \
  --zip-file fileb://tesseract-layer.zip \
  --compatible-runtimes python3.11
```

Note the `LayerVersionArn` from the output — you'll need it in Step 5.

---

## Step 4 — Prepare the Lambda Deployment Package

### 4a. Update `model_loader.py` to load from S3

Replace the local file loading logic with S3 download on cold start:

```python
import joblib, boto3, os, io

S3_BUCKET = os.environ.get("MODEL_BUCKET", "whatsapp-campaign-models")

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
            cls._classes = cls._load_classes(s3)
        return cls._model

    @classmethod
    def _load_classes(cls, s3):
        buf = io.BytesIO()
        s3.download_fileobj(S3_BUCKET, "industry_classifier_model_v2_classes.joblib", buf)
        buf.seek(0)
        return joblib.load(buf)

    @classmethod
    def get_classes(cls):
        return cls._classes

def get_model(): return ModelLoader.get_model()
def get_classes(): return ModelLoader.get_classes()
```

### 4b. Add Mangum adapter

Mangum wraps FastAPI for Lambda's event format.

```bash
pip install mangum -t package/
```

### 4c. Add handler entry point — `handler.py`

```python
from mangum import Mangum
from main import app

handler = Mangum(app, lifespan="off")
```

### 4d. Package dependencies

```bash
pip install fastapi uvicorn scikit-learn xgboost pandas numpy joblib \
    pillow pytesseract boto3 mangum -t package/

cp main.py csv_processor.py model_loader.py handler.py package/
cd package && zip -r ../lambda_function.zip . && cd ..
```

---

## Step 5 — Create the Lambda Function

### 5a. Create IAM role

```bash
aws iam create-role \
  --role-name whatsapp-campaign-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

aws iam attach-role-policy \
  --role-name whatsapp-campaign-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name whatsapp-campaign-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```

### 5b. Deploy Lambda

Replace `<ACCOUNT_ID>` and `<LAYER_ARN>` with your values.

```bash
aws lambda create-function \
  --function-name whatsapp-campaign-api \
  --runtime python3.11 \
  --role arn:aws:iam::<ACCOUNT_ID>:role/whatsapp-campaign-lambda-role \
  --handler handler.handler \
  --zip-file fileb://lambda_function.zip \
  --timeout 60 \
  --memory-size 1024 \
  --environment Variables="{MODEL_BUCKET=whatsapp-campaign-models}" \
  --layers <LAYER_ARN>
```

> Increase `--memory-size` to `2048` if model loading times out.

---

## Step 6 — Create API Gateway (HTTP API)

```bash
aws apigatewayv2 create-api \
  --name whatsapp-campaign-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:whatsapp-campaign-api
```

Note the `ApiEndpoint` from the output — this is your backend URL.

Grant API Gateway permission to invoke Lambda:

```bash
aws lambda add-permission \
  --function-name whatsapp-campaign-api \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com
```

Enable binary media types for image/CSV uploads in API Gateway:
- Go to AWS Console → API Gateway → your API → Settings
- Add binary media types: `multipart/form-data`, `image/*`, `application/octet-stream`

---

## Step 7 — Deploy the React Frontend

### 7a. Build with the API Gateway URL

```bash
cd frontend
echo "VITE_API_URL=https://<API_ID>.execute-api.<REGION>.amazonaws.com" > .env.production
npm install
npm run build
```

Update all `axios` base URLs in the frontend source to use `import.meta.env.VITE_API_URL` if not already done.

### 7b. Create S3 bucket for static hosting

```bash
aws s3 mb s3://whatsapp-campaign-frontend

aws s3 website s3://whatsapp-campaign-frontend \
  --index-document index.html \
  --error-document index.html

aws s3 sync dist/ s3://whatsapp-campaign-frontend --delete
```

### 7c. Create CloudFront distribution

```bash
aws cloudfront create-distribution \
  --origin-domain-name whatsapp-campaign-frontend.s3-website-<REGION>.amazonaws.com \
  --default-root-object index.html
```

Note the `DomainName` from the output — this is your frontend URL.

---

## Step 8 — Update CORS in `main.py`

Replace `allow_origins=["*"]` with your CloudFront domain:

```python
allow_origins=["https://<CLOUDFRONT_DOMAIN>"]
```

Then redeploy Lambda:

```bash
cd package && zip -r ../lambda_function.zip . && cd ..
aws lambda update-function-code \
  --function-name whatsapp-campaign-api \
  --zip-file fileb://lambda_function.zip
```

---

## Final Architecture

```
User Browser
    │
    ▼
CloudFront (React SPA)
    │  (API calls)
    ▼
API Gateway (HTTP API)
    │
    ▼
Lambda (FastAPI + Mangum)
    │                  │
    ▼                  ▼
S3 (ML models)    Tesseract Layer
```

---

## Cost Estimate (Pay-per-use)

| Service | Free Tier | Beyond Free Tier |
|---|---|---|
| Lambda | 1M requests/month | ~$0.20 per 1M requests |
| API Gateway | 1M requests/month | ~$1.00 per 1M requests |
| S3 | 5 GB storage | ~$0.023/GB/month |
| CloudFront | 1 TB transfer/month | ~$0.0085/GB |

For low-to-medium traffic, this deployment runs near **$0/month** within free tier limits.

---

## Updating the Model

To retrain and redeploy the model without touching Lambda:

```bash
python generate_data.py && python train_model.py
aws s3 cp industry_classifier_model_v2.pkl s3://whatsapp-campaign-models/
aws s3 cp industry_classifier_model_v2_classes.joblib s3://whatsapp-campaign-models/
```

Lambda will pick up the new model on the next cold start automatically.
