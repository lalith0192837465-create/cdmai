variable "aws_region" { type = string default = "us-east-1" }
variable "project_name" { type = string default = "cdm" }
variable "image_uri" { type = string description = "Full ECR image URI, including tag" }
variable "vpc_cidr" { type = string default = "10.42.0.0/16" }
variable "public_subnet_cidrs" { type = list(string) default = ["10.42.1.0/24", "10.42.2.0/24"] }
variable "private_subnet_cidrs" { type = list(string) default = ["10.42.11.0/24", "10.42.12.0/24"] }
variable "app_port" { type = number default = 3000 }
variable "db_instance_class" { type = string default = "db.t4g.micro" }
variable "db_name" { type = string default = "cdm" }
variable "db_username" { type = string default = "cdm" }
variable "db_password" { type = string sensitive = true }
variable "nextauth_secret" { type = string sensitive = true }
variable "nextauth_url" { type = string }
variable "google_client_id" { type = string sensitive = true default = "" }
variable "google_client_secret" { type = string sensitive = true default = "" }
variable "recall_api_key" { type = string sensitive = true }
variable "recall_region" { type = string default = "us-west-2" }
variable "gemini_api_key" { type = string sensitive = true default = "" }
variable "anthropic_api_key" { type = string sensitive = true default = "" }
variable "slack_webhook_url" { type = string sensitive = true default = "" }
variable "webhook_secret" { type = string sensitive = true }
