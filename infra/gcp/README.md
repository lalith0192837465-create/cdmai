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

# Using the CDM GCP CLI

The customer download is a single Windows executable. The customer downloads it, double-clicks it,
and a terminal opens with the guided setup. There is nothing to extract and no Node.js to install.

## For the customer

1. Download `CDM-Google-Cloud-Setup.zip` from the GitHub release and extract it once.
2. Double-click `CDM-GCP-Setup.exe`. A terminal window opens.
3. Answer the prompts. The CLI checks for Terraform and Google Cloud CLI first and stops if either is missing.
4. The CLI prints a deployment summary and writes a local `cdm-gcp-<project-id>` folder.
5. The CLI runs `terraform init` and `terraform plan` and shows the plan.
6. Only if the customer types `APPLY <project-id>` does it run `terraform apply`.

The executable embeds the Terraform source, so it is self-contained apart from Terraform and gcloud.

## For the developer

- `gcp-cli.js` is the CLI source.
- `gcp-assets.js` embeds the Terraform files so the packaged executable can write them out.
- `gcp-assets.js` is generated from the Terraform files in this folder. Regenerate it after changing them:

  ```
  node -e "const fs=require('fs');const n=['main.tf','variables.tf','outputs.tf','versions.tf','.gitignore'];const a={};for(const f of n)a[f]=fs.readFileSync(f,'utf8');fs.writeFileSync('gcp-assets.js',"'use strict';\nmodule.exports = "+JSON.stringify(a,null,2)+';\n')"
  ```

- Build the Windows executable with `pkg` (the `@yao-pkg/pkg` fork supports Node 22):

  ```
  npm install -g @yao-pkg/pkg
  pkg --target node22-win-x64 --output dist/CMD-GCP-Setup.exe --public-packages '*' gcp-cli.js
  ```

## Safety properties

- The CLI never runs `terraform apply` without the customer typing `APPLY <project-id>`.
- `terraform plan` always runs first, and the plan is shown before the apply.
- Credentials are read without echo and written only to the local `terraform.tfvars` file. They are
  never transmitted to CDM.
- The CLI refuses to continue when the customer's network design does not match the included
  Terraform, rather than applying an assumption.
- The generated folder is never overwritten; the CLI stops if it already exists.
