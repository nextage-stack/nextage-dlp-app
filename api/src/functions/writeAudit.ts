// POST /api/audit — appends one audit log entry to Cosmos DB.
// Auth: validated Entra ID Bearer token from Office SSO.
// The server overrides userEmail and partitionKey from the verified token so a
// client cannot impersonate another user or pollute someone else's partition.
// PII (subject, recipients, attachment names) is hashed before persistence.

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { randomUUID } from "node:crypto";
import { isAuthError, verifyBearerToken } from "../auth.guard.js";
import { getDatabase } from "../cosmos.client.js";
import { redactAuditFields } from "../pii.js";

interface IncomingAuditEntry {
  id?: string;
  timestamp?: string;
  action?: string;
  checkNumber?: number;
  result?: string;
  recipientEmails?: string[];
  attachmentNames?: string[];
  messageSubject?: string;
  severity?: string;
  ttl?: number;
}

const DAY = 86_400;
const YEAR = 31_536_000;

app.http("writeAudit", {
  methods: ["POST"],
  authLevel: "anonymous", // JWT validated in code; see auth.guard.ts
  route: "audit",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const principal = await verifyBearerToken(req);
      if (isAuthError(principal)) {
        return { status: principal.status, body: principal.body };
      }

      const body = (await req.json()) as IncomingAuditEntry;

      // Required fields the client must supply (everything else is overridden server-side)
      if (!body.action || typeof body.checkNumber !== "number" || !body.result) {
        return { status: 400, body: "Missing required fields: action, checkNumber, result" };
      }

      const redacted = redactAuditFields(
        body.recipientEmails,
        body.attachmentNames,
        body.messageSubject,
      );

      const persisted = {
        id: body.id ?? randomUUID(),
        // Identity ALWAYS comes from the verified token, never the request body.
        partitionKey: principal.userEmail,
        userEmail: principal.userEmail,
        userObjectId: principal.userObjectId,
        tenantId: principal.tenantId,
        timestamp: typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString(),
        action: body.action,
        checkNumber: body.checkNumber,
        result: body.result,
        severity: body.severity ?? "INFO",
        ...redacted,
        ttl: clampTtl(body.ttl),
      };

      const container = getDatabase().container("dlp-audit-log");
      await container.items.create(persisted);

      return { status: 201, body: "Created" };
    } catch (err: unknown) {
      ctx.error("[writeAudit] error:", err);
      return { status: 500, body: "Internal server error" };
    }
  },
});

function clampTtl(value: unknown): number {
  const num = typeof value === "number" ? value : 90 * DAY;
  return Math.max(DAY, Math.min(YEAR, num));
}
