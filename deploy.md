# WhatsApp Campaign Platform — AWS Deployment Guide

## Architecture

```
Users
  │
  ▼
CloudFront ──────────── S3 (React frontend static files)
  │ (API calls to /api/*)
  ▼
Application Load Balancer (ALB)
  │
  ├── ECS Fargate — Node.js Backend (port 5000)
  │       │
  │       ├── MongoDB Atlas (managed, outside AWS) OR DocumentDB
  │       ├── ElastiCache Redis (AWS managed)
  │       └── S3 bucket (media uploads)
  │
  └── (Optional) ECS Fargate — Python ML Service (port 8000)
```

**Services used:**
| Component | AWS Service |
|---|---|
| React Frontend | S3 + CloudFront |
| Node.js Backend | ECS Fargate |
| MongoDB | MongoDB Atlas (recommended) or AWS DocumentDB |
| Redis / Bull Queue | AWS ElastiCache (Redis) |
| Media Uploads | Amazon S3 |
| Container Registry | Amazon ECR |
| Secrets | AWS Secrets Manager |
| Logs | Amazon CloudWatch |

---

## Prerequisites

### Install AWS CLI
```powershell
# Windows — download and run the installer
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

### Configure AWS credentials
```powershell
aws configure
# AWS Access Key ID:     <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region name:   ap-south-1        ← Mumbai (change to your preferred region)
# Default output format: json
```

### Verify configuration
```powershell
aws sts get-caller-identity
# Should print your Account ID, User ID, and ARN
```

### Install Docker Desktop (if not already installed)
Download from https://www.docker.com/products/docker-desktop/

---

## Step 1 — Set Your Variables

Replace these values throughout every command below:

```powershell
# Run these in PowerShell before the rest of the commands
$REGION      = "ap-south-1"
$ACCOUNT_ID  = (aws sts get-caller-identity --query Account --output text)
$APP_NAME    = "whatsapp-campaign"
$ECR_BACKEND = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$APP_NAME-backend"
$ECR_FRONTEND= "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$APP_NAME-frontend"

Write-Host "Account ID: $ACCOUNT_ID"
Write-Host "Region:     $REGION"
```

---

## Step 2 — MongoDB (Atlas — Recommended)

> AWS DocumentDB is an alternative but is more expensive and requires a VPC. MongoDB Atlas free tier works perfectly.

1. Go to https://cloud.mongodb.com and create a free M0 cluster
2. Under **Database Access** → create a user with password
3. Under **Network Access** → Add IP: `0.0.0.0/0` (allow all — ECS tasks use dynamic IPs)
4. Click **Connect** → **Drivers** → copy the connection string:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/whatsapp_campaign_platform
   ```
5. Save this — it is your `MONGODB_URI`

---

## Step 3 — Create S3 Buckets

### 3a. Media uploads bucket (backend)
```powershell
aws s3 mb s3://$APP_NAME-uploads-$ACCOUNT_ID --region $REGION

# Block public access (backend serves files via presigned URLs or proxies)
aws s3api put-public-access-block `
  --bucket $APP_NAME-uploads-$ACCOUNT_ID `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 3b. Frontend static hosting bucket
```powershell
aws s3 mb s3://$APP_NAME-frontend-$ACCOUNT_ID --region $REGION
```

---

## Step 4 — Create ElastiCache Redis

```powershell
# Create a subnet group (use default VPC subnets)
$SUBNETS = (aws ec2 describe-subnets --query "Subnets[?DefaultForAz==\`true\`].SubnetId" --output text) -split "`t"
$SUBNET_LIST = $SUBNETS -join " "

aws elasticache create-subnet-group `
  --cache-subnet-group-name $APP_NAME-redis-subnet `
  --cache-subnet-group-description "WhatsApp Campaign Redis Subnet" `
  --subnet-ids $SUBNETS

# Create Redis cluster (cache.t3.micro = free tier eligible)
aws elasticache create-cache-cluster `
  --cache-cluster-id $APP_NAME-redis `
  --cache-node-type cache.t3.micro `
  --engine redis `
  --num-cache-nodes 1 `
  --cache-subnet-group-name $APP_NAME-redis-subnet `
  --region $REGION

# Wait for it to be available (2-3 minutes)
aws elasticache wait cache-cluster-available --cache-cluster-id $APP_NAME-redis

# Get the Redis endpoint
aws elasticache describe-cache-clusters `
  --cache-cluster-id $APP_NAME-redis `
  --show-cache-node-info `
  --query "CacheClusters[0].CacheNodes[0].Endpoint.Address" `
  --output text
# Save this as your REDIS_HOST e.g. whatsapp-campaign-redis.xxxxx.0001.apse1.cache.amazonaws.com
```

Your Redis URL will be: `redis://<REDIS_HOST>:6379`

---

## Step 5 — Store Secrets in AWS Secrets Manager

```powershell
# Create the secret (replace ALL placeholder values)
aws secretsmanager create-secret `
  --name "$APP_NAME/production" `
  --region $REGION `
  --secret-string '{
    "NODE_ENV":                "production",
    "PORT":                    "5000",
    "MONGODB_URI":             "mongodb+srv://user:pass@cluster.mongodb.net/whatsapp_campaign_platform",
    "REDIS_URL":               "redis://YOUR_ELASTICACHE_HOST:6379",
    "JWT_SECRET":              "REPLACE_WITH_64_RANDOM_CHARS",
    "JWT_REFRESH_SECRET":      "REPLACE_WITH_64_DIFFERENT_RANDOM_CHARS",
    "JWT_EXPIRES_IN":          "24h",
    "JWT_REFRESH_EXPIRES_IN":  "7d",
    "TWILIO_ACCOUNT_SID":      "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "TWILIO_AUTH_TOKEN":       "your_twilio_auth_token",
    "TWILIO_WHATSAPP_FROM":    "whatsapp:+14155238886",
    "WEBHOOK_SECRET":          "REPLACE_WITH_32_RANDOM_CHARS",
    "ALLOWED_ORIGINS":         "https://YOUR_CLOUDFRONT_DOMAIN",
    "PUBLIC_APP_URL":          "https://YOUR_ALB_DNS_NAME",
    "UPLOAD_DIR":              "uploads",
    "MAX_FILE_SIZE_MB":        "5",
    "RATE_LIMIT_WINDOW_MS":    "900000",
    "RATE_LIMIT_MAX_REQUESTS": "100",
    "LOG_LEVEL":               "info",
    "LOG_DIR":                 "logs"
  }'
```

> **Generate strong secrets:**
> ```powershell
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## Step 6 — Push Docker Images to ECR

### 6a. Create ECR repositories
```powershell
aws ecr create-repository --repository-name $APP_NAME-backend  --region $REGION
aws ecr create-repository --repository-name $APP_NAME-frontend --region $REGION
```

### 6b. Login to ECR
```powershell
aws ecr get-login-password --region $REGION | `
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
```

### 6c. Build and push backend image
```powershell
cd C:\DARSHAN\whatsapp-campaign\node-backend

docker build -t $APP_NAME-backend .
docker tag  $APP_NAME-backend:latest $ECR_BACKEND:latest
docker push $ECR_BACKEND:latest
```

### 6d. Build and push frontend image
```powershell
cd C:\DARSHAN\whatsapp-campaign\frontend

# Replace with your actual ALB DNS name after Step 8
$BACKEND_URL = "http://YOUR_ALB_DNS_NAME/api"

docker build --build-arg VITE_API_URL=$BACKEND_URL -t $APP_NAME-frontend .
docker tag  $APP_NAME-frontend:latest $ECR_FRONTEND:latest
docker push $ECR_FRONTEND:latest
```

---

## Step 7 — Create ECS Cluster

```powershell
aws ecs create-cluster `
  --cluster-name $APP_NAME `
  --capacity-providers FARGATE `
  --region $REGION
```

### Create IAM roles for ECS

```powershell
# Task execution role (pull images + read secrets)
aws iam create-role `
  --role-name $APP_NAME-ecs-execution-role `
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

aws iam attach-role-policy `
  --role-name $APP_NAME-ecs-execution-role `
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam attach-role-policy `
  --role-name $APP_NAME-ecs-execution-role `
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

---

## Step 8 — Create Application Load Balancer

```powershell
# Get default VPC and subnets
$VPC_ID  = (aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
$SUBNETS = (aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=defaultForAz,Values=true" `
             --query "Subnets[*].SubnetId" --output text) -split "`t"

# Create security group for ALB
$ALB_SG = (aws ec2 create-security-group `
  --group-name $APP_NAME-alb-sg `
  --description "ALB Security Group" `
  --vpc-id $VPC_ID `
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0

# Create the ALB
$ALB_ARN = (aws elbv2 create-load-balancer `
  --name $APP_NAME-alb `
  --subnets $SUBNETS `
  --security-groups $ALB_SG `
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

$ALB_DNS = (aws elbv2 describe-load-balancers `
  --load-balancer-arns $ALB_ARN `
  --query "LoadBalancers[0].DNSName" --output text)

Write-Host "ALB DNS: $ALB_DNS"
# ← Use this as PUBLIC_APP_URL and update VITE_API_URL in the frontend build

# Create target group for backend (port 5000)
$TG_ARN = (aws elbv2 create-target-group `
  --name $APP_NAME-backend-tg `
  --protocol HTTP --port 5000 `
  --vpc-id $VPC_ID `
  --target-type ip `
  --health-check-path /api/health `
  --query "TargetGroups[0].TargetGroupArn" --output text)

# Create listener
aws elbv2 create-listener `
  --load-balancer-arn $ALB_ARN `
  --protocol HTTP --port 80 `
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

---

## Step 9 — Register ECS Task Definition (Backend)

```powershell
# Replace ACCOUNT_ID, REGION, and SECRET_ARN placeholders
$SECRET_ARN = (aws secretsmanager describe-secret --secret-id "$APP_NAME/production" --query ARN --output text)

$TASK_DEF = @"
{
  "family": "$APP_NAME-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/$APP_NAME-ecs-execution-role",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "${ECR_BACKEND}:latest",
      "portMappings": [{"containerPort": 5000, "protocol": "tcp"}],
      "essential": true,
      "secrets": [
        {"name": "NODE_ENV",                "valueFrom": "${SECRET_ARN}:NODE_ENV::"},
        {"name": "MONGODB_URI",             "valueFrom": "${SECRET_ARN}:MONGODB_URI::"},
        {"name": "REDIS_URL",               "valueFrom": "${SECRET_ARN}:REDIS_URL::"},
        {"name": "JWT_SECRET",              "valueFrom": "${SECRET_ARN}:JWT_SECRET::"},
        {"name": "JWT_REFRESH_SECRET",      "valueFrom": "${SECRET_ARN}:JWT_REFRESH_SECRET::"},
        {"name": "TWILIO_ACCOUNT_SID",      "valueFrom": "${SECRET_ARN}:TWILIO_ACCOUNT_SID::"},
        {"name": "TWILIO_AUTH_TOKEN",       "valueFrom": "${SECRET_ARN}:TWILIO_AUTH_TOKEN::"},
        {"name": "TWILIO_WHATSAPP_FROM",    "valueFrom": "${SECRET_ARN}:TWILIO_WHATSAPP_FROM::"},
        {"name": "ALLOWED_ORIGINS",         "valueFrom": "${SECRET_ARN}:ALLOWED_ORIGINS::"},
        {"name": "PUBLIC_APP_URL",          "valueFrom": "${SECRET_ARN}:PUBLIC_APP_URL::"},
        {"name": "WEBHOOK_SECRET",          "valueFrom": "${SECRET_ARN}:WEBHOOK_SECRET::"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$APP_NAME-backend",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:5000/api/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 30
      }
    }
  ]
}
"@

$TASK_DEF | Out-File -FilePath task-def-backend.json -Encoding utf8
aws ecs register-task-definition --cli-input-json file://task-def-backend.json --region $REGION

# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/$APP_NAME-backend --region $REGION
```

---

## Step 10 — Deploy ECS Service

```powershell
# Security group for ECS tasks (allow traffic from ALB only)
$ECS_SG = (aws ec2 create-security-group `
  --group-name $APP_NAME-ecs-sg `
  --description "ECS Tasks Security Group" `
  --vpc-id $VPC_ID `
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress `
  --group-id $ECS_SG --protocol tcp --port 5000 --source-group $ALB_SG

$SUBNET_CSV = $SUBNETS -join ","

aws ecs create-service `
  --cluster $APP_NAME `
  --service-name $APP_NAME-backend `
  --task-definition $APP_NAME-backend `
  --desired-count 1 `
  --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_CSV],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" `
  --load-balancers "targetGroupArn=$TG_ARN,containerName=backend,containerPort=5000" `
  --region $REGION

# Watch deployment status
aws ecs wait services-stable --cluster $APP_NAME --services $APP_NAME-backend --region $REGION
Write-Host "Backend deployed! API: http://$ALB_DNS/api/health"
```

---

## Step 11 — Deploy Frontend to S3 + CloudFront

### 11a. Rebuild frontend with real ALB URL
```powershell
cd C:\DARSHAN\whatsapp-campaign\frontend

# Use the actual ALB DNS from Step 8
$BACKEND_URL = "http://$ALB_DNS/api"

docker build --build-arg VITE_API_URL=$BACKEND_URL -t $APP_NAME-frontend .

# Extract dist/ from the Docker image
$CONTAINER_ID = (docker create $APP_NAME-frontend)
docker cp ${CONTAINER_ID}:/usr/share/nginx/html ./dist-prod
docker rm $CONTAINER_ID
```

### 11b. Upload to S3
```powershell
$FRONTEND_BUCKET = "$APP_NAME-frontend-$ACCOUNT_ID"

aws s3 sync ./dist-prod s3://$FRONTEND_BUCKET --delete

# Set bucket policy for CloudFront access (OAC)
aws s3api put-bucket-policy --bucket $FRONTEND_BUCKET --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Principal\": {\"Service\": \"cloudfront.amazonaws.com\"},
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::$FRONTEND_BUCKET/*\"
  }]
}"
```

### 11c. Create CloudFront distribution
```powershell
aws cloudfront create-distribution --distribution-config "{
  \"CallerReference\": \"$APP_NAME-$(Get-Date -Format yyyyMMddHHmmss)\",
  \"Origins\": {
    \"Quantity\": 1,
    \"Items\": [{
      \"Id\": \"s3-origin\",
      \"DomainName\": \"$FRONTEND_BUCKET.s3.$REGION.amazonaws.com\",
      \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"}
    }]
  },
  \"DefaultCacheBehavior\": {
    \"TargetOriginId\": \"s3-origin\",
    \"ViewerProtocolPolicy\": \"redirect-to-https\",
    \"AllowedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"]},
    \"ForwardedValues\": {\"QueryString\": false, \"Cookies\": {\"Forward\": \"none\"}}
  },
  \"CustomErrorResponses\": {
    \"Quantity\": 1,
    \"Items\": [{
      \"ErrorCode\": 403,
      \"ResponseCode\": \"200\",
      \"ResponsePagePath\": \"/index.html\"
    }]
  },
  \"DefaultRootObject\": \"index.html\",
  \"Enabled\": true,
  \"Comment\": \"$APP_NAME frontend\"
}"
# Note the DomainName (e.g. xxxx.cloudfront.net) — this is your app URL
```

---

## Step 12 — Update CORS & Secrets with Real URLs

```powershell
# Update the secret with the real CloudFront domain
$CF_DOMAIN = "https://YOUR_XXXX.cloudfront.net"

aws secretsmanager update-secret `
  --secret-id "$APP_NAME/production" `
  --secret-string "{
    \"ALLOWED_ORIGINS\": \"$CF_DOMAIN\",
    \"PUBLIC_APP_URL\": \"http://$ALB_DNS\"
  }"

# Force ECS to redeploy with new secrets
aws ecs update-service `
  --cluster $APP_NAME `
  --service $APP_NAME-backend `
  --force-new-deployment `
  --region $REGION
```

---

## Step 13 — Verify Deployment

```powershell
# Backend health check
Invoke-RestMethod "http://$ALB_DNS/api/health"
# Expected: { success: true, status: "healthy" }

# Frontend — open in browser
Start-Process "https://YOUR_XXXX.cloudfront.net"
```

---

## Final Architecture

```
Browser
  │
  ▼
CloudFront (HTTPS) ──── S3 (React SPA)
  │ /api/* → proxied manually via VITE_API_URL
  ▼
ALB (HTTP :80)
  │
  ▼
ECS Fargate — Node.js backend (:5000)
  │
  ├── MongoDB Atlas (mongodb+srv://...)
  ├── ElastiCache Redis (redis://...)
  └── S3 (media uploads — future)
```

---

## Cost Estimate (Mumbai — ap-south-1)

| Service | Spec | Est. Monthly Cost |
|---|---|---|
| ECS Fargate | 0.5 vCPU, 1 GB, 1 task | ~$8–12 |
| ALB | 1 LCU | ~$18 |
| ElastiCache | cache.t3.micro | ~$12 |
| MongoDB Atlas | M0 Free Tier | **$0** |
| S3 + CloudFront | Low traffic | ~$1–2 |
| ECR | Image storage | ~$1 |
| **Total** | | **~$40–45/month** |

> To reduce cost: use a single `t3.micro` EC2 instance instead of Fargate — reduces to ~$10–15/month.

---

## Updating the App (Redeploy)

```powershell
# 1. Rebuild and push new backend image
cd C:\DARSHAN\whatsapp-campaign\node-backend
docker build -t $APP_NAME-backend .
docker tag $APP_NAME-backend:latest $ECR_BACKEND:latest
docker push $ECR_BACKEND:latest

# 2. Force ECS to pull new image
aws ecs update-service `
  --cluster $APP_NAME `
  --service $APP_NAME-backend `
  --force-new-deployment `
  --region $REGION
```
