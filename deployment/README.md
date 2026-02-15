# Fodda MCP - Customer Deployment Guide

This directory contains templates and scripts for deploying the Fodda MCP server in your own infrastructure.

## Deployment Options

### 1. Docker Compose
Simplest option for local testing or single-server deployment.
- **File**: `docker-compose.yml`
- **Usage**:
  ```bash
  docker compose up -d
  ```

### 2. Kubernetes
Standard manifest for deploying to any K8s cluster (GKE, EKS, AKS).
- **Directory**: `k8s/`
- **Usage**:
  ```bash
  kubectl apply -f k8s/deployment.yaml
  ```

### 3. Google Cloud Run (Terraform)
Serverless deployment on Google Cloud.
- **Directory**: `terraform/`
- **Usage**:
  ```bash
  cd terraform
  terraform init
  terraform apply
  ```

## Configuration
All deployments require the following environment variables:
- `FODDA_API_URL`: URL to the Fodda API (e.g., `https://api.fodda.ai`)
- `FODDA_MCP_SECRET`: Shared secret for HMAC signing (must match Fodda API config).
- `PORT`: Server port (default 8080).
