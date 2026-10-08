variable "webhook_secret" { type = string sensitive = true default = "" }


variable "project_id" { type = string description = "GCP project ID where resources will be created" }
variable "region" { type = string description = "GCP region for resources" default = "us-central1" }
variable "service_name" { type = string description = "Base name for services and secrets" default = "cdm" }
variable "container_image" { type = string description = "Container image to deploy (e.g., us-central1-docker.pkg.dev/project/cdm/app:latest)" }
variable "app_url" { type = string description = "Public URL of the deployed app (e.g., https://cdm.example.com)" }
variable "database_url" { type = string description = "PostgreSQL connection string" sensitive = true }
variable "nextauth_secret" { type = string description = "NextAuth secret for session encryption" sensitive = true }
variable "google_client_id" { type = string description = "Google OAuth client ID" sensitive = true }
variable "google_client_secret" { type = string description = "Google OAuth client secret" sensitive = true }
variable "gemini_api_key" { type = string description = "Google Gemini API key" sensitive = true }
variable "anthropic_api_key" { type = string description = "Anthropic API key" sensitive = true }
variable "skribby_api_key" { type = string description = "Skribby API key for meeting bot" sensitive = true }
variable "webhook_secret" { type = string description = "Secret for webhook verification" sensitive = true }
