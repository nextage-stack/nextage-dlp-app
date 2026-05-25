# Azure Cosmos DB Account (Serverless) + database + 5 containers
#
# Security posture:
#   - AAD-only authentication (local_authentication_disabled = true)
#   - Public network access enabled but firewalled to Function App outbound IPs
#     plus optional admin IPs (var.cosmos_admin_ips) for break-glass.
#   - Audit container has an explicit indexing policy to keep serverless RU cost down.

resource "azurerm_cosmosdb_account" "dlp" {
  name                = local.cosmos_account_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  # AAD-only — no master keys, no connection strings. All access via Managed Identity.
  local_authentication_disabled = true

  public_network_access_enabled = true

  # Firewall to Function App outbound IPs + admin allowlist. The Function App's
  # possible_outbound_ip_addresses is space-separated; we split into a list.
  ip_range_filter = concat(
    split(",", azurerm_linux_function_app.api.possible_outbound_ip_addresses),
    var.cosmos_admin_ips,
  )

  tags = var.tags
}

resource "azurerm_cosmosdb_sql_database" "dlp" {
  name                = var.cosmos_database_name
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.dlp.name
}

# ----------------------------------------------------------------------------
# Containers — all use /partitionKey for distribution
# ----------------------------------------------------------------------------

resource "azurerm_cosmosdb_sql_container" "customers" {
  name                  = "dlp-customers"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.dlp.name
  database_name         = azurerm_cosmosdb_sql_database.dlp.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
}

resource "azurerm_cosmosdb_sql_container" "advisors" {
  name                  = "dlp-advisors"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.dlp.name
  database_name         = azurerm_cosmosdb_sql_database.dlp.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
}

resource "azurerm_cosmosdb_sql_container" "exemptions" {
  name                  = "dlp-exemptions"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.dlp.name
  database_name         = azurerm_cosmosdb_sql_database.dlp.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
}

resource "azurerm_cosmosdb_sql_container" "exclusions" {
  name                  = "dlp-encryption-exclusions"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.dlp.name
  database_name         = azurerm_cosmosdb_sql_database.dlp.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
}

resource "azurerm_cosmosdb_sql_container" "audit_log" {
  name                  = "dlp-audit-log"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.dlp.name
  database_name         = azurerm_cosmosdb_sql_database.dlp.name
  partition_key_paths   = ["/partitionKey"]
  partition_key_version = 2
  default_ttl           = var.audit_log_ttl_seconds

  # Index only what we query on — keeps write RUs low at serverless billing.
  indexing_policy {
    indexing_mode = "consistent"

    included_path {
      path = "/partitionKey/?"
    }
    included_path {
      path = "/timestamp/?"
    }
    included_path {
      path = "/userObjectId/?"
    }
    included_path {
      path = "/action/?"
    }
    excluded_path {
      path = "/*"
    }
  }
}
