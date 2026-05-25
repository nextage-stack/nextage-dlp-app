// scripts/build-manifests.ts
// Substitutes ${TOKEN} placeholders in manifest.json + manifest-legacy.xml using
// environment variables, writes the result to dist/. Fails the build if any
// REPLACE-WITH- token, or unresolved ${...} token, remains in the output.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Run from the project root via `npm run build:manifests`. We resolve relative
// to cwd rather than __dirname so this works under both CommonJS and ESM ts-node.
const ROOT = process.env.MANIFEST_ROOT_DIR
  ? resolve(process.env.MANIFEST_ROOT_DIR)
  : process.cwd();
const OUT_DIR = process.env.MANIFEST_OUT_DIR
  ? resolve(process.env.MANIFEST_OUT_DIR)
  : resolve(ROOT, "dist");

const REQUIRED_TOKENS = [
  "SWA_HOSTNAME",
  "FUNCTIONS_HOSTNAME",
  "ENTRA_APP_CLIENT_ID",
  "MANIFEST_GUID",
] as const;

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var ${name}. Set it via terraform output -> pipeline variables.`,
    );
  }
  return v.trim();
}

function substitute(content: string, vars: Record<string, string>): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (match, key: string) => {
    if (key in vars) return vars[key];
    throw new Error(`Unresolved placeholder ${match} — env var ${key} not provided`);
  });
}

function assertNoLegacyPlaceholders(content: string, file: string): void {
  if (/REPLACE-WITH-[A-Z0-9-]+/i.test(content)) {
    throw new Error(`${file} still contains a REPLACE-WITH- placeholder after substitution`);
  }
  const stray = content.match(/\$\{[A-Z0-9_]+\}/);
  if (stray) {
    throw new Error(`${file} still contains unresolved ${stray[0]}`);
  }
}

function build(srcFile: string, dstFile: string, vars: Record<string, string>): void {
  const src = readFileSync(srcFile, "utf8");
  const out = substitute(src, vars);
  assertNoLegacyPlaceholders(out, dstFile);

  const dir = dirname(dstFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(dstFile, out, "utf8");
  console.log(`✓ Wrote ${dstFile}`);
}

function main(): void {
  const vars: Record<string, string> = {};
  for (const tok of REQUIRED_TOKENS) {
    vars[tok] = getRequiredEnv(tok);
  }

  build(resolve(ROOT, "manifest.json"), resolve(OUT_DIR, "manifest.json"), vars);
  build(
    resolve(ROOT, "manifest-legacy.xml"),
    resolve(OUT_DIR, "manifest-legacy.xml"),
    vars,
  );

  console.log("Manifests built with:");
  for (const [k, v] of Object.entries(vars)) {
    console.log(`  ${k} = ${v}`);
  }
}

main();
