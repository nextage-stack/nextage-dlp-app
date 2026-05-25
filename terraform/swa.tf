# Azure Static Web App — hosts the Outlook Add-in front-end (HTML/JS/CSS)

resource "azurerm_static_web_app" "addin" {
  name                = local.static_web_app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  sku_tier = var.static_web_app_sku
  sku_size = var.static_web_app_sku

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# App settings on the Static Web App (used at build/runtime if you add Functions later)
resource "azurerm_static_web_app_custom_domain" "primary" {
  count             = 0 # Set to 1 and configure when a custom domain is approved
  static_web_app_id = azurerm_static_web_app.addin.id
  domain_name       = "" # e.g., "dlp-addin.nextage.co.il"
  validation_type   = "cname-delegation"
}
