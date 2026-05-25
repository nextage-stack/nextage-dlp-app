# Entra ID App Registration + role assignments for Managed Identity → Cosmos DB

# ----------------------------------------------------------------------------
# Entra ID App Registration (used by Office SSO from the add-in)
# ----------------------------------------------------------------------------

resource "azuread_application" "addin" {
  display_name     = var.addin_display_name
  sign_in_audience = "AzureADMyOrg"

  # identifier_uris is set by the separate azuread_application_identifier_uri
  # resource below — it needs the client_id which is only available after
  # this application is created.

  # Office.js SSO needs the v2 token format and openid+profile+email scopes
  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Allow the Outlook Add-in to call the DLP API on behalf of the signed-in user."
      admin_consent_display_name = "Access DLP API"
      enabled                    = true
      id                         = random_uuid.scope_id.result
      type                       = "User"
      user_consent_description   = "Allow the add-in to call the DLP API on your behalf."
      user_consent_display_name  = "Access DLP API"
      value                      = "access_as_user"
    }
  }

  # Required Microsoft Graph scopes
  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read (Delegated)
      type = "Scope"
    }
    resource_access {
      id   = "37f7f235-527c-4136-accd-4a02d197296e" # openid (Delegated)
      type = "Scope"
    }
    resource_access {
      id   = "14dad69e-099b-42c9-810b-d002981feec1" # profile (Delegated)
      type = "Scope"
    }
  }

  web {
    redirect_uris = concat(
      var.addin_reply_urls,
      ["https://${local.swa_hostname}/auth/callback"]
    )

    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = false
    }
  }

  single_page_application {
    redirect_uris = [
      "https://${local.swa_hostname}/",
      "https://localhost:3000/",
    ]
  }

  tags = ["nextage", "dlp", "outlook-addin"]
}

# Set the API identifier URI in a separate resource — it references the
# computed client_id of the application above. The URI must match the audience
# the API expects (functions.tf ALLOWED_AUDIENCE) and the manifest's
# webApplicationInfo.resource (built by scripts/build-manifests.ts).
resource "azuread_application_identifier_uri" "addin" {
  application_id = azuread_application.addin.id
  identifier_uri = local.api_identifier_uri
}

resource "azuread_service_principal" "addin" {
  client_id                    = azuread_application.addin.client_id
  app_role_assignment_required = false
}

resource "random_uuid" "scope_id" {}

# Pre-authorize Office hosts so SSO works in Outlook (Web + Desktop)
resource "azuread_application_pre_authorized" "office_outlook" {
  for_each = toset([
    "d3590ed6-52b3-4102-aeff-aad2292ab01c", # Outlook Desktop
    "0ec893e0-5785-4de6-99da-4ed124e5296c", # Outlook Web (legacy)
    "bc59ab01-8403-45c6-8796-ac3ef710b3e3", # Outlook Web (M365)
    "ea5a67f6-b6f3-4338-b240-c655ddc3cc8e", # Office.com
  ])

  application_id       = azuread_application.addin.id
  authorized_client_id = each.value

  permission_ids = [
    random_uuid.scope_id.result,
  ]
}

# ----------------------------------------------------------------------------
# Cosmos DB Role Assignment — Function App's Managed Identity → Data Contributor
# ----------------------------------------------------------------------------

# Built-in role definition: Cosmos DB Built-in Data Contributor
data "azurerm_cosmosdb_sql_role_definition" "data_contributor" {
  account_name        = azurerm_cosmosdb_account.dlp.name
  resource_group_name = azurerm_resource_group.main.name
  role_definition_id  = "00000000-0000-0000-0000-000000000002"
}

resource "azurerm_cosmosdb_sql_role_assignment" "func_to_cosmos" {
  account_name        = azurerm_cosmosdb_account.dlp.name
  resource_group_name = azurerm_resource_group.main.name
  role_definition_id  = data.azurerm_cosmosdb_sql_role_definition.data_contributor.id
  principal_id        = azurerm_linux_function_app.api.identity[0].principal_id
  scope               = azurerm_cosmosdb_account.dlp.id
}
