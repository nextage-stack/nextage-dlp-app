# Nextage DLP — Azure Deployment, Step by Step

This is the authoritative, sequential guide for deploying the Nextage DLP
add-in to Azure and making it available to end users in your Microsoft 365
tenant. Follow every step in order. Where a step has a checkbox, do not move
on until the verification passes.

> **Important:** the previous `DEPLOYMENT_GUIDE.md` describes an older flow.
> If anything in the two documents conflicts, this file wins.

---

## What you are deploying

```
┌──────────────────────────────────────────────────────────────┐
│   Outlook (Web / Desktop / Mac) — the user's mailbox         │
│                                                              │
│   1. Office.js loads taskpane.html + commands.js             │
│   2. OnMessageSend handler runs DLP checks                   │
│                                                              │
│                  ▼                       ▲                   │
│   ┌──────────────────────┐    ┌──────────────────────┐       │
│   │  Static Web App      │    │  Azure Functions     │       │
│   │  (HTML/JS/CSS)       │    │  /config, /audit     │       │
│   │  *.azurestaticapps.net│   │  *.azurewebsites.net │       │
│   └──────────────────────┘    └─────────┬────────────┘       │
│                                          │ Managed Identity  │
│                                          ▼                   │
│                                   ┌──────────────────┐       │
│                                   │  Cosmos DB       │       │
│                                   │  (Serverless)    │       │
│                                   └──────────────────┘       │
│                                                              │
│   Authentication: Entra ID (Azure AD) Office SSO             │
└──────────────────────────────────────────────────────────────┘
```

You need: Azure subscription, M365 tenant, a global admin's cooperation for
two consent steps. Total deploy time end-to-end is roughly 60–90 minutes the
first time.

---

## Phase 0 — Tooling and identities

Install on your workstation:

- **Azure CLI** ≥ 2.55 — `brew install azure-cli` or [download][az-cli]
- **Terraform** ≥ 1.7 — `brew install terraform` or [download][tf-dl]
- **Node.js** 20.x — `nvm install 20 && nvm use 20`
- **jq** — `brew install jq`

You need these Azure / M365 roles available (yours or a colleague's):

| Role | Where | Used for |
| --- | --- | --- |
| `Owner` or `Contributor + User Access Administrator` | The Azure subscription | Provision Cosmos / Functions / SWA, assign RBAC |
| `Application Administrator` or `Global Administrator` | Entra ID tenant | Create Entra app + grant admin consent |
| `Global Administrator` | M365 tenant | Upload integrated app + assign to users |

[az-cli]: https://learn.microsoft.com/cli/azure/install-azure-cli
[tf-dl]: https://developer.hashicorp.com/terraform/install

Then log in:

```bash
az login                               # opens browser
az account set --subscription <SUB_ID> # if you have multiple
az account show                        # confirm
```

- [ ] `az account show` lists the correct subscription and tenant.

---

## Phase 1 — Generate the two persistent secrets

These are **set once, never regenerated** for the life of the deployment.

```bash
# 1. The add-in's manifest GUID. End-user installs remember this; if you change
#    it later every install becomes a new add-in and re-prompts for consent.
uuidgen | tr "[:upper:]" "[:lower:]"
# → e.g. 8f4a2d1c-9b3e-4ad5-bc62-3f1c2d4e5f6a   (save it)

# 2. HMAC key used to hash PII (subject, recipients, attachment names) in audit
#    entries. Rotating invalidates historical hashes — only rotate during incidents.
openssl rand -hex 32
# → e.g. 7b8c9d...   (save it)
```

Store both in a password manager / Key Vault you control. You will paste them
into `terraform.tfvars` in the next step.

- [ ] Manifest GUID saved.
- [ ] HMAC key saved.

---

## Phase 2 — Provision Azure infrastructure with Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and fill in:

```hcl
subscription_id = "<your subscription id>"
tenant_id       = "<your tenant id>"
manifest_guid   = "<UUID from Phase 1>"
audit_hmac_key  = "<hex string from Phase 1>"

# Optional — but recommended for prod:
# cosmos_admin_ips = ["203.0.113.0/32"]   # your office IP for break-glass access
```

Run Terraform:

```bash
terraform init
terraform plan      # review carefully — nothing should be destroyed
terraform apply     # type 'yes' when prompted
```

When it finishes, capture the outputs:

```bash
terraform output -json > /tmp/dlp-outputs.json
terraform output deployment_summary
```

- [ ] `terraform apply` completed without errors.
- [ ] `terraform output entra_app_client_id` returns a GUID.
- [ ] `terraform output static_web_app_hostname` returns something like
      `nextage-dlp-addin-12345.azurestaticapps.net`.

> **Note:** Cosmos DB now has local-key authentication **disabled**. All access
> is via the Function App's Managed Identity. If you need to query Cosmos from
> a workstation for admin tasks, add your public IP to `cosmos_admin_ips` and
> use AAD authentication (`az cosmosdb sql query` or the Data Explorer with
> AAD sign-in). Do not re-enable master keys.

---

## Phase 3 — Grant admin consent for the Entra app

```bash
CLIENT_ID=$(terraform output -raw entra_app_client_id)

# This is the single command that turns "App registration exists" into
# "users in this tenant can actually sign in to the app". A Global Admin or
# Application Administrator must run it.
az ad app permission admin-consent --id "$CLIENT_ID"
```

If `az ad app permission admin-consent` fails with a delay error, wait 30 s
and retry — the application object may not have replicated yet.

Verify in the portal:

1. Open the [Entra Admin Center → App registrations][entra-apps].
2. Open your "Nextage DLP Add-in" registration.
3. **API permissions** → every row shows a green "Granted for &lt;Tenant&gt;" check.
4. **Expose an API** → there is a scope `access_as_user`, the **Application
   ID URI** matches `api://<swa-hostname>/<client-id>` exactly.

[entra-apps]: https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade

- [ ] Admin consent granted on all permissions.
- [ ] Application ID URI matches `terraform output entra_app_identifier_uri`.

---

## Phase 4 — Configure the Azure DevOps pipeline

### 4a. Set up the variable group

Azure DevOps → **Pipelines → Library → + Variable group → "nextage-dlp-prod"**.

Add the following variables. Use `terraform output` to fetch each value.

| Variable | Source | Secret? |
| --- | --- | --- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `terraform output -raw static_web_app_deployment_token` | ✅ |
| `AZURE_FUNCTIONS_URL` | `terraform output -raw function_app_url` | ❌ |
| `SWA_HOSTNAME` | `terraform output -json manifest_tokens \| jq -r .SWA_HOSTNAME` | ❌ |
| `FUNCTIONS_HOSTNAME` | `terraform output -json manifest_tokens \| jq -r .FUNCTIONS_HOSTNAME` | ❌ |
| `ENTRA_APP_CLIENT_ID` | `terraform output -raw entra_app_client_id` | ❌ |
| `MANIFEST_GUID` | The UUID from Phase 1 | ❌ |
| `FUNCTION_APP_NAME` | `terraform output -raw function_app_name` | ❌ |

Save the variable group.

### 4b. Create the Azure Resource Manager service connection

**Project Settings → Service connections → New → Azure Resource Manager →
Workload Identity Federation (recommended)** scoped to your resource group.
Name it `nextage-azure-prod` (the pipeline references this exact string).

### 4c. Create the deploy environments with approvals

**Pipelines → Environments → New** for each:

1. `production-addin`
2. `production-api`

On each environment: **Approvals and checks → + → Approvals**, add yourself
(and ideally one other person) as a required approver. Without this, any
merge to `main` deploys to production with no human gate.

- [ ] Variable group populated with all 7 values.
- [ ] Service connection `nextage-azure-prod` created.
- [ ] Both environments have manual approval gates.

---

## Phase 5 — Seed Cosmos DB with initial DLP rules

The add-in won't do anything useful until Cosmos is populated. Since local
auth is disabled, you cannot use connection strings — you must use AAD.

### 5a. Grant yourself temporary Cosmos data access

```bash
COSMOS_ACCT=$(terraform output -raw cosmos_account_name)
RG=$(terraform output -raw resource_group_name)
MY_OID=$(az ad signed-in-user show --query id -o tsv)

az cosmosdb sql role assignment create \
  --account-name "$COSMOS_ACCT" \
  --resource-group "$RG" \
  --role-definition-id "00000000-0000-0000-0000-000000000002" \
  --principal-id "$MY_OID" \
  --scope "/"
```

### 5b. Add your IP to the firewall

```bash
MY_IP=$(curl -s https://api.ipify.org)
az cosmosdb update --name "$COSMOS_ACCT" --resource-group "$RG" \
  --ip-range-filter "$(az cosmosdb show -n $COSMOS_ACCT -g $RG --query "ipRules[].ipAddressOrRange" -o tsv | tr '\n' ',')$MY_IP"
```

### 5c. Seed customers / advisors / exemptions / exclusions

Adapt `scripts/seed-dev-data.ts` for production (point at the live endpoint,
remove the dev key, use `DefaultAzureCredential`). Run it:

```bash
cd ..   # back to repo root
COSMOS_ENDPOINT=$(terraform output -raw cosmos_endpoint) \
COSMOS_DATABASE=dlp-database \
npx ts-node scripts/seed-prod-data.ts
```

Use the [Cosmos Data Explorer][cosmos-de] to confirm the four containers each
have rows.

[cosmos-de]: https://portal.azure.com

- [ ] `dlp-customers` container has at least one customer (your real
      customer list, not the dev fixtures).
- [ ] `dlp-advisors`, `dlp-exemptions`, `dlp-encryption-exclusions`
      contain whatever rows your business rules require.

### 5d. Revoke temporary access

After seeding succeeds, **remove** the temporary role assignment from 5a and
remove your IP from the firewall. Use the SWA/pipeline path for future updates.

---

## Phase 6 — First deploy via Azure DevOps

1. Commit any local changes and push to `main`. The pipeline starts
   automatically.
2. Watch **BuildAndTest** complete (lint + tests must pass — no
   `continueOnError`).
3. **Infra** stage runs `terraform plan` for visibility. Review it.
4. **Deploy** stage queues. Approve each environment when prompted.
5. After **DeployAddin** finishes, hit
   `https://$(terraform output -raw static_web_app_hostname)/taskpane.html`
   in a browser — you should see the taskpane HTML (it will fail to render
   data because Office.js isn't loaded outside Outlook; that's expected).
6. After **DeployApi** finishes, test the API:

   ```bash
   curl -i "https://$(terraform output -raw function_app_hostname)/api/config"
   # Expect: HTTP/1.1 401 — "Missing Bearer token"
   ```

   401 with the exact message is correct: JWT validation is rejecting
   unauthenticated callers. **A 200 here is a security bug**.

- [ ] `/api/config` returns 401 (not 200, not 500) without auth.
- [ ] SWA root URL returns 200.
- [ ] Both manifests in the SWA contain real GUIDs (no `REPLACE-WITH-` / `${...}`):

   ```bash
   curl -s "https://$(terraform output -raw static_web_app_hostname)/manifest.json" \
     | grep -E "REPLACE-WITH-|\\\$\\{" && echo "❌ bad" || echo "✓ clean"
   ```

---

## Phase 7 — Sideload the add-in for one test user

Before pushing to the entire org, validate end-to-end on yourself.

1. Download the deployed manifest:

   ```bash
   curl -O "https://$(terraform output -raw static_web_app_hostname)/manifest-legacy.xml"
   ```

2. Open Outlook on the web → **Settings (gear) → View all Outlook settings →
   General → Manage add-ins → My add-ins → Custom add-ins → Add a custom
   add-in → Add from file**, select the downloaded XML.

3. Open a new mail compose window. The **DLP Guard** ribbon button should
   appear. Click it — the taskpane should load and run all three checks.

4. With the dev tools open (F12 on Edge web Outlook), confirm there are no
   401/403 errors on `/api/config` or `/api/audit`.

5. Try sending a test email that should be blocked (e.g., unencrypted
   `.xlsx` to an external recipient). You should see the Outlook send dialog
   refuse and surface the DLP message.

If anything fails, see **Troubleshooting** below.

- [ ] Ribbon button visible in Outlook Web compose.
- [ ] Taskpane loads without console errors.
- [ ] A known-bad email is blocked at send time.
- [ ] An audit entry appears in Cosmos `dlp-audit-log` for the blocked send.

---

## Phase 8 — Roll out to end users via Microsoft 365 Admin Center

The XML manifest is what gets distributed; the JSON manifest is for future
unified-manifest scenarios.

1. Open the [Microsoft 365 Admin Center → Integrated apps][m365-apps].
2. **Upload custom apps → Office Add-in → Provide link to manifest file** or
   **Upload manifest file (.xml)** and pick your `manifest-legacy.xml`.
3. **Choose users:** start with a pilot group (5–10 users). After a week of
   no issues, expand to the whole org.
4. Microsoft 365 displays the permissions the add-in is asking for. Accept.
5. Click **Deploy** and wait — distribution can take **up to 12 hours** to
   reach all clients (Outlook Web is fastest, ~minutes; Outlook Desktop on
   Windows can take hours; Outlook for Mac requires a restart).

[m365-apps]: https://admin.microsoft.com/Adminportal/Home#/Settings/IntegratedApps

### What end users see

The first time the add-in runs in a user's Outlook:

- A consent dialog may appear if you skipped admin consent (Phase 3). With
  admin consent done, the user sees nothing — SSO is silent.
- A "DLP Guard" button appears on the **Home** ribbon of mail compose.
- When they click **Send**, the OnMessageSend handler runs invisibly. If the
  email is allowed, send proceeds normally. If blocked, Outlook shows a
  cancel-or-edit dialog with the DLP message.

- [ ] Pilot group can see the ribbon button.
- [ ] At least one pilot user has successfully sent a clean email.
- [ ] At least one pilot user has been blocked on a known-bad email.
- [ ] `dlp-audit-log` shows entries from pilot users.

---

## Phase 9 — Ongoing operations

### Updates

- Code changes → merge to `main` → pipeline auto-builds → approve deploy.
- Manifest changes (rare) require **redistribution** through Integrated apps.
  Bump the `version` field in `manifest-legacy.xml` first.
- Cosmos data (customers/exemptions) → update directly via Data Explorer
  (Phase 5 temporary access pattern) or build a small admin tool.

### Monitoring

- **App Insights** (auto-provisioned by Terraform) under
  `nextage-dlp-ai` — query failed requests with KQL:

  ```kql
  requests | where success == false | summarize count() by resultCode
  ```

- **Cosmos** under `dlp-audit-log` — search for `action == "DLP_UNAVAILABLE"`
  events. Non-zero counts mean DLP failed-open (network blip or auth issue).
- **Static Web Apps logs** — diagnose taskpane HTML / JS failures.

### Rotating the HMAC key

If you suspect the audit HMAC key has leaked:

1. Generate a new key (`openssl rand -hex 32`).
2. Update `audit_hmac_key` in `terraform.tfvars`.
3. `terraform apply` (only the Functions app setting changes).
4. New audit entries hash with the new key; old entries remain hashed with
   the old key but cannot be cross-correlated. Document the rotation date.

### Decommissioning

```bash
cd terraform
terraform destroy
```

Then remove the integrated app from Microsoft 365 Admin Center and the
Entra app registration from Entra ID (Terraform destroys the app, but
double-check in the portal).

---

## Troubleshooting

| Symptom | Probable cause | Fix |
| --- | --- | --- |
| Ribbon button missing | Manifest hasn't propagated yet | Wait up to 12 h; restart Outlook; try Outlook Web first |
| Taskpane "SSO token failed code=13007" | Office host doesn't support SSO (e.g., Outlook mobile) | Falls back gracefully but DLP runs in fail-open; check Office support matrix |
| `/api/config` returns 401 in the add-in | Audience mismatch | Check `ALLOWED_AUDIENCE` env on Functions matches the Entra identifier URI exactly |
| `/api/config` returns 403 "unexpected tenant" | Token came from a different tenant | Confirm `AZURE_TENANT_ID` Functions setting matches the tenant of the signed-in user |
| All sends fail-open silently | Coverage gap event in audit | Query `dlp-audit-log` for `action="DLP_UNAVAILABLE"` and inspect `details.reason` |
| Cosmos 401 from Functions | Managed identity not propagated yet | Wait 10 min after first deploy; restart Function App; verify role assignment with `az cosmosdb sql role assignment list` |
| Outlook Desktop blocks API calls | `AppDomains` missing in legacy XML manifest | Re-deploy — `manifest-legacy.xml` includes `<AppDomains>` since v3 |

---

## Quick reference: the variable map

| Where it lives | What it is | Source of truth |
| --- | --- | --- |
| `MANIFEST_GUID` (env) → manifest `<Id>` | Stable add-in identifier | `terraform.tfvars` (set once) |
| `ENTRA_APP_CLIENT_ID` (env) → manifest `webApplicationInfo.id` | Entra app's client ID | `terraform output entra_app_client_id` |
| `SWA_HOSTNAME` (env) → manifest URLs + validDomains | Static Web App default hostname | `terraform output manifest_tokens.SWA_HOSTNAME` |
| `FUNCTIONS_HOSTNAME` (env) → manifest validDomains + AppDomains | Function App default hostname | `terraform output manifest_tokens.FUNCTIONS_HOSTNAME` |
| `ALLOWED_AUDIENCE` (Function app setting) | JWT `aud` accepted by API | `terraform output entra_app_identifier_uri` |
| `AZURE_TENANT_ID` (Function app setting) | JWT `tid` accepted by API | `terraform.tfvars` |
| `AUDIT_HMAC_KEY` (Function app setting) | PII redaction key | `terraform.tfvars` |
