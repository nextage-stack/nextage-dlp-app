# Nextage DLP — Azure Deployment Guide

End-to-end playbook for deploying the v3 codebase to a test Azure tenant.

**Total time estimate:** 4-6 hours (1 hour Terraform, 1 hour code deploy, 1-2 hours manifest + sideload, 1-2 hours verification).

**Target environment:** Test tenant only. `SAFE_MODE = false` (active blocking enabled).

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Path A — Infrastructure via Terraform (recommended)](#2-path-a--infrastructure-via-terraform-recommended)
3. [Path B — Infrastructure via Azure CLI (manual)](#3-path-b--infrastructure-via-azure-cli-manual)
4. [Post-infrastructure steps](#4-post-infrastructure-steps)
5. [Seed Cosmos DB with initial data](#5-seed-cosmos-db-with-initial-data)
6. [Azure DevOps pipeline setup](#6-azure-devops-pipeline-setup)
7. [Update manifests with real values](#7-update-manifests-with-real-values)
8. [Deploy the code](#8-deploy-the-code)
9. [Sideload manifest in M365](#9-sideload-manifest-in-m365)
10. [Smoke test](#10-smoke-test)
11. [Rollback procedure](#11-rollback-procedure)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### Identities and roles required

| Role | Where | Why |
|------|-------|-----|
| **Azure Subscription Contributor** | On the target subscription | Create resource group, Cosmos, Functions, SWA |
| **Application Administrator** (or higher) | In the Entra ID tenant | Create the App Registration |
| **Global Administrator** | In the Entra ID tenant | Grant Admin Consent on the App Registration |
| **Exchange Administrator** | M365 Admin Center | Upload the manifest to the tenant |
| **Azure DevOps Project Administrator** | In the Azure DevOps org | Create the Variable Group + Service Connection |

### Tools to install locally

```bash
# macOS (using Homebrew)
brew install azure-cli terraform node@20 mkcert
npm install -g typescript@5 azure-functions-core-tools@4 office-addin-manifest

# Verify versions
az version           # ≥ 2.60
terraform version    # ≥ 1.6.0
node --version       # v20.x.x
func --version       # 4.x
```

### Information to gather beforehand

- [ ] Azure **Subscription ID** (`az account show --query id -o tsv`)
- [ ] Azure **Tenant ID** of the test tenant (`az account show --query tenantId -o tsv`)
- [ ] Preferred **Azure region** (default: `westeurope`)
- [ ] Azure DevOps **Organization URL** (e.g., `https://dev.azure.com/nextage`)
- [ ] Azure DevOps **Project name**

---

## 2. Path A — Infrastructure via Terraform (recommended)

This path provisions ~15 Azure resources in 5-7 minutes with one command.

### 2.1 Log in to Azure

```bash
az login --tenant <test-tenant-id>
az account set --subscription <subscription-id>
```

### 2.2 Configure Terraform variables

```bash
cd /Users/mormordechay/nextage-dlp-addin-v3/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
subscription_id = "<your-subscription-id>"
tenant_id       = "<your-tenant-id>"
location        = "westeurope"
```

### 2.3 Initialize and apply

```bash
terraform init      # downloads providers (~30 seconds)
terraform plan      # preview - confirm ~15 resources will be created
terraform apply     # type "yes" when prompted
```

Expected duration: **5-7 minutes**.

### 2.4 Capture outputs

```bash
# Save key values to environment variables for later steps
export SWA_TOKEN=$(terraform output -raw static_web_app_deployment_token)
export ENTRA_CLIENT_ID=$(terraform output -raw entra_app_client_id)
export SWA_URL=$(terraform output -raw static_web_app_url)
export FUNC_URL=$(terraform output -raw function_app_url)
export RG_NAME=$(terraform output -raw resource_group_name)

# Print human-readable summary
terraform output deployment_summary
```

### 2.5 Grant Admin Consent

```bash
az ad app permission admin-consent --id $ENTRA_CLIENT_ID
```

If you get a permissions error, ask the **Global Administrator** to run this command, or grant consent via the Azure Portal:
**Entra ID → App registrations → Nextage DLP Add-in → API permissions → Grant admin consent for [tenant]**.

### 2.6 Skip to [section 4](#4-post-infrastructure-steps)

---

## 3. Path B — Infrastructure via Azure CLI (manual)

Use this path only if Terraform is not approved by your organization. Reproduces what Terraform does, step by step.

### 3.1 Variables

```bash
export LOCATION="westeurope"
export RG="rg-nextage-dlp-prod"
export PREFIX="nextage-dlp"
export SUFFIX=$(openssl rand -hex 3)   # random 6 chars

export COSMOS_NAME="${PREFIX}-cosmos-${SUFFIX}"
export FUNC_NAME="${PREFIX}-api-${SUFFIX}"
export SWA_NAME="${PREFIX}-addin-${SUFFIX}"
export STORAGE_NAME="${PREFIX//-/}stack${SUFFIX}"
```

### 3.2 Resource Group

```bash
az group create --name $RG --location $LOCATION \
  --tags Project=Nextage-DLP Environment=test Owner=mor.mordechai@nextage.co.il
```

### 3.3 Cosmos DB account (Serverless)

```bash
az cosmosdb create \
  --name $COSMOS_NAME --resource-group $RG --location $LOCATION \
  --default-consistency-level Session --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --locations regionName=$LOCATION failoverPriority=0

# Database
az cosmosdb sql database create \
  --account-name $COSMOS_NAME --resource-group $RG --name "dlp-database"

# 4 config containers
for container in dlp-customers dlp-advisors dlp-exemptions dlp-encryption-exclusions; do
  az cosmosdb sql container create \
    --account-name $COSMOS_NAME --resource-group $RG \
    --database-name "dlp-database" \
    --name $container --partition-key-path "/partitionKey"
done

# Audit log container with 90-day TTL
az cosmosdb sql container create \
  --account-name $COSMOS_NAME --resource-group $RG \
  --database-name "dlp-database" \
  --name "dlp-audit-log" --partition-key-path "/partitionKey" \
  --ttl 7776000
```

### 3.4 Storage account (required by Functions)

```bash
az storage account create \
  --name $STORAGE_NAME --resource-group $RG --location $LOCATION \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2
```

### 3.5 Log Analytics + Application Insights

```bash
az monitor log-analytics workspace create \
  --workspace-name "${PREFIX}-logs" --resource-group $RG --location $LOCATION \
  --sku PerGB2018 --retention-time 30

az monitor app-insights component create \
  --app "${PREFIX}-ai" --resource-group $RG --location $LOCATION \
  --workspace "${PREFIX}-logs" --application-type web
```

### 3.6 Function App (Consumption, Linux, Node 20)

```bash
az functionapp create \
  --name $FUNC_NAME --resource-group $RG --consumption-plan-location $LOCATION \
  --storage-account $STORAGE_NAME \
  --runtime node --runtime-version 20 --functions-version 4 \
  --os-type Linux --assign-identity [system]

# Configure app settings
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query documentEndpoint -o tsv)
AI_CONN=$(az monitor app-insights component show --app "${PREFIX}-ai" --resource-group $RG --query connectionString -o tsv)

az functionapp config appsettings set --name $FUNC_NAME --resource-group $RG --settings \
  COSMOS_ENDPOINT=$COSMOS_ENDPOINT \
  COSMOS_DATABASE="dlp-database" \
  APPLICATIONINSIGHTS_CONNECTION_STRING=$AI_CONN

# Configure CORS for the add-in origins
az functionapp cors add --name $FUNC_NAME --resource-group $RG \
  --allowed-origins "https://${SWA_NAME}.azurestaticapps.net" \
                    "https://localhost:3000" \
                    "https://outlook.office.com" \
                    "https://outlook.office365.com"

# Grant the Function's Managed Identity → Cosmos DB Data Contributor
FUNC_PRINCIPAL=$(az functionapp identity show --name $FUNC_NAME --resource-group $RG --query principalId -o tsv)
COSMOS_ID=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv)

az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME --resource-group $RG \
  --role-definition-id "00000000-0000-0000-0000-000000000002" \
  --principal-id $FUNC_PRINCIPAL --scope $COSMOS_ID
```

### 3.7 Static Web App

```bash
az staticwebapp create \
  --name $SWA_NAME --resource-group $RG --location $LOCATION \
  --sku Standard

SWA_TOKEN=$(az staticwebapp secrets list --name $SWA_NAME --resource-group $RG --query "properties.apiKey" -o tsv)
echo "SWA Deployment Token: $SWA_TOKEN"   # save this for Azure DevOps
```

### 3.8 Entra ID App Registration

```bash
ENTRA_CLIENT_ID=$(az ad app create --display-name "Nextage DLP Add-in" \
  --sign-in-audience AzureADMyOrg --query appId -o tsv)
echo "Entra Client ID: $ENTRA_CLIENT_ID"

# Configure Office SSO scope
az ad app update --id $ENTRA_CLIENT_ID \
  --identifier-uris "api://${SWA_NAME}.azurestaticapps.net/$ENTRA_CLIENT_ID" \
  --web-redirect-uris "https://${SWA_NAME}.azurestaticapps.net/auth/callback" "https://localhost:3000/auth/callback"

# Add Microsoft Graph permissions (User.Read + openid + profile)
az ad app permission add --id $ENTRA_CLIENT_ID \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope \
                    37f7f235-527c-4136-accd-4a02d197296e=Scope \
                    14dad69e-099b-42c9-810b-d002981feec1=Scope

# Grant admin consent (requires Global Admin)
az ad app permission admin-consent --id $ENTRA_CLIENT_ID
```

---

## 4. Post-infrastructure steps

### Verify resources exist

```bash
az resource list --resource-group $RG -o table
```

Expected: 8-9 resources (Cosmos, Function App, App Service Plan, Storage, Log Analytics, App Insights, Static Web App, Microsoft.Insights component).

### Verify the Entra App Registration

```bash
az ad app show --id $ENTRA_CLIENT_ID --query "{id:appId, name:displayName, scopes:api.oauth2PermissionScopes[*].value}"
```

Expected: One scope named `access_as_user`.

---

## 5. Seed Cosmos DB with initial data

Production Cosmos DB starts empty. Populate with at least one customer/advisor/exemption to allow smoke testing.

### Option 1 — Via local seed script (recommended)

```bash
cd /Users/mormordechay/nextage-dlp-addin-v3

# Edit scripts/seed-prod-data.ts to point at the production Cosmos endpoint
# (use Managed Identity from a VM, OR temporarily enable key-based access)

# For first-time seeding with key:
COSMOS_KEY=$(az cosmosdb keys list --name $COSMOS_NAME --resource-group $RG --query primaryMasterKey -o tsv)
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query documentEndpoint -o tsv)

# Run seed script (you'll create a prod-variant of scripts/seed-dev-data.ts)
PROD_COSMOS_ENDPOINT=$COSMOS_ENDPOINT PROD_COSMOS_KEY=$COSMOS_KEY npx ts-node scripts/seed-prod-data.ts
```

### Option 2 — Via Azure Portal

1. Open Azure Portal → Cosmos DB account → Data Explorer
2. Select `dlp-customers` container → New Item
3. Paste JSON for each customer:

```json
{
  "id": "cust-001",
  "partitionKey": "customers",
  "customerName": "ClientCorp Inc",
  "aliases": ["ClientCorp", "CC"],
  "primaryDomain": "clientcorp.com",
  "additionalDomains": [],
  "status": "ACTIVE",
  "updatedAt": "2026-05-19T00:00:00Z"
}
```

4. Repeat for advisors, exemptions, exclusions.

---

## 6. Azure DevOps pipeline setup

### 6.1 Push code to Azure DevOps Repo

```bash
cd /Users/mormordechay/nextage-dlp-addin-v3
git init
git add .
git commit -m "Initial commit - DLP v3"

# Create repo in Azure DevOps first (Project → Repos → New repository)
# Then push:
git remote add origin https://dev.azure.com/<org>/<project>/_git/dlp-addin-v3
git push -u origin main
```

### 6.2 Create Variable Group

In Azure DevOps → Pipelines → Library → + Variable group:

| Variable name | Value | Secret? |
|---------------|-------|---------|
| `AZURE_FUNCTIONS_URL` | (from Terraform output `function_app_url`) | No |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | (from Terraform output `static_web_app_deployment_token`) | **Yes** |

Name the group exactly: `nextage-dlp-prod`.

### 6.3 Create Service Connection

In Project Settings → Service connections → New → Azure Resource Manager:

- **Authentication:** Workload Identity Federation (recommended) or Service Principal
- **Scope:** Subscription → Resource Group `rg-nextage-dlp-prod`
- **Service connection name:** `nextage-azure-prod`
- Check **Grant access permission to all pipelines**

### 6.4 Create the Pipeline

Pipelines → New pipeline → Azure Repos Git → select `dlp-addin-v3` → **Existing Azure Pipelines YAML file** → select `/azure-pipelines.yml` → Save.

### 6.5 Configure Environment approvals (optional but recommended)

Pipelines → Environments → create `production-addin` and `production-api` → Approvals and checks → add yourself as required reviewer.

---

## 7. Update manifests with real values

You have to update both manifests with the values from Terraform/CLI outputs.

### 7.1 Update `manifest.json`

```bash
cd /Users/mormordechay/nextage-dlp-addin-v3

# Replace placeholders
sed -i '' "s|REPLACE-WITH-GENERATED-GUID|$(uuidgen | tr A-Z a-z)|g" manifest.json
sed -i '' "s|REPLACE-WITH-ENTRA-APP-ID|$ENTRA_CLIENT_ID|g" manifest.json
sed -i '' "s|nextage-dlp-addin.azurestaticapps.net|${SWA_URL#https://}|g" manifest.json
```

### 7.2 Update `manifest-legacy.xml`

```bash
sed -i '' "s|REPLACE-WITH-GENERATED-GUID|$(uuidgen | tr A-Z a-z)|g" manifest-legacy.xml
sed -i '' "s|nextage-dlp-addin.azurestaticapps.net|${SWA_URL#https://}|g" manifest-legacy.xml
```

### 7.3 Validate manifests

```bash
npx office-addin-manifest validate manifest.json
npx office-addin-manifest validate manifest-legacy.xml
```

Both should print "The manifest is valid."

### 7.4 Commit changes

```bash
git add manifest.json manifest-legacy.xml
git commit -m "Populate manifests with deployed Entra App ID and SWA URL"
git push
```

---

## 8. Deploy the code

The Azure DevOps pipeline triggers automatically on push to `main`. To verify:

1. Open Azure DevOps → Pipelines → most recent run
2. Watch the two stages: **BuildAndTest** then **Deploy**
3. Approve the Environment prompts if you enabled them
4. Expected total time: **5-8 minutes**

### Verify the deployment

```bash
# Add-in HTML/JS should be reachable
curl -I $SWA_URL/taskpane.html
# Expect: HTTP/2 200

# Function App should respond (401 is expected without auth)
curl -I $FUNC_URL/config
# Expect: HTTP/2 401 (Unauthorized — auth header required)
```

---

## 9. Sideload manifest in M365

1. Open Microsoft 365 Admin Center: https://admin.microsoft.com
2. Settings → **Integrated apps** → Upload custom apps
3. App type: **Office Add-in**
4. Upload **`manifest.json`** (the JSON one is preferred for OWA + Mobile)
5. Assignment: **Entire organization**
6. Click Deploy. Wait 12-24 hours for tenant-wide propagation (often available within 1 hour for the uploading admin).

### For Outlook Desktop on older Windows builds

Some Outlook Desktop versions still require the XML manifest. Upload `manifest-legacy.xml` as a second app entry for these users.

---

## 10. Smoke test

After M365 propagation completes:

1. Open Outlook Web (or Outlook Desktop) with a test tenant user
2. Click **New Email**
3. Fill in:
   - To: `test@clientcorp.com`
   - Subject: `דוח חודשי - ClientCorp`
   - Attach: an unencrypted Excel file (any `.xlsx`)
4. Click **Send**
5. Expected: Outlook displays an error dialog with the DLP block message. Email is NOT sent.

If the dialog appears → ✅ active blocking is working.

### Run all 25 test scenarios

Open `dlp-docs/3_תרחישי_בדיקה_DLP.docx` and run scenarios 1-20 + 3.1-3.4 against the deployed environment.

---

## 11. Rollback procedure

### Quick disable (no code change)

```bash
# Stop the Function App — OnMessageSend handler will fail-open (allow all sends)
az functionapp stop --name $FUNC_NAME --resource-group $RG
```

### Full rollback

```bash
# Remove the manifest from M365 Admin Center
# Then destroy the Azure resources:
cd terraform
terraform destroy
```

---

## 12. Troubleshooting

### "401 Unauthorized" when add-in calls `/api/config`

- Cause: Entra App admin consent was not granted, OR the manifest's `webApplicationInfo.id` doesn't match the deployed Entra Client ID.
- Fix:
  ```bash
  az ad app permission admin-consent --id $ENTRA_CLIENT_ID
  ```
- Verify manifest fields match Terraform outputs.

### Function App returns 500

- Open Application Insights → Failures → check the latest exception
- Common cause: Cosmos DB role assignment hasn't propagated yet (wait 5 minutes after `terraform apply`).

### Manifest validation fails

- Run `npx office-addin-manifest validate manifest.json -v` for verbose output
- Common cause: leftover `REPLACE-*` placeholders. Re-run the `sed` commands in section 7.

### Sideloaded add-in doesn't appear in Outlook ribbon

- Wait up to 24 hours for M365 propagation
- Force-refresh: Outlook Web → Settings → Manage Add-ins → Refresh
- Verify the user is in the assigned scope ("Entire organization" in M365 Admin Center)

### OnMessageSend handler doesn't fire

- Verify Mailbox API version: only **1.14+** supports `OnMessageSend` in Compose mode
- Check the user's Outlook version (Help → About Outlook)
- Look at Application Insights → Live metrics during a Send to confirm the handler is invoked

---

## Appendix — Resource cleanup checklist

When the test tenant project ends, run this in order:

1. Remove the manifest from M365 Admin Center
2. `cd terraform && terraform destroy`
3. Delete the Azure DevOps repo + pipeline
4. Verify no stranded resources: `az resource list --tag Project=Nextage-DLP -o table`

---

## Reference outputs from Terraform

After `terraform apply`, save these values (they don't change unless you re-create resources):

| Output | Use |
|--------|-----|
| `static_web_app_url` | Both manifests |
| `entra_app_client_id` | Both manifests + Function App settings |
| `function_app_url` | DevOps Variable Group |
| `static_web_app_deployment_token` | DevOps Variable Group (secret) |
| `cosmos_endpoint` | Function App settings (set automatically) |
| `entra_app_identifier_uri` | `manifest.json` → `webApplicationInfo.resource` |
