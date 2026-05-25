// Initializes the local Cosmos DB emulator with all required containers.
// Run once: npm run setup:cosmos

import { CosmosClient } from "@azure/cosmos";
import https from "node:https";

const EMULATOR_ENDPOINT = "https://localhost:8081";
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw==";

const client = new CosmosClient({
  endpoint: EMULATOR_ENDPOINT,
  key: EMULATOR_KEY,
  agent: new https.Agent({ rejectUnauthorized: false }),
});

async function main(): Promise<void> {
  const { database } = await client.databases.createIfNotExists({ id: "dlp-database" });
  console.log("✓ Database ready:", database.id);

  const containers = [
    { id: "dlp-customers", partitionKey: "/partitionKey" },
    { id: "dlp-advisors", partitionKey: "/partitionKey" },
    { id: "dlp-exemptions", partitionKey: "/partitionKey" },
    { id: "dlp-encryption-exclusions", partitionKey: "/partitionKey" },
    { id: "dlp-audit-log", partitionKey: "/partitionKey", defaultTtl: 7776000 },
  ];

  for (const def of containers) {
    const { container } = await database.containers.createIfNotExists(def);
    console.log("✓ Container ready:", container.id);
  }

  console.log("\nDEV Cosmos DB initialized.");
  console.log("Next: run `npm run seed:cosmos` to populate test data.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
