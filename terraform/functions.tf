# Azure Functions v4 (Node.js 20) — proxy API + supporting Storage + App Insights

# ----------------------------------------------------------------------------
# Storage Account (required by Functions runtime)
# ----------------------------------------------------------------------------

resource "azurerm_storage_account" "func" {
  name                            = local.storage_account_name
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  # Keys required by AzureWebJobsStorage today; Functions v4 + MI for storage
  # is supported, but Y1 (Consumption) plan still requires the key for the
  # built-in trigger queues. Leave keys on and audit access via diagnostic logs.
  shared_access_key_enabled = true

  tags = var.tags
}

# ----------------------------------------------------------------------------
# Log Analytics + Application Insights
# ----------------------------------------------------------------------------

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.log_analytics_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_application_insights" "main" {
  name                = local.app_insights_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  tags                = var.tags
}

# ----------------------------------------------------------------------------
# Function App (Consumption Plan, Linux, Node 20)
# ----------------------------------------------------------------------------

resource "azurerm_service_plan" "func" {
  name                = "${var.name_prefix}-funcplan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption
  tags                = var.tags
}

resource "azurerm_linux_function_app" "api" {
  name                = local.function_app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.func.id

  storage_account_name       = azurerm_storage_account.func.name
  storage_account_access_key = azurerm_storage_account.func.primary_access_key

  https_only = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }

    cors {
      allowed_origins = [
        "https://${azurerm_static_web_app.addin.default_host_name}",
        "https://localhost:3000",
        "https://outlook.office.com",
        "https://outlook.office365.com",
      ]
      support_credentials = false
    }

    application_insights_connection_string = azurerm_application_insights.main.connection_string
    application_insights_key               = azurerm_application_insights.main.instrumentation_key

    use_32_bit_worker   = false
    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"
  }

  app_settings = {
    FUNCTIONS_EXTENSION_VERSION  = "~4"
    FUNCTIONS_WORKER_RUNTIME     = "node"
    WEBSITE_NODE_DEFAULT_VERSION = "~20"
    WEBSITE_RUN_FROM_PACKAGE     = "1"

    COSMOS_ENDPOINT = azurerm_cosmosdb_account.dlp.endpoint
    COSMOS_DATABASE = var.cosmos_database_name

    # JWT validation parameters — auth.guard.ts reads these.
    AZURE_TENANT_ID    = var.tenant_id
    ALLOWED_AUDIENCE   = local.api_identifier_uri
    ALLOWED_CLIENT_ID  = azuread_application.addin.client_id
    AUDIT_HMAC_KEY     = var.audit_hmac_key

    SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
  }

  tags = var.tags
}
