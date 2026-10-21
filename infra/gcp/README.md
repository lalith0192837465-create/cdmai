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

- `CDM-GCP-Setup.exe`: guided Windows CLI with Terraform files embedded; no unzip or Node.js install is needed.
- `CDM-Google-Cloud-Setup.zip`: Terraform starter package and customer review guide for teams that want to inspect or adapt the files themselves.

The desktop installer’s Google Cloud wizard saves a non-secret setup handoff, then opens the direct CLI download. It does not log into or change a customer cloud project.

## For the CLI customer

1. Install Terraform and Google Cloud CLI using your organization’s approved process.
2. Download and double-click `CDM-GCP-Setup.exe`. A terminal opens.
3. Review the questions. The CLI stops if required tools are missing or if your approved network design does not match this package.
4. Enter application credentials at the prompts; secret input is not shown on screen. Values are written to the local `terraform.tfvars`, which must stay private.
5. Type `PLAN` to prepare the local folder and run `terraform init` and `terraform plan`.
6. Review the full plan and costs. Only typing the exact `APPLY <project-id>` confirmation applies that plan.

The CLI and Terraform are customer-operated. Terraform state and `terraform.tfvars` can contain sensitive information; keep them in an access-controlled location, and do not commit or email them.

## For the developer

- `gcp-cli.js` is the CLI source; `gcp-assets.js` embeds the Terraform files.
- The tagged-release workflow checks embedded assets, builds the standalone Windows executable, runs its bundle self-test, and attaches it to each new GitHub release.
