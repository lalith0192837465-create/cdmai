output "service_url" { value = google_cloud_run_v2_service.app.uri description = "Cloud Run URL; set as app_url and Google OAuth redirect base before the follow-up apply" }
output "service_account_email" { value = google_service_account.run.email description = "Customer-owned Cloud Run runtime identity" }
output "cloud_sql_connection_name" { value = google_sql_database_instance.postgres.connection_name description = "Cloud SQL connection name mounted at /cloudsql" }
output "secret_names" { value = { for k, v in google_secret_manager_secret.app : k => v.secret_id } description = "Secret Manager secret IDs (not secret values)" }
