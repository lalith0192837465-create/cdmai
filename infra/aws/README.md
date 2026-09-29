# AWS customer deployment

This package deploys CDM into a customer-owned AWS account using ECS Fargate, RDS PostgreSQL, an Application Load Balancer, ECR, CloudWatch logs, and Secrets Manager. It creates a new isolated VPC by default.

## Before apply
1. Install Terraform 1.6+ and configure AWS credentials for the customer account.
2. Copy `terraform.tfvars.example` to `terraform.tfvars`.
3. Put real secret values only in `terraform.tfvars` or a secure CI variable store; never commit that file.
4. Build and push the CDM image to the ECR repository created by this module, then set `image_uri`.
5. Run `terraform init`, `terraform plan`, review, then `terraform apply`.

This is a baseline deployment, not a universal answer for every enterprise network. Use `existing_vpc_id`/subnet variables only after the customer confirms their network and security requirements.
