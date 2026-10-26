# CDM Google Cloud Installer (`CDM-GCP-Setup.exe`)

`infra/gcp/gcp-cli.js` compiles into **`CDM-GCP-Setup.exe`** — a single 3-step desktop wizard that installs and launches the CDM application directly in a customer's Google Cloud project.

## How It Works

1. **Step 1 — Connect Google Cloud:** Upload a Google Cloud Service Account `.json` key (which automatically fills in the Project ID) and choose a region.
2. **Step 2 — Enter CDM Keys:** Paste Google Sign-In Client ID & Secret, Gemini API Key, and optional Skribby / Slack keys. Session and webhook secrets are generated automatically behind the scenes.
3. **Step 3 — One-Click Install & Launch:**
   - Downloads and extracts the cloud deployment binary directly inside Node.js over HTTPS (no PowerShell, `gcloud`, `curl`, or manual Terraform installation required).
   - Stores working files privately in `%LOCALAPPDATA%\CDM\deployments\<project-id>` instead of cluttering `Downloads`.
   - Provisions **Cloud SQL (PostgreSQL 16)**, **Secret Manager**, **VPC Connector**, and **Cloud Run**, automatically wires the live Cloud Run URL back into `APP_URL` / `NEXTAUTH_URL`, verifies `/api/health`, and gives a one-click **Open CDM App** button plus the exact Google OAuth Redirect URI to copy.

## Headless Terminal Mode (Optional)

If run on a server without a desktop browser (or with `--cli`), the same installer runs in direct terminal mode:

```bash
CDM-GCP-Setup.exe --cli
```

## Bundle Self-Test

```bash
node infra/gcp/gcp-cli.js --self-test
```
