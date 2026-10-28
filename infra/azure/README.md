# CDM — Microsoft Azure Deployment

Deploys CDM inside your own Microsoft Azure subscription using **Azure Container Apps**, **Azure Database for PostgreSQL 16 Flexible Server**, and **Azure Log Analytics** with encrypted Container App secrets and automatic HTTPS ingress.

## Guided Installer (`CDM-Azure-Setup.exe`)

1. **Connect Azure:** Upload your Service Principal `.json` file (created with `az ad sp create-for-rbac --role Contributor --scopes /subscriptions/<SUBSCRIPTION_ID> --sdk-auth`) or enter your **Subscription ID**, **Tenant ID**, **Client ID**, and **Client Secret**, then pick your Azure region.
2. **Enter CDM Keys:** Enter your Google Sign-In Client ID/Secret, Gemini API Key, and optional Skribby/Slack keys.
3. **Install & Launch CDM:** Click **Install & Launch CDM** — the wizard downloads the cloud engine automatically (no Azure CLI or manual Terraform setup needed), provisions PostgreSQL 16 + Container Apps Environment + Container App, sets your live HTTPS `NEXTAUTH_URL`, and opens CDM.

## Manual Terraform Usage

```bash
export ARM_SUBSCRIPTION_ID="<your-subscription-id>"
export ARM_TENANT_ID="<your-tenant-id>"
export ARM_CLIENT_ID="<your-service-principal-app-id>"
export ARM_CLIENT_SECRET="<your-service-principal-secret>"

cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```
