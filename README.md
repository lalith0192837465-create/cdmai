# CDM — Deal Coordination

Turns Google Meet sales calls into coordinated deal action across Finance, Engineering, and Legal — with one human confirmation in the loop.

## Self-Hosting Installers

- **Windows & macOS (`installer/`)** — 3-step desktop wizard (`CDM-Setup-Windows.exe` / `CDM-Setup-Mac.dmg`) that installs Docker if missing, creates a local PostgreSQL 16 database, and launches CDM automatically.
- **Google Cloud (`infra/gcp/gcp-cli.js` → `CDM-GCP-Setup.exe`)** — Direct 3-step **CDM Google Cloud Installer Wizard**:
  1. **Connect Google Cloud:** Upload your Service Account `.json` key file (auto-fills your Project ID) and pick your region.
  2. **Enter CDM Keys:** Enter your Google Sign-In Client ID/Secret, Gemini API Key, and optional Skribby/Slack keys.
  3. **Install & Launch CDM:** Click **Install & Launch CDM** once — the wizard downloads its cloud engine directly (no PowerShell, no `gcloud`, no manual Terraform install, no typing `PLAN` or `APPLY`), provisions PostgreSQL 16 + Secret Manager + Cloud Run, configures your live URL automatically, and opens your live CDM app.
- **AWS (`infra/aws/` → `CDM-AWS-Setup.zip`)** — Deployment package for AWS environments.

## Publishing Updated Installers to GitHub Releases

Whenever you push updates to GitHub and want GitHub Releases to serve the newest installer binaries:

1. Push your changes to `main`.
2. Create and publish a new release tag (for example `v1.2.3`) in **GitHub → Releases → Draft a new release**, or run:
   ```bash
   git tag v1.2.3 && git push --tags
   ```
3. `.github/workflows/build-installer.yml` compiles and attaches the updated installers automatically.

*(During preview/development before tagging a release, `/api/download/gcp` compiles and serves the latest `CDM-GCP-Setup.exe` directly from `infra/gcp/gcp-cli.js` in verified 8 MB chunks.)*

## Local Development

```bash
npm install
cp .env.example .env.local
npx prisma generate
npm run dev
```
