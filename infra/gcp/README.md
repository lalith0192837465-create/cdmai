# CDM Google Cloud onboarding and deployment package

This customer-hosted package is a **deployment starting point**, not a one-click deployment. It includes Terraform source and an onboarding wizard handoff. A customer GCP administrator must confirm the design, costs, permissions, networking and application configuration before running Terraform. The installer does not connect to or make changes in a customer GCP project.

## 1. Complete the onboarding handoff

Use the CDM installer’s Google Cloud wizard to record the project ID, preferred region, network/private-service-access status, intended app domain, deployment authorization owner, and audit-log destination. It saves a non-secret JSON summary locally. Do not put passwords, API keys, service-account keys, or other credentials in that summary.

## 2. Customer decisions required before deployment

The customer’s cloud/platform team must confirm:

- Project ID, region, approved public/private access pattern, and DNS/domain ownership.
- Existing VPC and Private Service Access setup. The current Terraform’s network assumptions must be reviewed and adapted to the customer’s network; do not apply it as-is where those assumptions are wrong.
- Database architecture and connectivity. The application uses PostgreSQL; customer-owned database URL/credentials must be approved and configured. Never commit real values in `terraform.tfvars`.
- Google OAuth consent screen, authorized origins, and redirect URI for the final Cloud Run URL/domain.
- Approved source image and access. The current image reference is public GHCR; customers may instead mirror it into their own Artifact Registry after review.
- A temporary, least-privilege deployment identity and the customer’s approval process. Never use a standing Owner credential or paste a service-account JSON key into the installer.
- Required app secrets, webhook settings, data retention, and audit-log destination.
- Billing approval and budget alerts. Cloud Run may scale down, but Cloud SQL, networking, storage, logging, and egress can incur charges.

## 3. Review the Terraform before use

The included Terraform is a draft that provisions Cloud Run, Cloud SQL, Secret Manager, IAM, and networking resources. It currently contains assumptions about the default VPC, VPC connector range, service account permissions, database/private networking, and public Cloud Run access. Have the customer’s GCP administrator review and adjust these to their environment and security policy. Do not apply until the plan is approved.

The project onboarding questionnaire is not itself a security approval, billing estimate, or proof of production readiness. Never share real secrets in the installer, setup summary, or source control.

## 4. Prepare and deploy (customer-operated)

1. Install the Google Cloud CLI and Terraform using the customer’s approved process.
2. Authenticate as the approved deployment identity; confirm the active project and required IAM permissions.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill only customer-approved values. Keep that file local and private.
4. Run `terraform init`, inspect `terraform plan`, obtain customer approval, then run `terraform apply`.
5. Configure Google OAuth redirect URIs and any custom domain using the actual deployed service URL.
6. Follow the output and verify the deployment’s health endpoint and sign-in/application flows.

Terraform state contains sensitive deployment data. Store it only in a customer-approved, access-controlled backend; do not send or commit state files. Use the included `.gitignore` for local working copies.

## Cleanup

Only the customer’s authorized cloud administrator should run `terraform destroy`, after checking the plan and confirming retention/backup requirements. Deletion can remove customer data and infrastructure.

# Using the CDM GCP downloads

The current GitHub release includes two customer-facing GCP downloads:

- `CDM-GCP-Setup.exe`: guided Windows setup window with the Terraform files embedded; no unzip or Node.js install is needed. Progress, questions, secret fields, review-plan output, and the final project-specific approval are shown in the window, not a console.
- `CDM-Google-Cloud-Setup.zip`: Terraform starter package and customer review guide for teams that want to inspect or adapt the files themselves.

The desktop installer’s Google Cloud wizard saves a non-secret setup handoff, then opens the direct CLI download. It does not log into or change a customer cloud project.

## For the CLI customer

1. Install Terraform and Google Cloud CLI using your organization’s approved process.
2. Download and double-click `CDM-GCP-Setup.exe`. The graphical setup window opens; no Python or Node.js window is needed.
3. Choose a local folder and start setup. Review each question in the window. The setup stops if required tools are missing or if the approved network design does not match this package.
4. Enter application credentials in the private input fields. Values are written only to the local `terraform.tfvars`, which must stay private.
5. Review the deployment summary and choose **Prepare review plan** to create local files and run `terraform init` and `terraform plan`.
6. Review the full plan and costs in the window. Only entering the exact `APPLY <project-id>` confirmation applies that plan. Keep the window open until Terraform finishes.

### Installing the required tools

The CLI prints these instructions automatically when it detects a missing tool. They are also listed here.

**Terraform** creates and updates the Google Cloud resources for this setup. It is free and open source.

| Method | What to do |
| --- | --- |
| Direct download (Windows 64-bit) | Download `https://releases.hashicorp.com/terraform/<version>/terraform_<version>_windows_amd64.zip`, unzip it, and put `terraform.exe` in a folder on your PATH, for example `C:\Program Files\Terraform`. |
| Official install guide | `https://developer.hashicorp.com/terraform/install` |
| Windows Package Manager | Run `winget install Hashicorp.Terraform` |
| Check it worked | `terraform -version` |

The direct link is version-specific. The CLI looks up the current version when it starts and prints the matching link, so it does not go stale.

**Google Cloud CLI (`gcloud`)** signs in to your Google Cloud project and runs the deployment commands.

| Method | What to do |
| --- | --- |
| Direct installer (Windows 64-bit) | Download and run `https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe` |
| Official install guide | `https://cloud.google.com/sdk/docs/install` |
| Windows Package Manager | Run `winget install Google.CloudSDK` |
| Check it worked | `gcloud --version` |

After installing either tool, open a NEW terminal window so it can find the new command.

The CLI and Terraform are customer-operated. Terraform state and `terraform.tfvars` can contain sensitive information; keep them in an access-controlled location, and do not commit or email them.

## For the developer

- `gcp-cli.js` is the deployment engine; `gcp-assets.js` embeds the Terraform files; `gui/` contains the Windows setup window.
- The release workflow checks the embedded Terraform assets, builds the hidden CLI and Windows setup window, and attaches the GCP-only executable to new tagged releases. Manual runs produce a short-lived test artifact without changing a release.
