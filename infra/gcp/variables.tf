variable "project_id" { type = string description = "Customer-owned Google Cloud project ID" }
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
