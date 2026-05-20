# Direct GitHub Deployment via GitHub Actions (CI/CD)

This guide helps you set up a fully automated deployment pipeline using your AWS **Access Key ID** and **Secret Access Key**. Every time you push or merge code to your `main` branch, GitHub Actions will automatically compile, build, test, and deploy both the backend (to AWS ECS Fargate) and frontend (to AWS S3 + CloudFront).

---

## Prerequisites (Must run once)
Before automating updates with GitHub Actions, the base AWS resources must exist. Follow **Steps 1 through 10** in [deploy.md](file:///c:/DARSHAN/whatsapp-campaign/deploy.md) to set up:
- The MongoDB Atlas Database
- The ElastiCache Redis Cluster
- The S3 buckets (Uploads & Frontend)
- The ECR repositories and ECS service (backend)
- The CloudFront Distribution (frontend)

Once those resources are running, configure GitHub to manage all deployments.

---

## Step 1 — Add Repository Secrets in GitHub

To allow GitHub to deploy securely to your AWS account, store your credentials as Repository Secrets.

1. Go to your repository on **GitHub**.
2. Click **Settings** (gear icon) → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add the following keys:

| Secret Name | Value Example | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | `AKIAIOSFODNN7EXAMPLE` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | Your AWS secret key |
| `AWS_REGION` | `ap-south-1` | The AWS region where your resources live |
| `ECR_BACKEND_REPOSITORY` | `whatsapp-campaign-backend` | Name of your ECR repository |
| `ECS_CLUSTER_NAME` | `whatsapp-campaign` | Name of your ECS Fargate cluster |
| `ECS_SERVICE_NAME` | `whatsapp-campaign-backend` | Name of the ECS service running your backend |
| `ECS_TASK_DEFINITION_FAMILY`| `whatsapp-campaign-backend` | Name of your registered task definition family |
| `S3_FRONTEND_BUCKET` | `whatsapp-campaign-frontend-123456789` | Name of the S3 bucket hosting frontend files |
| `CLOUDFRONT_DISTRIBUTION_ID`| `E1XXXXXXXXXXXX` | The ID of your CloudFront distribution |
| `VITE_API_URL` | `http://your-alb-dns-name.amazonaws.com/api` | The public URL of the backend API |

---

## Step 2 — Verify the Workflow File

I have created the workflow configuration file for you here:
[deploy.yml](file:///c:/DARSHAN/whatsapp-campaign/.github/workflows/deploy.yml)

It performs the following tasks:
- **Backend Job**: Checkout → Configure AWS credentials → Build and push the Docker image to ECR → Render task definition → Deploy to ECS Fargate.
- **Frontend Job**: Checkout → Install & Build SPA using production `VITE_API_URL` → Deploy files to S3 bucket → Invalidate CloudFront CDN cache (making updates instantly live).

---

## Step 3 — Push Code to Trigger the Deployment

Commit the new configuration files and push them to your main branch:

```bash
git add .
git commit -m "chore: setup github actions deployment workflow for aws"
git push origin main
```

---

## Step 4 — Monitor the Build

1. Go to your GitHub repository.
2. Click on the **Actions** tab.
3. You will see your commit running under the "Deploy to AWS" workflow.
4. Click on the run to view live build and deployment logs for both the frontend and backend.
5. Once completed, your application updates will be live and active on your CloudFront distribution URL!
