# Terraform — Nextage DLP Azure Infrastructure

This Terraform configuration provisions the entire Azure infrastructure for the Nextage DLP Outlook Add-in (test tenant).

## What gets created

| Resource | Name pattern | Purpose |
|----------|--------------|---------|
| Resource Group | `rg-nextage-dlp-prod` | Container for all resources |
| Cosmos DB Account (Serverless) | `nextage-dlp-cosmos-<rand>` | Config + audit log store |
| Cosmos DB Database | `dlp-database` | Holds all containers |
| 5x Cosmos Containers | `dlp-customers`, `dlp-advisors`, `dlp-exemptions`, `dlp-encryption-exclusions`, `dlp-audit-log` | Partitioned by `/partitionKey` |
| Function App (Linux, Node 20) | `nextage-dlp-api-<rand>` | Proxy API to Cosmos DB |
| App Service Plan (Consumption) | `nextage-dlp-funcplan` | Y1 SKU for Functions |
| Storage Account | `nextagedlpstack<rand>` | Required by Functions runtime |
| Log Analytics Workspace | `nextage-dlp-logs` | Telemetry sink |
| Application Insights | `nextage-dlp-ai` | App-level metrics |
| Static Web App (Standard) | `nextage-dlp-addin-<rand>` | Hosts the add-in front-end |
| Entra ID App Registration | `Nextage DLP Add-in` | Office SSO + API auth |
| Cosmos DB Role Assignment | — | Function App MI → Data Contributor |

## Prerequisites

| Tool | Min Version | Install |
|------|-------------|---------|
| Terraform | 1.6.0 | `brew install terraform` |
| Azure CLI | 2.60+ | `brew install azure-cli` |
| Azure subscription | — | Test tenant subscription with Contributor role |

You must be **Application Administrator** (or higher) in the Entra tenant to create the App Registration.

## Usage

```bash
# 1. Log in to Azure (browser opens)
az login --tenant <your-test-tenant-id>

# 2. Set the active subscription if you have multiple
az account set --subscription <subscription-id>

# 3. Configure terraform variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in subscription_id and tenant_id

# 4. Initialize Terraform (downloads providers)
terraform init

# 5. Preview what will be created
terraform plan

# 6. Apply (creates ~15 resources, takes ~5-7 minutes)
terraform apply

# 7. Read the deployment summary
terraform output deployment_summary
```

## Outputs to copy after apply

After `terraform apply` finishes, you'll need these values for the next manual steps:

```bash
# Static Web App deployment token (for Azure DevOps pipeline)
terraform output -raw static_web_app_deployment_token

# Entra App Client ID (for manifest.json and manifest-legacy.xml)
terraform output -raw entra_app_client_id

# Static Web App URL (for both manifests)
terraform output -raw static_web_app_url

# Function App URL (for AZURE_FUNCTIONS_URL variable in DevOps)
terraform output -raw function_app_url
```

## Manual steps NOT handled by Terraform

These require human intervention via Portal or CLI:

1. **Grant Admin Consent for the Entra App** (required for tenant-wide Graph access):
   ```bash
   CLIENT_ID=$(terraform output -raw entra_app_client_id)
   az ad app permission admin-consent --id $CLIENT_ID
   ```

2. **Seed Cosmos DB with initial data** — Terraform creates empty containers. Populate via:
   - Azure Portal → Cosmos DB → Data Explorer → upload JSON, or
   - Run `npm run seed:cosmos` after pointing it at the production endpoint

3. **Update both manifests** with the Entra Client ID and SWA URL from outputs above:
   - `manifest.json` → `id`, `webApplicationInfo.id`, `webApplicationInfo.resource`, `validDomains`
   - `manifest-legacy.xml` → all `bt:Url` entries + the App's `<Id>` element

4. **Sideload manifest** in M365 Admin Center → Settings → Integrated apps

## Destroy

```bash
terraform destroy
```

⚠️ Cosmos DB has data — destroy is irreversible. The Entra App Registration will also be deleted; if it's used elsewhere, remove it from this config first.

## State file

By default, state is stored locally in `terraform.tfstate`. For team use, uncomment the `backend "azurerm"` block in `providers.tf` and create the backend storage first:

```bash
az group create -n rg-tfstate-shared -l westeurope
az storage account create -n nextagetfstate -g rg-tfstate-shared -l westeurope --sku Standard_LRS
az storage container create -n tfstate --account-name nextagetfstate
```

Then run `terraform init -migrate-state`.

## Cost estimate

| Resource | Tier | Monthly cost |
|----------|------|--------------|
| Cosmos DB Serverless | Pay-per-RU | $0-5 (idle to typical) |
| Function App | Y1 Consumption | $0-2 |
| Static Web App | Standard | $9 |
| Storage Account | Standard LRS | <$1 |
| App Insights + Log Analytics | Pay-as-you-go | $1-5 |
| **Total** | | **~$11-22/month** |
