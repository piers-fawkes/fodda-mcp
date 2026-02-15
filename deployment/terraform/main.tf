provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" { type = string }
variable "region" { type = string; default = "us-central1" }
variable "image_url" { type = string }
variable "fodda_api_url" { type = string; default = "https://api.fodda.ai" }
variable "fodda_mcp_secret" { type = string; sensitive = true }

resource "google_cloud_run_service" "fodda_mcp" {
  name     = "fodda-mcp"
  location = var.region

  template {
    spec {
      containers {
        image = var.image_url
        
        env {
          name  = "FODDA_API_URL"
          value = var.fodda_api_url
        }
        env {
          name  = "FODDA_MCP_SECRET"
          value = var.fodda_mcp_secret
        }
        env {
          name  = "NODE_ENV"
          value = "production"
        }
      }
    }
  }

  traffic {
    percent = 100
    latest_revision = true
  }
}

resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.fodda_mcp.name
  location = google_cloud_run_service.fodda_mcp.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_url" {
  value = google_cloud_run_service.fodda_mcp.status[0].url
}
