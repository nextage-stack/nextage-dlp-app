# Next Steps — Path to Production

The v3 codebase is **architecturally complete** but requires several external dependencies to be set up before it can run end-to-end. This document is the implementation playbook.

---

## Decisions captured

Based on stakeholder answers (2026-05-18):

| # | Question | Answer | Implication |
|---|----------|--------|-------------|
| 1 | Resource naming | A — Defaults | `nextage-dlp-addin`, `nextage-dlp-api`, `nextage-dlp-cosmos`, `rg-nextage-dlp-prod` |
| 2 | Custom domain | A — Azure-provided | `https://nextage-dlp-addin.azurestaticapps.net` (no DNS work needed) |
| 3 | Source control | C — Azure DevOps Repos | Pipeline = `azure-pipelines.yml` (GitHub Actions removed) |
| 4 | Config management | A — Azure Portal | IT edits Cosmos config in Data Explorer; no admin SPA in v3.0 |
| 5 | Pilot scope | Tenant-wide by domain | Deploy to all `@nextage.co.il` users in the **test tenant** |
| 6 | Production go-live | **Out of scope** | This engagement targets the test tenant only; live Nextage tenant rollout is a separate future project |
| 7 | SAFE_MODE setting | **false (active blocking)** | Real block via `event.completed({ allowEvent: false })`; this is acceptable in test tenant |

---

## Azure DevOps setup (one-time, before Phase 1)

1. **Create / use existing Azure DevOps Project** (e.g., `Nextage-Internal`)
2. **Create Repo**: `dlp-addin-v3` — push this codebase
3. **Create Variable Group** in Pipelines → Library:
   - Name: `nextage-dlp-prod`
   - Variables:
     - `AZURE_FUNCTIONS_URL` = `https://nextage-dlp-api.azurewebsites.net/api`
     - `AZURE_STATIC_WEB_APPS_API_TOKEN` (mark as secret — value from Phase 1 step 5)
4. **Create Service Connection** in Project Settings → Service connections:
   - Name: `nextage-azure-prod`
   - Type: Azure Resource Manager (Workload Identity Federation preferred)
   - Scope: `rg-nextage-dlp-prod` subscription/resource group
5. **Create Pipeline** linked to `azure-pipelines.yml` in the repo root
6. **Approve Environments** when first run prompts:
   - `production-addin` — add Mor as required reviewer
   - `production-api` — add Mor as required reviewer

---

## Phase 0 — Local development verification (1 day)

Goal: Get the new codebase running locally with the Cosmos DB Emulator. This proves the code compiles and the architecture is sound before any Azure investment.

### Steps

1. **Install Node 20 LTS + Azure Functions Core Tools v4 + Cosmos DB Emulator** (see [README](./README.md#prerequisites))
2. **Install npm dependencies**: `npm install` in both root and `api/`
3. **Generate mkcert certs** for trusted localhost HTTPS
4. **Run `npm run setup:cosmos` then `npm run seed:cosmos`** — Cosmos containers populated with the same 3 customers/3 advisors as the v1 fallback data
5. **Start Functions API** (`cd api && npm start` → http://localhost:7071/api/config returns JSON)
6. **Start add-in dev server** (`npm run start` → https://localhost:3000)
7. **Sideload `manifest-legacy.xml`** to Outlook Web with `intunetest@nextage.co.il`
8. **Verify** — open compose window, click "בדוק DLP", confirm 3 checks run against Cosmos data

### Deliverable

A working local environment that mirrors production architecture. **Acceptance criteria:** all 25 test scenarios from v2 pass against the Cosmos backend.

---

## Phase 1 — Azure infrastructure (2-3 days, requires IT/Cloud Ops)

This phase **cannot start until** the Azure access request (`1_בקשת_משאבים_Azure.docx`) is approved.

### Steps

1. **Resource Group**
   ```bash
   az group create --name rg-nextage-dlp-prod --location westeurope \
     --tags Owner=mor.mordechai@nextage.co.il Environment=prod CostCenter=IT
   ```

2. **Cosmos DB Account (Serverless)**
   ```bash
   az cosmosdb create --name nextage-dlp-cosmos --resource-group rg-nextage-dlp-prod \
     --default-consistency-level Session --kind GlobalDocumentDB \
     --enable-serverless true --locations regionName=westeurope
   ```
   Then create 5 containers via Portal or CLI (see `scripts/setup-dev-cosmos.ts` for IDs).

3. **Azure Functions v4 (Consumption)**
   ```bash
   az functionapp create --resource-group rg-nextage-dlp-prod \
     --consumption-plan-location westeurope \
     --runtime node --runtime-version 20 --functions-version 4 \
     --name nextage-dlp-api --storage-account nextagestack \
     --assign-identity [system]
   ```

4. **Grant Function's Managed Identity → Cosmos DB Data Contributor role**
   ```bash
   PRINCIPAL_ID=$(az functionapp identity show -n nextage-dlp-api -g rg-nextage-dlp-prod --query principalId -o tsv)
   az cosmosdb sql role assignment create --account-name nextage-dlp-cosmos \
     --resource-group rg-nextage-dlp-prod \
     --role-definition-name 'Cosmos DB Built-in Data Contributor' \
     --principal-id $PRINCIPAL_ID --scope /
   ```

5. **Static Web App (Standard tier)**
   ```bash
   az staticwebapp create --name nextage-dlp-addin \
     --resource-group rg-nextage-dlp-prod --location westeurope --sku Standard \
     --source https://github.com/<your-org>/nextage-dlp-addin-v3 --branch main \
     --app-location '/' --output-location 'dist'
   ```

6. **Entra ID App Registration** (via Portal or `az ad app create`)
   - Configure redirect URIs:
     - `https://<your-swa-name>.azurestaticapps.net/auth/callback`
     - `https://localhost:3000/auth/callback` (development)
   - Expose API scope: `access_as_user`
   - Capture Application (client) ID → save in env var
   - **Request Admin Consent** from Global Admin for the tenant

7. **Update both manifests** with the real Entra App ID and SWA URL
   - `manifest.json` → `webApplicationInfo.id` + `validDomains`
   - `manifest-legacy.xml` → bt:Urls + SourceLocation

### Deliverable

Live Azure resources with the API responding at `https://nextage-dlp-api.azurewebsites.net/api/config`.

---

## Phase 2 — OnMessageSend wiring (1-2 days)

The code in `src/commands/commands.ts` is complete but requires manifest validation in real Outlook clients.

### Steps

1. **Build production bundle**: `npm run build` (outputs `dist/`)
2. **Deploy to Azure SWA** via GitHub Actions (push to `main`) or manual SWA CLI
3. **Re-upload `manifest.json` via M365 Admin Center** for the pilot group
4. **Test OnMessageSend in three clients**:
   - Outlook Web (OWA) — primary target
   - Outlook Desktop Windows (Click-to-Run)
   - Outlook Desktop Mac
5. **Verify behaviors**:
   - PASS → email sends normally
   - BLOCK in Safe Mode → email sends, but UI shows red BLOCK
   - BLOCK in Production Mode (set `SAFE_MODE=false` + redeploy) → email cancelled via `event.completed({ allowEvent: false })`

### Deliverable

Working active blocking on at least 2 of 3 Outlook clients (OWA mandatory).

---

## Phase 3 — Test tenant rollout with active blocking (2 weeks)

**Scope decision (Q5+Q7):** Deploy to the entire test tenant with `SAFE_MODE = false` — emails that fail DLP checks are **actually blocked** by `event.completed({ allowEvent: false })`. This is the correct setting for a test tenant: it exercises the full production code path without risking live customer email.

### Steps

1. **Populate Cosmos DB with representative test data**:
   - Test customers (covering domain matching, aliases, additional domains)
   - Test advisors with linked customers
   - At least 1 exemption record (IT admin / test user) to verify bypass logic
   - At least 1 exclusion record (allow unencrypted to a specific domain)
2. **Verify `SAFE_MODE = false`** in `src/shared/constants.ts` (set by this engagement)
3. **Deploy `manifest.json` to the test tenant** via M365 Admin Center:
   - Microsoft 365 Admin Center → Settings → Integrated apps → Upload custom apps
   - Assignment: **"Entire organization"** (within the test tenant)
4. **Monitor App Insights for the first 48 hours**:
   - Error rate (`event.completed` failures)
   - p99 latency of OnMessageSend handler
   - Audit log volume (BLOCK actions per day)
5. **Run all 25 test scenarios** (see existing `3_תרחישי_בדיקה_DLP.docx`) against the deployed test tenant
6. **Communicate to test users** — short note explaining:
   - Active blocking is enabled in the test tenant
   - How to use the exemption mechanism if a legitimate email gets blocked
   - Where to report false positives

### Deliverable

Test tenant running with `SAFE_MODE=false` for 2 weeks. All 25 test scenarios pass. Block→allow ratio validated against expected behavior. No critical bugs in OnMessageSend handler.

---

## Phase 4 — Production tenant rollout (OUT OF SCOPE for this engagement)

> **Status:** Out of scope. This engagement targets the test tenant only. Migrating the working solution from test tenant to the live Nextage production tenant is a future project that will require:
> - Separate Azure subscription / resource group decisions
> - Production Cosmos DB with real customer/advisor data from CRM
> - Production Entra ID App Registration + Admin Consent in the live tenant
> - Stakeholder communication plan for Nextage employees
> - Helpdesk training on DLP block messages and the exemption workflow
>
> Reference materials in this repo (`NEXT_STEPS.md`, `azure-pipelines.yml`, infra commands) are reusable for that future project; only configuration values change.

---

## Phase 5 — Enhancements (2-3 weeks, parallel to Phase 4)

Lower priority items that can ship after the core is live:

- **PDF encryption detection** — parse the `/Encrypt` dictionary in the PDF cross-reference table
- **Admin portal** — React SPA for managing Cosmos DB config (customers, exemptions) without Portal access
- **Outlook Mobile support** — `MobileFormFactor` in manifest + degraded Check 1 (name-only since `getAttachmentContentAsync` is unavailable on mobile)
- **Automated E2E tests** — Jest + Office.js mocks for all 25 scenarios
- **Exchange Transport Rules** — server-side backup layer for users who disable the add-in
- **Microsoft Purview DLP integration** — feed events into Sentinel SIEM

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Admin Consent rejected by InfoSec | Submit `2_מסמך_אישור_פתרון_DLP.docx` ahead of time; emphasize Managed Identity + no third-party data flow |
| Outlook Mobile users uncovered by OnSend | Phase 5 adds MobileFormFactor; until then, mobile relies on Exchange Transport Rules |
| False positive blocks legitimate email | `SAFE_MODE=true` during pilot; exemption process documented; rollback plan = redeploy with `SAFE_MODE=true` |
| Cosmos DB outage | 60-min sessionStorage cache; fail-open policy in OnSend handler — never blocks work |
| Azure cost overrun | Serverless billing; budget alert at $50/month; current estimate $10-22/month for 200 users |

---

## Key references

- Spec doc: `/Users/mormordechay/Downloads/NextAge DLP - Documentation.docx`
- Original prototype (untouched): `/Users/mormordechay/nextage-dlp-addin/`
- Previous handover documents: `/Users/mormordechay/Documents/ClaudeProj/Mor-Workspace/the-system-v9/dlp-docs/`

## Decision log

| Decision | Rationale | Date |
|----------|-----------|------|
| Cosmos DB over SharePoint/Graph | <15ms reads vs 300-800ms; no CORS issues | 2026-05-18 |
| Azure Functions proxy | Hide Cosmos keys; centralize auth | 2026-05-18 |
| Unified Manifest as primary | Microsoft's go-forward direction; supports Mobile | 2026-05-18 |
| TypeScript strict mode | Catches null-handling bugs at compile time | 2026-05-18 |
| Fail-open on critical errors | Productivity > paranoid blocking | 2026-05-18 |
| Default Azure resource names (Q1=A) | `nextage-dlp-addin` / `nextage-dlp-api` / `nextage-dlp-cosmos` / `rg-nextage-dlp-prod` | 2026-05-18 |
| Azure-provided URL (Q2=A) | `https://nextage-dlp-addin.azurestaticapps.net` — no custom domain for pilot | 2026-05-18 |
| Azure DevOps Repos + Pipelines (Q3=C) | Replaces GitHub Actions; pipeline at `azure-pipelines.yml` | 2026-05-18 |
| Cosmos managed via Azure Portal (Q4=A) | No admin SPA in v3.0; IT edits config in Data Explorer | 2026-05-18 |
| Test tenant deployment (Q5) | Deploy to entire test tenant (filtered by `@nextage.co.il` domain); no explicit pilot group | 2026-05-19 |
| Active blocking enabled (Q7) | `SAFE_MODE = false` — emails actually cancelled via `event.completed({ allowEvent: false })`; acceptable in test tenant | 2026-05-19 |
| Production tenant rollout deferred (Q6) | Out of scope for this engagement; future project once test tenant validates the solution | 2026-05-19 |
