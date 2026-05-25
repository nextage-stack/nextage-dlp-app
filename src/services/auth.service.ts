// Office SSO token acquisition for calling the Azure Functions proxy.
// Uses Office.auth.getAccessToken() — silent token from the M365 session.

const AUTH_OPTIONS: Office.AuthOptions = {
  allowSignInPrompt: false,
  allowConsentPrompt: false,
  forMSGraphAccess: false,
};

const SAFETY_BUFFER_MS = 60_000;
const DEFAULT_LIFETIME_MS = 50 * 60 * 1000; // 50 min — used if exp can't be parsed

export class AuthService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  async getTokenSilent(): Promise<string> {
    if (this.cachedToken && this.tokenExpiresAt - SAFETY_BUFFER_MS > Date.now()) {
      return this.cachedToken;
    }

    try {
      const token = await Office.auth.getAccessToken(AUTH_OPTIONS);
      this.cachedToken = token;
      this.tokenExpiresAt = parseExpiry(token) ?? Date.now() + DEFAULT_LIFETIME_MS;
      return token;
    } catch (err: unknown) {
      const errorCode = (err as { code?: number })?.code;
      // 13001 = user not signed in; 13002 = consent required;
      // 13003 = unsupported user identity; 13007 = SSO not available
      console.error("[Auth] SSO token failed, code:", errorCode, err);
      throw new Error(`SSO token acquisition failed (code=${errorCode ?? "unknown"})`);
    }
  }

  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }
}

// Module-level singleton — reused across OnSend invocations and taskpane sessions
// so a cached token survives within one Office shared-runtime lifetime.
export const authService = new AuthService();

function parseExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      typeof atob === "function"
        ? atob(b64UrlToB64(parts[1]!))
        : Buffer.from(b64UrlToB64(parts[1]!), "base64").toString("utf8"),
    ) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function b64UrlToB64(s: string): string {
  return s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
}
