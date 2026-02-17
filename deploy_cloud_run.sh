#!/bin/bash
# deploy_cloud_run.sh - Deploy Fodda MCP to Google Cloud Run

PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="fodda-mcp"
REGION="us-central1"

echo "Deploying $SERVICE_NAME to project $PROJECT_ID in $REGION..."

# Build the image using Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME .

# Deploy to Cloud Run with health check and secret management
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "FODDA_API_URL=https://api.fodda.ai,NODE_ENV=production" \
  --set-secrets "FODDA_MCP_SECRET=FODDA_MCP_SECRET:latest,FODDA_API_KEY=FODDA_API_KEY:latest" \
  --cpu-boost \
  --port 8080 \
  --min-instances 0 \
  --max-instances 10

echo "Deployment complete!"
gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)'
