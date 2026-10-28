output "application_url" {
  description = "Public HTTPS URL of the deployed CDM Azure Container App"
  value       = "https://${azurerm_container_app.app.ingress[0].fqdn}"
}

output "resource_group_name" {
  description = "Azure Resource Group containing CDM infrastructure"
  value       = azurerm_resource_group.main.name
}

output "postgres_fqdn" {
  description = "FQDN of the Azure Database for PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.db.fqdn
}
