# Nextage DLP Guard — LOCAL dev version

This folder is a **completely separate, self-contained copy** of the add-in that
runs entirely on **your machine** (`https://localhost:3000`). Nothing here touches
the production website or the production add-in.

| | Production (`..\nextage-dlp-addin-v3`) | LOCAL (this folder) |
|---|---|---|
| Pages load from | the Azure website | **https://localhost:3000** (your PC) |
| Add-in GUID | `34e19114-…` | `ce4a8dba-…` (different) |
| Name in Outlook | "Nextage DLP Guard" | **"Nextage DLP Guard (LOCAL)"** |
| Runs when | always (hosted) | **only while `npm start` is running** |

Because the GUID and name differ, you can install **both at the same time** in the
same Outlook and tell them apart.

---

## One-time setup: trust the localhost certificate

Outlook desktop refuses to load `https://localhost` unless the certificate is
trusted by Windows. Run this **once** (a Windows prompt will ask to install a
certificate — click **Yes**):

```powershell
npm run setup-certs
```

This uses Microsoft's `office-addin-dev-certs` tool to create trusted certs in
`%USERPROFILE%\.office-addin-dev-certs\`. The dev server picks them up automatically.

> If `npm run setup-certs` is blocked, run it manually:
> `npx --yes office-addin-dev-certs install --machine`

---

## Every time you want to run locally

1. **Start the local server** (keep this terminal open the whole time):
   ```powershell
   npm start
   ```
   It serves the add-in at `https://localhost:3000`. Leave it running.

2. **Install the LOCAL manifest in Outlook** (only needed the first time):
   - Go to **https://aka.ms/olksideload** → scroll to **Custom add-ins**.
   - **+ Add a custom add-in → Add from file** → pick **this folder's `manifest.xml`**.
   - It installs as **"Nextage DLP Guard (LOCAL)"**.
   - Restart Outlook.

3. **Use it**: open a New Email → the **DLP Guard (LOCAL)** button appears in the
   compose ribbon. Because the server is your PC, **any code change is live after a
   rebuild** — no deploy needed.

4. **Stop**: press `Ctrl+C` in the terminal. The LOCAL add-in stops working until
   you `npm start` again (the production one is unaffected).

---

## Editing code

`npm start` watches your files. After you edit anything in `src/`, the server
rebuilds automatically — just **reopen the task pane** (or re-open the compose
window) in Outlook to see the change. No deploy, no website, no waiting.

---

## About the backend API

In local mode the DLP backend calls default to **`https://localhost:7071/api`**
(a local Azure Functions host). If you are **not** running that backend locally, the
config/audit calls fail "open" (the UI still loads and the checks still run with
defaults). To point the LOCAL add-in at the **production** API instead, set this
before `npm start`:

```powershell
$env:AZURE_FUNCTIONS_URL = "https://nextage-dlp-app-gchqasbzeqgkccf7.westeurope-01.azurewebsites.net/api"
npm start
```

---

## This folder vs production — never mix them

- Edit/test here freely. It only ever runs on your PC.
- When a change is proven and you want it live for real users, make the same change
  in the **production** folder and deploy `dist/` to the Azure website there.
- The two are independent: breaking something here can never affect production.
