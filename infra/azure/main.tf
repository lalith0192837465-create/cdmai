provider "azurerm" {
  features {}
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${random_string.suffix.result}"
  location = var.azure_region
}

resource "azurerm_postgresql_flexible_server" "db" {
  name                          = "psql-${var.project_name}-${random_string.suffix.result}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "16"
  administrator_login           = "cdmadmin"
  administrator_password        = var.db_password
  storage_mb                    = 32768
  sku_name                      = "B_Standard_B1ms"
  backup_retention_days         = 7
  public_network_access_enabled = true

  lifecycle {
    ignore_changes = [
      zone,
      high_availability,
    ]
  }
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.db.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_database" "cdm" {
  name      = "cdm"
  server_id = azurerm_postgresql_flexible_server.db.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

resource "azurerm_log_analytics_workspace" "logs" {
  name                = "law-${var.project_name}-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "env" {
  name                       = "cae-${var.project_name}-${random_string.suffix.result}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
}

locals {
  database_url = "postgresql://cdmadmin:${urlencode(var.db_password)}@${azurerm_postgresql_flexible_server.db.fqdn}:5432/cdm?sslmode=require"

  user_secrets = {
    NEXTAUTH_SECRET      = { secret_name = "nextauth-secret", value = var.nextauth_secret }
    ADMIN_EMAIL          = { secret_name = "admin-email", value = var.admin_email }
    ADMIN_PASSWORD       = { secret_name = "admin-password", value = var.admin_password }
    GOOGLE_CLIENT_ID     = { secret_name = "google-client-id", value = var.google_client_id }
    GOOGLE_CLIENT_SECRET = { secret_name = "google-client-secret", value = var.google_client_secret }
    GEMINI_API_KEY       = { secret_name = "gemini-api-key", value = var.gemini_api_key }
    WEBHOOK_SECRET       = { secret_name = "webhook-secret", value = var.webhook_secret }
    ANTHROPIC_API_KEY    = { secret_name = "anthropic-api-key", value = var.anthropic_api_key }
    SKRIBBY_API_KEY      = { secret_name = "skribby-api-key", value = var.skribby_api_key }
    SLACK_WEBHOOK_URL    = { secret_name = "slack-webhook-url", value = var.slack_webhook_url }
  }

  active_secrets = merge(
    {
      DATABASE_URL = { secret_name = "database-url", value = local.database_url }
    },
    {
      for env_key, item in local.user_secrets : env_key => item
      if nonsensitive(trimspace(item.value) != "")
    }
  )
}

resource "azurerm_container_app" "app" {
  name                         = "ca-${var.project_name}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  dynamic "secret" {
    for_each = local.active_secrets
    content {
      name  = secret.value.secret_name
      value = secret.value.value
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "cdm"
      image  = var.image_uri
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }

      env {
        name  = "TEST_CALL_ENABLED"
        value = "true"
      }

      env {
        name  = "SKRIBBY_BASE_URL"
        value = "https://platform.skribby.io/api/v1"
      }

      env {
        name  = "APP_URL"
        value = var.nextauth_url != "" ? var.nextauth_url : "http://localhost:3000"
      }

      env {
        name  = "NEXTAUTH_URL"
        value = var.nextauth_url != "" ? var.nextauth_url : "http://localhost:3000"
      }

      dynamic "env" {
        for_each = local.active_secrets
        content {
          name        = env.key
          secret_name = env.value.secret_name
        }
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/api/health"
        initial_delay           = 5
        interval_seconds        = 10
        timeout                 = 5
        failure_count_threshold = 30
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/api/health"
        initial_delay           = 15
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 5
      }
    }
  }

  depends_on = [
    azurerm_postgresql_flexible_server_database.cdm,
    azurerm_postgresql_flexible_server_firewall_rule.azure_services,
  ]
}
