output "resource_group_name" {
  value       = azurerm_resource_group.main.name
  description = "Name of the resource group containing all DLP resources."
}

output "cosmos_account_name" {
  value       = azurerm_cosmosdb_account.dlp.name
  description = "Cosmos DB account name."
}

output "cosmos_endpoint" {
  value       = azurerm_cosmosdb_account.dlp.endpoint
  description = "Cosmos DB endpoint URL. Set as Functions app setting COSMOS_ENDPOINT."
}

output "function_app_name" {
  value       = azurerm_linux_function_app.api.name
  description = "Function App name. Used by the Azure DevOps pipeline target."
}

output "function_app_hostname" {
  value       = azurerm_linux_function_app.api.default_hostname
  description = "Function App default hostname (without scheme). Goes into manifest validDomains / AppDomains."
}

output "function_app_url" {
  value       = "https://${azurerm_linux_function_app.api.default_hostname}/api"
  description = "Function App base URL. Set as AZURE_FUNCTIONS_URL for the add-in build."
}

output "static_web_app_name" {
  value       = azurerm_static_web_app.addin.name
  description = "Static Web App name."
}

output "static_web_app_hostname" {
  value       = azurerm_static_web_app.addin.default_host_name
  description = "Static Web App default hostname (without scheme). Used in both manifests."
}

output "static_web_app_url" {
  value       = "https://${azurerm_static_web_app.addin.default_host_name}"
  description = "Static Web App public URL."
}

output "static_web_app_deployment_token" {
  value       = azurerm_static_web_app.addin.api_key
  sensitive   = true
  description = "Deployment token for the Static Web App. Add to Azure DevOps Variable Group as AZURE_STATIC_WEB_APPS_API_TOKEN."
}

output "entra_app_client_id" {
  value       = azuread_application.addin.client_id
  description = "Entra ID App Registration (client) ID. Goes into both manifests + Functions ALLOWED_CLIENT_ID."
}

output "entra_app_object_id" {
  value       = azuread_application.addin.object_id
  description = "Entra ID App Registration object ID."
}

output "entra_app_identifier_uri" {
  value       = local.api_identifier_uri
  description = "API identifier URI. Matches the JWT 'aud' claim accepted by the API."
}

output "tenant_id" {
  value       = var.tenant_id
  description = "Tenant ID JWTs are issued for."
}

output "application_insights_connection_string" {
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
  description = "App Insights connection string for telemetry."
}

# Convenience: emit the four substitution tokens build-manifests.ts needs.
# Use `terraform output -json manifest_tokens | jq -r ...` in CI.
output "manifest_tokens" {
  value = {
    SWA_HOSTNAME        = azurerm_static_web_app.addin.default_host_name
    FUNCTIONS_HOSTNAME  = azurerm_linux_function_app.api.default_hostname
    ENTRA_APP_CLIENT_ID = azuread_application.addin.client_id
    # MANIFEST_GUID is a stable, manually-chosen GUID that identifies the
    # add-in to Office. It must NOT change across deploys, otherwise Outlook
    # treats each deploy as a new add-in. Provide via var.manifest_guid.
    MANIFEST_GUID = var.manifest_guid
  }
  description = "Token values for scripts/build-manifests.ts. Surface to pipeline as env vars before build."
}

output "deployment_summary" {
  value = <<-EOT

    ============================================================
    Nextage DLP - Deployment Complete
    ============================================================

    Resource Group:      ${azurerm_resource_group.main.name}
    Location:            ${azurerm_resource_group.main.location}

    Add-in URL:          https://${azurerm_static_web_app.addin.default_host_name}
    Functions URL:       https://${azurerm_linux_function_app.api.default_hostname}/api
    Cosmos DB:           ${azurerm_cosmosdb_account.dlp.endpoint}
    Entra App Client ID: ${azuread_application.addin.client_id}
    API Identifier URI:  ${local.api_identifier_uri}

    Next manual steps:
      1. Capture outputs into the pipeline variable group:
           terraform output -raw static_web_app_deployment_token  -> AZURE_STATIC_WEB_APPS_API_TOKEN
           terraform output -raw function_app_url                  -> AZURE_FUNCTIONS_URL
           terraform output -json manifest_tokens                  -> SWA_HOSTNAME / FUNCTIONS_HOSTNAME / ENTRA_APP_CLIENT_ID / MANIFEST_GUID
      2. Grant Admin Consent for the Entra App:
           az ad app permission admin-consent --id ${azuread_application.addin.client_id}
      3. Seed Cosmos DB with initial customer/advisor data (see scripts/seed-prod-data.ts)
      4. Run the Azure DevOps pipeline to build manifests + deploy code

  EOT
  description = "Human-readable summary of the deployment."
}
