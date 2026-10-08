provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "run" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "secretmanager" {
  service = "secretmanager.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "sqladmin" {
  service = "sqladmin.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "artifactregistry" {
  service = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "vpcaccess" {
  service = "vpcaccess.googleapis.com"
  disable_on_destroy = false
}
resource "google_project_service" "cloudbuild" {
  service = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# Service account for Cloud Run
resource "google_service_account" "run" {
  account_id   = "${var.service_name}-run"
  display_name = "CDM Cloud Run"
}

# VPC connector for Cloud SQL access
resource "google_vpc_access_connector" "connector" {
  name           = "${var.service_name}-connector"
  region         = var.region
  network        = "default"
  ip_cidr_range  = "10.8.0.0/28"
  min_instances  = 2
  max_instances  = 10
  depends_on = [google_project_service.vpcaccess]
}

# Artifact Registry repository for container images
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "${var.service_name}-images"
  format        = "DOCKER"
  description   = "CDM application container images"
  depends_on = [google_project_service.artifactregistry]
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "postgres" {
  name             = "${var.service_name}-db"
  database_version = "POSTGRES_16"
  region           = var.region
  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    backup_configuration {
      enabled            = true
      start_time         = "03:00"
      point_in_time_recovery_enabled = true
    }
    ip_configuration {
      ipv4_enabled    = false
      private_network = "default"
      require_ssl     = true
    }
    insights_config {
      query_insights_enabled = true
    }
  }
  deletion_protection = false
  depends_on = [google_project_service.sqladmin]
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
  db_url = "postgresql://${google_sql_user.cdm.name}:${random_password.db_password.result}@/${google_sql_database.cdm.name}?host=/cloudsql/${var.project_id}:${var.region}:${google_sql_database_instance.postgres.name}"
}

# Secret Manager secrets
locals {
  secrets = {
    DATABASE_URL        = local.db_url
    NEXTAUTH_SECRET     = var.nextauth_secret
    GOOGLE_CLIENT_ID    = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    GEMINI_API_KEY      = var.gemini_api_key
    ANTHROPIC_API_KEY   = var.anthropic_api_key
    SKRIBBY_API_KEY     = var.skribby_api_key
    WEBHOOK_SECRET      = var.webhook_secret
    SKRIBBY_BASE_URL    = "https://platform.skribby.io/api/v1"
    APP_URL             = var.app_url
    TEST_CALL_ENABLED   = "true"
  }
}

resource "google_secret_manager_secret" "app" {
  for_each = local.secrets
  secret_id = "${var.service_name}-${lower(each.key)}"
  replication { auto {} }
  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "app" {
  for_each = local.secrets
  secret   = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}

# Grant Cloud Run service account access to secrets
resource "google_project_iam_member" "secret_access" {
  for_each = local.secrets
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# Grant Cloud Run service account access to Cloud SQL
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

# Grant Cloud Build service account permissions for deploying
resource "google_project_iam_member" "cloudbuild_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${var.project_number}@cloudbuild.gserviceaccount.com"
}
resource "google_project_iam_member" "cloudbuild_iam_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${var.project_number}@cloudbuild.gserviceaccount.com"
}

# Cloud Run service
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  depends_on = [google_project_service.run, google_vpc_access_connector.connector, google_sql_database_instance.postgres]
  template {
    service_account = google_service_account.run.email
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = var.container_image
      ports { container_port = 3000 }
      env { name = "NODE_ENV" value = "production" }
      env { name = "APP_URL" value = var.app_url }
      env { name = "NEXTAUTH_URL" value = var.app_url }
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
        limits = { cpu = "1000m", memory = "512Mi" }
        startup_cpu_boost = true
      }
      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = 30
        http_get { path = "/api/health", port = 3000 }
      }
      liveness_probe {
        initial_delay_seconds = 15
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 5
        http_get { path = "/api/health", port = 3000 }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
