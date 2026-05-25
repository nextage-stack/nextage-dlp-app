# Nextage DLP Outlook Add-in — v3 (Production Architecture)

Production-ready rewrite based on the architectural specification authored with external consultants.

## ⚠️ Important

This is the **v3 rewrite** of the project. The original prototype at `/Users/mormordechay/nextage-dlp-addin/` is **untouched** and remains the working sideloaded version for ongoing testing.

This v3 codebase is the production target. It is not yet deployed — see [Next Steps](#next-steps) below.

---

## What's different from v1/v2

| Concern | v1/v2 (prototype) | v3 (production) |
|---------|-------------------|-----------------|
| Data store | SharePoint REST API (blocked by CORS) | **Azure Cosmos DB Serverless** (via Functions proxy) |
| Send blocking | Manual TaskPane only | **OnMessageSend Event** — real active blocking |
| Manifest | XML 1.5 | **Unified JSON Manifest 1.17** + XML 1.14 fallback |
| Office.js | Mailbox 1.8 | **Mailbox 1.14** (required for OnSend) |
| Auth | None (CORS workaround) | **Office SSO + Entra ID + Managed Identity** |
| TypeScript | 6.0 (relaxed) | **5.4 with strict mode** |
| File structure | 3 flat files | **Modular**: commands/, validators/, services/, models/, shared/ |
| Hosting | localhost:3000 | **Azure Static Web Apps** + global CDN |
| Backend | None | **Azure Functions v4 (Node 20)** — proxy with Managed Identity to Cosmos DB |
| CI/CD | None | **Azure DevOps Pipelines** → Azure SWA + Functions |
| Tests | Manual only | **Jest + Office.js mocks** (scaffolded) |

---

## Project structure

```
nextage-dlp-addin-v3/
├── src/
│   ├── commands/
│   │   ├── commands.ts          # OnMessageSend handler (ACTIVE BLOCKING)
│   │   └── attachment-reader.ts # Shared binary header reader
│   ├── taskpane/
│   │   ├── taskpane.ts          # Manual check UI logic
│   │   └── taskpane.html        # RTL Hebrew UI
│   ├── validators/
│   │   ├── validators.ts        # Orchestrator + DLPValidator
│   │   ├── check1-encryption.ts # Binary magic-byte detection
│   │   ├── check2-filename.ts   # Filename↔client name matching
│   │   └── check3-subject.ts    # Subject + unknown domain detection
│   ├── services/
│   │   ├── auth.service.ts      # Office SSO token cache
│   │   ├── config.service.ts    # Cosmos DB config (via Functions proxy)
│   │   └── audit.service.ts     # Audit log writes (fire-and-forget)
│   ├── models/
│   │   ├── customer.model.ts    # TypeScript interfaces for Cosmos DB
│   │   ├── audit.model.ts
│   │   └── dlp-result.model.ts
│   └── shared/
│       ├── cache.ts             # sessionStorage TTL wrapper
│       └── constants.ts         # SAFE_MODE flag + magic bytes
├── api/                          # Azure Functions v4
│   ├── src/
│   │   ├── functions/
│   │   │   ├── getConfig.ts     # GET /api/config
│   │   │   └── writeAudit.ts    # POST /api/audit
│   │   ├── cosmos.client.ts     # Managed Identity Cosmos client
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── host.json
│   └── local.settings.example.json
├── scripts/
│   ├── setup-dev-cosmos.ts      # Init local Cosmos emulator
│   └── seed-dev-data.ts         # Populate DEV test data
├── manifest.json                # Unified JSON manifest (primary)
├── manifest-legacy.xml          # XML fallback for legacy Outlook Desktop
├── webpack.config.cjs
├── tsconfig.json
├── jest.config.cjs
├── package.json
└── azure-pipelines.yml          # Azure DevOps CI/CD: build → test → deploy
```

---

## Quick start (local development)

### Prerequisites

| Tool | Min Version | Install |
|------|-------------|---------|
| Node.js LTS | 20.x | https://nodejs.org |
| Azure Functions Core Tools | 4.x | `npm i -g azure-functions-core-tools@4` |
| Azure CLI | 2.60+ | https://aka.ms/InstallAzureCli |
| Cosmos DB Emulator | latest | Windows: https://aka.ms/cosmosdb-emulator · Mac/Linux: docker (see below) |
| mkcert | latest | `brew install mkcert` (Mac) |

### 1. Install dependencies

```bash
cd /Users/mormordechay/nextage-dlp-addin-v3
npm install
cd api && npm install && cd ..
```

### 2. Start the local Cosmos DB Emulator

**Windows:** download from https://aka.ms/cosmosdb-emulator and launch from Start menu.

**Mac/Linux (Docker):**
```bash
docker run -p 8081:8081 -p 10251-10255:10251-10255 \
  -e AZURE_COSMOS_EMULATOR_PARTITION_COUNT=10 \
  -e AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=true \
  -e AZURE_COSMOS_EMULATOR_IP_ADDRESS_OVERRIDE=127.0.0.1 \
  -it mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:latest
```

### 3. Initialize Cosmos DB containers + seed data

```bash
npm run setup:cosmos
npm run seed:cosmos
```

### 4. Generate trusted HTTPS certificate

```bash
mkcert -install
mkcert -key-file certs/localhost.key -cert-file certs/localhost.crt localhost 127.0.0.1
```

### 5. Start the API (Azure Functions, port 7071)

```bash
cd api
cp local.settings.example.json local.settings.json
npm run build
npm start
```

### 6. Start the add-in dev server (port 3000)

In a separate terminal:
```bash
npm run start
```

### 7. Sideload manifest

Open Outlook Web with `intunetest@nextage.co.il`:
- Settings → Get Add-ins → My Add-ins → Upload Custom
- Upload `manifest-legacy.xml` (or `manifest.json` for OWA 2024+)

---

## Production deployment

See [Next Steps](#next-steps) below for the full Azure deployment workflow.

---

## Modes

`SAFE_MODE` in [`src/shared/constants.ts`](./src/shared/constants.ts):

- `SAFE_MODE = false` (**current value — active blocking enabled**) — BLOCK actively cancels the send via `event.completed({ allowEvent: false })`. This is set for the **test tenant** target environment.
- `SAFE_MODE = true` — BLOCK is displayed red in UI but send is **allowed**. Use only if you need a temporary warnings-only window.

Changing this flag requires a redeployment to Azure Static Web Apps via the Azure DevOps pipeline.

## Target environment

This codebase is being deployed to the **test tenant only**. Live Nextage production tenant rollout is out of scope for this engagement — see [`NEXT_STEPS.md`](./NEXT_STEPS.md) Phase 4.

---

## Next Steps

Detailed in [`NEXT_STEPS.md`](./NEXT_STEPS.md).

---

## Architecture decisions

See full architectural spec at `/Users/mormordechay/Downloads/NextAge DLP - Documentation.docx`.

Key decisions:
- **Cosmos DB Serverless** chosen over SharePoint/Graph for <15ms reads
- **Azure Functions proxy** chosen to avoid exposing Cosmos keys client-side
- **Managed Identity** between Functions and Cosmos — no connection strings in code
- **OnMessageSend + Shared Runtime** to enable active send blocking
- **Unified JSON Manifest** as primary; XML kept for legacy Outlook Desktop

---

## Contacts

- Developer: Mor Mordechai — Nextage IT
- Test User: `intunetest@nextage.co.il`
- Cosmos DB Account: `nextage-dlp-cosmos` (when deployed)
- Static Web App: `nextage-dlp-addin` (when deployed)
