# CDM Google Cloud deployment

Deploys the current CDM image to Cloud Run and stores keys in Secret Manager. Provide a PostgreSQL DATABASE_URL; this package does not create a database automatically.

## Setup
1. Create/select a Google Cloud project and enable the required trial/billing plan.
2. Install Google Cloud CLI and Terraform.
3. Run `gcloud auth application-default login`.
4. Copy `terraform.tfvars.example` to `terraform.tfvars`; add your project ID, database URL, Google OAuth values, Gemini key, provider key, and a random NextAuth secret. Never commit `terraform.tfvars`.

## Deploy
```bash
terraform init
terraform apply
```
Set the printed `service_url` as `app_url` and run `terraform apply` again, then test `/api/health`.

## Cleanup
```bash
terraform destroy
```
Set a budget alert before testing. Cloud Run can scale to zero, but trial and billing limits still apply.
