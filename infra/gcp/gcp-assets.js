'use strict';
module.exports = {
  "main.tf": `provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "current" {
  project_id = var.project_id
}

# Enable required APIs
resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "sqladmin" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "vpcaccess" {
  service            = "vpcaccess.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# Service account for Cloud Run
resource "google_service_account" "run" {
  account_id   = "\${var.service_name}-run"
  display_name = "CDM Cloud Run"
}

# VPC connector for Cloud SQL access
resource "google_vpc_access_connector" "connector" {
  name          = "\${var.service_name}-connector"
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 10
  depends_on    = [google_project_service.vpcaccess]
}

# Artifact Registry repository for container images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "\${var.service_name}-images"
  format        = "DOCKER"
  description   = "CDM application container images"
  depends_on    = [google_project_service.artifactregistry]
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "postgres" {
  name             = "\${var.service_name}-db"
  database_version = var.database_version
  region           = var.region
  settings {
    tier              = var.database_tier
    availability_type = var.database_availability
    disk_type         = "PD_SSD"
    disk_size         = var.database_disk_gb
    disk_autoresize   = true
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
    }
    ip_configuration {
      ipv4_enabled = true
      require_ssl  = false
    }
    insights_config {
      query_insights_enabled = true
    }
  }
  deletion_protection = var.deletion_protection
  depends_on          = [google_project_service.sqladmin]
}

resource "google_sql_database" "cdm" {
  name     = "cdm"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "cdm" {
  name     = "cdm"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# Database URL secret (constructed from Cloud SQL details)
locals {
  db_url = "postgresql://\${google_sql_user.cdm.name}:\${random_password.db_password.result}@/\${google_sql_database.cdm.name}?host=/cloudsql/\${var.project_id}:\${var.region}:\${google_sql_database_instance.postgres.name}"
}

# Secret Manager secrets
locals {
  secrets = {
    DATABASE_URL         = local.db_url
    NEXTAUTH_SECRET      = var.nextauth_secret
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    GEMINI_API_KEY       = var.gemini_api_key
    ANTHROPIC_API_KEY    = var.anthropic_api_key
    SKRIBBY_API_KEY      = var.skribby_api_key
    SLACK_WEBHOOK_URL    = var.slack_webhook_url
    WEBHOOK_SECRET       = var.webhook_secret
    SKRIBBY_BASE_URL     = "https://platform.skribby.io/api/v1"
    APP_URL              = var.app_url
    TEST_CALL_ENABLED    = "true"
  }
}

resource "google_secret_manager_secret" "app" {
  for_each   = local.secrets
  secret_id  = "\${var.service_name}-\${lower(each.key)}"
  replication { auto {} }
  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "app" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}

# Grant Cloud Run service account access to secrets
resource "google_project_iam_member" "secret_access" {
  for_each = local.secrets
  project  = var.project_id
  role     = "roles/secretmanager.secretAccessor"
  member   = "serviceAccount:\${google_service_account.run.email}"
}

# Grant Cloud Run service account access to Cloud SQL
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:\${google_service_account.run.email}"
}

# Grant Cloud Build service account permissions for deploying
resource "google_project_iam_member" "cloudbuild_run_admin" {
  project    = var.project_id
  role       = "roles/run.admin"
  member     = "serviceAccount:\${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.cloudbuild]
}
resource "google_project_iam_member" "cloudbuild_iam_admin" {
  project    = var.project_id
  role       = "roles/iam.serviceAccountUser"
  member     = "serviceAccount:\${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.cloudbuild]
}

# Cloud Run service
resource "google_cloud_run_v2_service" "app" {
  name                 = var.service_name
  location             = var.region
  ingress              = var.allow_public_ingress ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection  = var.deletion_protection
  depends_on           = [google_project_service.run, google_vpc_access_connector.connector, google_sql_database_instance.postgres]

  template {
    service_account = google_service_account.run.email
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = var.container_image
      ports { container_port = 3000 }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "APP_URL"
        value = var.app_url
      }
      env {
        name  = "NEXTAUTH_URL"
        value = var.app_url
      }
      dynamic "env" {
        for_each = local.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app[env.key].secret_id
              version = "latest"
            }
          }
        }
      }
      resources {
        limits            = { cpu = "1000m", memory = "512Mi" }
        startup_cpu_boost = true
      }
      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = 30
        http_get {
          path = "/api/health"
          port = 3000
        }
      }
      liveness_probe {
        initial_delay_seconds = 15
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 5
        http_get {
          path = "/api/health"
          port = 3000
        }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
  }
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
`,
  "variables.tf": `variable "project_id" { type = string description = "Customer-owned Google Cloud project ID" }
variable "region" { type = string description = "Customer-approved Google Cloud region" default = "us-central1" }
variable "service_name" { type = string description = "Cloud Run service and resource name prefix" default = "cdm" }
variable "container_image" { type = string description = "Approved CDM container image" default = "ghcr.io/lalith0192837465-create/cdmai:latest" }
variable "app_url" { type = string description = "Final app URL; first apply may use the Cloud Run URL output, then apply again with it" default = "" }
variable "database_version" { type = string description = "Customer-approved Cloud SQL PostgreSQL version" default = "POSTGRES_16" }
variable "database_tier" { type = string description = "Customer-approved Cloud SQL machine tier" default = "db-f1-micro" }
variable "database_availability" { type = string description = "ZONAL or REGIONAL after cost/reliability review" default = "ZONAL" validation { condition = contains(["ZONAL", "REGIONAL"], var.database_availability) error_message = "Use ZONAL or REGIONAL." } }
variable "database_disk_gb" { type = number description = "Initial Cloud SQL SSD disk size in GB" default = 10 }
variable "max_instances" { type = number description = "Maximum Cloud Run instances" default = 3 }
variable "deletion_protection" { type = bool description = "Protect production service/database from accidental deletion" default = true }
variable "allow_public_ingress" { type = bool description = "Allow traffic from the internet to reach Cloud Run (IAM authorization is separate)" default = true }
variable "allow_unauthenticated" { type = bool description = "Allow unauthenticated requests at Cloud Run layer; customer must separately review app route access" default = true }
variable "nextauth_secret" { type = string sensitive = true description = "Customer-generated NextAuth session secret" }
variable "google_client_id" { type = string sensitive = true description = "Google OAuth client ID" }
variable "google_client_secret" { type = string sensitive = true description = "Google OAuth client secret" }
variable "gemini_api_key" { type = string sensitive = true description = "Gemini API key" }
variable "anthropic_api_key" { type = string sensitive = true description = "Anthropic API key (may be empty if unused)" default = "" }
variable "skribby_api_key" { type = string sensitive = true description = "Skribby API key (may be empty if unused)" default = "" }
variable "slack_webhook_url" { type = string sensitive = true description = "Slack incoming webhook URL (may be empty if unused)" default = "" }
variable "webhook_secret" { type = string sensitive = true description = "Webhook verification secret" }
`,
  "outputs.tf": `output "service_url" { value = google_cloud_run_v2_service.app.uri description = "Cloud Run URL; set as app_url and Google OAuth redirect base before the follow-up apply" }
output "service_account_email" { value = google_service_account.run.email description = "Customer-owned Cloud Run runtime identity" }
output "cloud_sql_connection_name" { value = google_sql_database_instance.postgres.connection_name description = "Cloud SQL connection name mounted at /cloudsql" }
output "secret_names" { value = { for k, v in google_secret_manager_secret.app : k => v.secret_id } description = "Secret Manager secret IDs (not secret values)" }
`,
  "versions.tf": `terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
`,
  ".gitignore": `# Terraform
*.tfstate
*.tfstate.*
*.tfvars
*.tfvars.json
.terraform/
.terraform.lock.hcl

# IDE
.vscode/
.idea/
*.swp
`
};
