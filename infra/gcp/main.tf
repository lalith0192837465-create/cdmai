provider "google" {
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
  account_id   = "${var.service_name}-run"
  display_name = "CDM Cloud Run"
}

# VPC connector for Cloud SQL access
resource "google_vpc_access_connector" "connector" {
  name          = "${var.service_name}-connector"
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
  repository_id = "${var.service_name}-images"
  format        = "DOCKER"
  description   = "CDM application container images"
  depends_on    = [google_project_service.artifactregistry]
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "postgres" {
  name             = "${var.service_name}-db"
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
  db_url = "postgresql://${google_sql_user.cdm.name}:${random_password.db_password.result}@/${google_sql_database.cdm.name}?host=/cloudsql/${var.project_id}:${var.region}:${google_sql_database_instance.postgres.name}"
}

# Secret Manager secrets (only non-empty secrets are created so optional keys never fail)
locals {
  user_secrets = {
    NEXTAUTH_SECRET      = var.nextauth_secret
    ADMIN_EMAIL          = var.admin_email
    ADMIN_PASSWORD       = var.admin_password
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    GEMINI_API_KEY       = var.gemini_api_key
    ANTHROPIC_API_KEY    = var.anthropic_api_key
    SKRIBBY_API_KEY      = var.skribby_api_key
    SLACK_WEBHOOK_URL    = var.slack_webhook_url
    WEBHOOK_SECRET       = var.webhook_secret
    SKRIBBY_BASE_URL     = "https://platform.skribby.io/api/v1"
    TEST_CALL_ENABLED    = "true"
  }
  secrets = merge(
    { DATABASE_URL = local.db_url },
    { for k, v in local.user_secrets : k => v if nonsensitive(trimspace(v) != "") }
  )
}

resource "google_secret_manager_secret" "app" {
  for_each   = local.secrets
  secret_id  = "${var.service_name}-${lower(each.key)}"
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
  project    = var.project_id
  role       = "roles/run.admin"
  member     = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.cloudbuild]
}
resource "google_project_iam_member" "cloudbuild_iam_admin" {
  project    = var.project_id
  role       = "roles/iam.serviceAccountUser"
  member     = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
  depends_on = [google_project_service.cloudbuild]
}

# Cloud Run service
resource "google_cloud_run_v2_service" "app" {
  name                 = var.service_name
  location             = var.region
  ingress              = var.allow_public_ingress ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection  = var.deletion_protection
  depends_on           = [google_project_service.run, google_vpc_access_connector.connector, google_sql_database_instance.postgres, google_secret_manager_secret_version.app, google_project_iam_member.secret_access]

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
