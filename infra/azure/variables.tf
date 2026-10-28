variable "azure_region" {
  description = "Azure region where CDM resources will be created (e.g., eastus, westus2, westeurope)"
  type        = string
  default     = "eastus"
}

variable "project_name" {
  description = "Short stack prefix for CDM Azure resources (lowercase letters, numbers, hyphens)"
  type        = string
  default     = "cdm"
}

variable "image_uri" {
  description = "Container image URI for the CDM application"
  type        = string
  default     = "ghcr.io/lalith0192837465-create/cdmai:latest"
}

variable "db_password" {
  description = "Administrator password for Azure Database for PostgreSQL Flexible Server"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "Secret key used to sign NextAuth sessions"
  type        = string
  sensitive   = true
}

variable "nextauth_url" {
  description = "Canonical public HTTPS URL of the CDM application (auto-populated after Container App creation)"
  type        = string
  default     = ""
}

variable "admin_email" {
  description = "Workspace admin login email"
  type        = string
  sensitive   = true
}

variable "admin_password" {
  description = "Workspace admin login password"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Optional Google OAuth 2.0 Client ID for Sign-In"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_secret" {
  description = "Optional Google OAuth 2.0 Client Secret for Sign-In"
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini API Key for deal extraction and drafting"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Optional Anthropic API Key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "skribby_api_key" {
  description = "Optional Skribby meeting bot API Key (Google Meet, Zoom, Microsoft Teams)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "slack_webhook_url" {
  description = "Optional Slack Incoming Webhook URL"
  type        = string
  default     = ""
  sensitive   = true
}

variable "webhook_secret" {
  description = "Shared secret for verifying inbound meeting bot webhooks"
  type        = string
  sensitive   = true
}
