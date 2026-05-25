# Main resource group + random suffix for globally-unique resource names

data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 5
  upper   = false
  numeric = true
  special = false
}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

locals {
  cosmos_account_name  = "${var.name_prefix}-cosmos-${random_string.suffix.result}"
  function_app_name    = "${var.name_prefix}-api-${random_string.suffix.result}"
  static_web_app_name  = "${var.name_prefix}-addin-${random_string.suffix.result}"
  storage_account_name = replace("${var.name_prefix}stack${random_string.suffix.result}", "-", "")
  key_vault_name       = "${var.name_prefix}-kv-${random_string.suffix.result}"
  app_insights_name    = "${var.name_prefix}-ai"
  log_analytics_name   = "${var.name_prefix}-logs"

  # The Static Web App default hostname is only known after the resource is created.
  swa_hostname = azurerm_static_web_app.addin.default_host_name

  # API identifier URI — must match exactly between:
  #   - azuread_application_identifier_uri.addin.identifier_uri (Entra app)
  #   - JWT `aud` claim accepted by api/src/auth.guard.ts (env: ALLOWED_AUDIENCE)
  #   - manifest webApplicationInfo.resource
  # Microsoft Office SSO expects the form: api://<hostname>/<client_id>
  api_identifier_uri = "api://${local.swa_hostname}/${azuread_application.addin.client_id}"
}
