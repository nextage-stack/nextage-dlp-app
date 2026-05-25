// Cosmos DB client — uses Managed Identity in Azure, fixed key for local emulator dev.
// Env var validation happens on first use so the Functions host can start and
// return a structured error per-request instead of failing the whole worker.

import { CosmosClient, Database } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import https from "node:https";

const DB_NAME = process.env.COSMOS_DATABASE || "dlp-database";

let cachedClient: CosmosClient | null = null;

export function getCosmosClient(): CosmosClient {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) {
    throw new Error("COSMOS_ENDPOINT environment variable is required");
  }

  const isLocalEmulator =
    endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
  const devKey = process.env.COSMOS_KEY_DEV_ONLY;

  if (isLocalEmulator && devKey) {
    // Local emulator — fixed dev key + accept the self-signed cert.
    cachedClient = new CosmosClient({
      endpoint,
      key: devKey,
      agent: new https.Agent({ rejectUnauthorized: false }),
    });
  } else {
    // Azure — Managed Identity (no keys anywhere).
    cachedClient = new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
    });
  }

  return cachedClient;
}

export function getDatabase(): Database {
  return getCosmosClient().database(DB_NAME);
}

/** Reads all items from a container, filtering by `status === ACTIVE` when the field is present. */
export async function readAllFromContainer(containerName: string): Promise<unknown[]> {
  const container = getDatabase().container(containerName);
  const { resources } = await container.items
    .query<unknown>(
      'SELECT * FROM c WHERE c.status = "ACTIVE" OR NOT IS_DEFINED(c.status)',
    )
    .fetchAll();
  return resources;
}
