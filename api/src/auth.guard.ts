// Validates Entra ID (Azure AD) JWTs issued for the add-in's API scope.
// The Office.js SSO token is verified against the tenant's JWKS endpoint, then
// the function handler trusts only the claims returned here — never the request body.

import { HttpRequest } from "@azure/functions";
import jwt, { JwtPayload } from "jsonwebtoken";
import jwksClient, { JwksClient } from "jwks-rsa";

const TENANT_ID = process.env.AZURE_TENANT_ID;
const ALLOWED_AUDIENCE = process.env.ALLOWED_AUDIENCE;
const ALLOWED_CLIENT_ID = process.env.ALLOWED_CLIENT_ID;

let cachedJwks: JwksClient | null = null;

function getJwksClient(): JwksClient {
  if (cachedJwks) return cachedJwks;
  if (!TENANT_ID) {
    throw new Error("AZURE_TENANT_ID env var is required");
  }
  cachedJwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 24 * 60 * 60 * 1000, // 24h
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
  return cachedJwks;
}

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err, key) => {
      if (err || !key) {
        reject(err ?? new Error("Signing key not found"));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}

export interface VerifiedPrincipal {
  /** User principal name / email (from `preferred_username` or `upn`). Lower-cased. */
  userEmail: string;
  /** Object ID of the user in the tenant (`oid` claim). Stable across renames. */
  userObjectId: string;
  /** Tenant ID (`tid` claim). */
  tenantId: string;
  /** The raw verified token payload, for advanced callers. */
  claims: JwtPayload;
}

export interface AuthError {
  status: 401 | 403 | 500;
  body: string;
}

/**
 * Validates the `Authorization: Bearer <jwt>` header. Returns either a
 * `VerifiedPrincipal` (success) or an `AuthError` to return to the caller.
 *
 * Performs full signature validation, audience, issuer, tenant, and expiry checks.
 */
export async function verifyBearerToken(
  req: HttpRequest,
): Promise<VerifiedPrincipal | AuthError> {
  if (!TENANT_ID || !ALLOWED_AUDIENCE) {
    // Misconfiguration — surface as 500 so it shows up in monitoring.
    return { status: 500, body: "Server misconfigured: missing tenant/audience" };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { status: 401, body: "Missing Bearer token" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { status: 401, body: "Empty Bearer token" };
  }

  // Decode header to find the signing key id (kid)
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    return { status: 401, body: "Malformed token" };
  }

  let signingKey: string;
  try {
    signingKey = await getSigningKey(decoded.header.kid);
  } catch {
    return { status: 401, body: "Unable to resolve signing key" };
  }

  // Accept the v2.0 issuer for the configured tenant.
  // (v1 issuer `https://sts.windows.net/{tid}/` is not used for v2 tokens.)
  const expectedIssuer = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      audience: ALLOWED_AUDIENCE,
      issuer: expectedIssuer,
      clockTolerance: 60,
    }) as JwtPayload;
  } catch {
    return { status: 401, body: "Invalid token" };
  }

  // Defense-in-depth: re-check tenant claim
  if (payload.tid !== TENANT_ID) {
    return { status: 403, body: "Token from unexpected tenant" };
  }

  // Optional: pin to a single client_id (the add-in's Entra app)
  if (ALLOWED_CLIENT_ID && payload.azp !== ALLOWED_CLIENT_ID && payload.appid !== ALLOWED_CLIENT_ID) {
    return { status: 403, body: "Token from unexpected client" };
  }

  // Extract user identity. Office.js SSO tokens include both preferred_username and upn.
  const userEmail = (
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    (typeof payload.upn === "string" && payload.upn) ||
    (typeof payload.email === "string" && payload.email) ||
    ""
  )
    .toString()
    .toLowerCase()
    .trim();

  const userObjectId = typeof payload.oid === "string" ? payload.oid : "";

  if (!userEmail || !userObjectId) {
    return { status: 403, body: "Token missing required user claims" };
  }

  return {
    userEmail,
    userObjectId,
    tenantId: payload.tid as string,
    claims: payload,
  };
}

export function isAuthError(
  result: VerifiedPrincipal | AuthError,
): result is AuthError {
  return (result as AuthError).status !== undefined;
}
