variable "subscription_id" {
  description = "Azure subscription ID to deploy into."
  type        = string
}

variable "tenant_id" {
  description = "Azure AD tenant ID (the test tenant)."
  type        = string
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Resource group name. Will be created if absent."
  type        = string
  default     = "rg-nextage-dlp-prod"
}

variable "name_prefix" {
  description = "Prefix used to name all resources (must be globally unique for SWA + Cosmos)."
  type        = string
  default     = "nextage-dlp"
}

variable "cosmos_database_name" {
  description = "Cosmos DB database name."
  type        = string
  default     = "dlp-database"
}

variable "audit_log_ttl_seconds" {
  description = "Audit log retention in seconds (default: 90 days)."
  type        = number
  default     = 7776000
}

variable "static_web_app_sku" {
  description = "Static Web App SKU. 'Standard' is required for custom auth + private endpoints."
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Free", "Standard"], var.static_web_app_sku)
    error_message = "static_web_app_sku must be either 'Free' or 'Standard'."
  }
}

variable "addin_display_name" {
  description = "Display name for the Entra ID App Registration."
  type        = string
  default     = "Nextage DLP Add-in"
}

variable "manifest_guid" {
  description = "Stable GUID identifying the add-in to Office hosts. Generate ONCE per environment via uuidgen; do not regenerate after the first deploy or every existing install treats the add-in as new."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.manifest_guid))
    error_message = "manifest_guid must be a valid GUID."
  }
}

variable "addin_reply_urls" {
  description = "Reply URLs (redirect URIs) for the Entra App Registration. Will be merged with the deployed SWA URL automatically."
  type        = list(string)
  default = [
    "https://localhost:3000/auth/callback"
  ]
}

variable "cosmos_admin_ips" {
  description = "Public IPs allowed to reach Cosmos directly (for break-glass administration via portal/CLI). Empty list means only Functions outbound IPs are allowed."
  type        = list(string)
  default     = []
}

variable "audit_hmac_key" {
  description = "HMAC-SHA256 key used to hash PII in audit log entries. Must be a long random string. Rotated independently from app deploys."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default = {
    Project     = "Nextage-DLP"
    Environment = "test"
    Owner       = "mor.mordechai@nextage.co.il"
    CostCenter  = "IT"
    ManagedBy   = "terraform"
  }
}
