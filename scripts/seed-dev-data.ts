// Seeds the local Cosmos DB emulator with representative DEV data.
// Run after setup-dev-cosmos.ts: npm run seed:cosmos

import { CosmosClient } from "@azure/cosmos";
import https from "node:https";

const client = new CosmosClient({
  endpoint: "https://localhost:8081",
  key: "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw==",
  agent: new https.Agent({ rejectUnauthorized: false }),
});

const db = client.database("dlp-database");

const customers = [
  {
    id: "cust-001",
    partitionKey: "customers",
    customerName: "ClientCorp Inc",
    aliases: ["ClientCorp", "CC"],
    primaryDomain: "clientcorp.com",
    additionalDomains: [],
    status: "ACTIVE",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cust-002",
    partitionKey: "customers",
    customerName: "Tech Solutions Ltd",
    aliases: ["TechSol", "TS"],
    primaryDomain: "techsol.co.il",
    additionalDomains: [],
    status: "ACTIVE",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cust-003",
    partitionKey: "customers",
    customerName: "Global Finance",
    aliases: ["GF", "Finance Corp"],
    primaryDomain: "globalfinance.net",
    additionalDomains: [],
    status: "ACTIVE",
    updatedAt: new Date().toISOString(),
  },
];

const advisors = [
  {
    id: "adv-001",
    partitionKey: "advisors",
    advisorName: "Advisor Test 1",
    emailDomain: "advisor1.com",
    linkedCustomers: ["cust-001"],
    status: "ACTIVE",
  },
  {
    id: "adv-002",
    partitionKey: "advisors",
    advisorName: "Advisor Test 2",
    emailDomain: "advisor2.com",
    linkedCustomers: ["cust-002"],
    status: "ACTIVE",
  },
  {
    id: "adv-003",
    partitionKey: "advisors",
    advisorName: "Advisor Test 3",
    emailDomain: "advisor3.com",
    linkedCustomers: ["cust-003"],
    status: "ACTIVE",
  },
];

const exemptions = [
  {
    id: "ex-001",
    partitionKey: "exemptions",
    userEmail: "admin@nextage.co.il",
    fullName: "IT Admin",
    exemptionType: "ALL_CHECKS",
    scope: "System administrator",
    expiryDate: null,
  },
];

const exclusions = [
  {
    id: "excl-001",
    partitionKey: "exclusions",
    emailAddress: null,
    domainPattern: "docsign.com",
    allowUnencrypted: true,
    reason: "DocuSign sends unsigned confirmation PDFs",
    expiryDate: null,
  },
];

async function main(): Promise<void> {
  console.log("Seeding DEV data...");

  await Promise.all([
    ...customers.map((c) => db.container("dlp-customers").items.upsert(c)),
    ...advisors.map((a) => db.container("dlp-advisors").items.upsert(a)),
    ...exemptions.map((e) => db.container("dlp-exemptions").items.upsert(e)),
    ...exclusions.map((x) => db.container("dlp-encryption-exclusions").items.upsert(x)),
  ]);

  console.log("✓ Seeded:");
  console.log("  -", customers.length, "customers");
  console.log("  -", advisors.length, "advisors");
  console.log("  -", exemptions.length, "exemptions");
  console.log("  -", exclusions.length, "exclusions");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
