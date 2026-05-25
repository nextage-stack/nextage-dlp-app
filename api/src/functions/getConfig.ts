// GET /api/config — returns all DLP config (customers, advisors, exclusions, exemptions)
// Auth: validated Entra ID Bearer token from Office SSO.

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { isAuthError, verifyBearerToken } from "../auth.guard.js";
import { readAllFromContainer } from "../cosmos.client.js";

app.http("getConfig", {
  methods: ["GET"],
  authLevel: "anonymous", // JWT validated in code; see auth.guard.ts
  route: "config",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const principal = await verifyBearerToken(req);
      if (isAuthError(principal)) {
        return { status: principal.status, body: principal.body };
      }

      const [customers, advisors, exclusions, exemptions] = await Promise.all([
        readAllFromContainer("dlp-customers"),
        readAllFromContainer("dlp-advisors"),
        readAllFromContainer("dlp-encryption-exclusions"),
        readAllFromContainer("dlp-exemptions"),
      ]);

      ctx.log(
        `[getConfig] user=${principal.userObjectId} customers=${customers.length} ` +
          `advisors=${advisors.length} exclusions=${exclusions.length} exemptions=${exemptions.length}`,
      );

      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=3600",
        },
        jsonBody: { customers, advisors, exclusions, exemptions },
      };
    } catch (err: unknown) {
      ctx.error("[getConfig] error:", err);
      return { status: 500, body: "Internal server error" };
    }
  },
});
