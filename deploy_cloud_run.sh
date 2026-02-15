#!/bin/bash
# deploy_cloud_run.sh - Deploy Fodda MCP to Google Cloud Run

PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="fodda-mcp"
REGION="us-central1"

echo "Deploying $SERVICE_NAME to project $PROJECT_ID in $REGION..."

# Build the image using Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME .

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "FODDA_API_URL=https://api.fodda.ai"

echo "Deployment complete!"
gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)'
