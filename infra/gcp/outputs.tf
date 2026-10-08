output "service_url" { value = google_cloud_run_v2_service.app.uri description = "Public URL of the Cloud Run service" }
output "service_account_email" { value = google_service_account.run.email description = "Service account email for Cloud Run" }
output "secret_names" { value = { for k, v in google_secret_manager_secret.app : k => v.secret_id } description = "Map of secret names created in Secret Manager" }
