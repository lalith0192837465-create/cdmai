# CDM — Deal Coordination

Turns Google Meet, Zoom, and Microsoft Teams sales calls into coordinated deal action across Finance, Engineering, and Legal — with one human confirmation in the loop.

## Self-Hosting Installers

- **AWS (`infra/aws/aws-cli.js` → `CDM-AWS-Setup.exe`)** — Direct 3-step **CDM AWS Installer Wizard**:
  1. **Connect AWS:** Upload your AWS IAM Access Keys `.csv` file (or paste your Access Key ID & Secret Key) and pick your AWS region.
  2. **Create Admin Login & Keys:** Enter your Workspace Admin Email & Password, Gemini API Key, and optional Skribby/Slack/Google SSO keys.
  3. **Install & Launch CDM:** Click **Install & Launch CDM** once — the wizard downloads its cloud engine directly (no PowerShell, no AWS CLI, no manual Terraform install), provisions VPC + RDS PostgreSQL 16 + Secrets Manager + Application Load Balancer + ECS Fargate, and opens your live CDM app.
- **Google Cloud (`infra/gcp/gcp-cli.js` → `CDM-GCP-Setup.exe`)** — Direct 3-step **CDM Google Cloud Installer Wizard**:
  1. **Connect Google Cloud:** Upload your Service Account `.json` key file (auto-fills your Project ID) and pick your region.
  2. **Create Admin Login & Keys:** Enter your Workspace Admin Email & Password, Gemini API Key, and optional Skribby/Slack/Google SSO keys.
  3. **Install & Launch CDM:** Click **Install & Launch CDM** once — provisions PostgreSQL 16 + Secret Manager + Cloud Run, configures your live URL automatically, and opens your live CDM app.
- **Azure (`infra/azure/azure-cli.js` → `CDM-Azure-Setup.exe`)** — Direct 3-step **CDM Azure Installer Wizard**:
  1. **Connect Azure:** Upload your Service Principal `.json` file (or enter your Subscription ID, Tenant ID, Client ID, and Client Secret) and pick your Azure region.
  2. **Create Admin Login & Keys:** Enter your Workspace Admin Email & Password, Gemini API Key, and optional Skribby/Slack/Google SSO keys.
  3. **Install & Launch CDM:** Click **Install & Launch CDM** once — provisions Resource Group + PostgreSQL 16 Flexible Server + Log Analytics + Azure Container App with automatic HTTPS, links your live `NEXTAUTH_URL`, and opens your live CDM app.

## Publishing Updated Installers to GitHub Releases

Whenever you push updates to GitHub and want GitHub Releases to serve the newest installer binaries:

1. Push your changes to `main`.
2. Create and publish a new release tag (for example `v1.2.4`) in **GitHub → Releases → Draft a new release**, or run:
   ```bash
   git tag v1.2.4 && git push --tags
   ```
3. `.github/workflows/build-installer.yml` compiles and attaches `CDM-AWS-Setup.exe`, `CDM-GCP-Setup.exe`, and `CDM-Azure-Setup.exe` automatically.

*(During preview/development before tagging a release, `/api/download/aws`, `/api/download/gcp`, and `/api/download/azure` compile and serve `CDM-AWS-Setup.exe`, `CDM-GCP-Setup.exe`, and `CDM-Azure-Setup.exe` directly in verified 8 MB chunks.)*

## Local Development

```bash
npm install
cp .env.example .env.local
npx prisma generate
npm run dev
```
