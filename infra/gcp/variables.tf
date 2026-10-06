variable "project_id" { type = string }
variable "region" { type = string default = "us-central1" }
variable "service_name" { type = string default = "cdm" }
variable "container_image" { type = string default = "ghcr.io/lalith0192837465-create/cdmai:latest" }
variable "database_url" { type = string sensitive = true }
variable "app_url" { type = string default = "" }
variable "nextauth_secret" { type = string sensitive = true }
variable "google_client_id" { type = string default = "" }
variable "google_client_secret" { type = string sensitive = true default = "" }
variable "gemini_api_key" { type = string sensitive = true default = "" }
variable "anthropic_api_key" { type = string sensitive = true default = "" }
variable "skribby_api_key" { type = string sensitive = true default = "" }
variable "webhook_secret" { type = string sensitive = true default = "" }
