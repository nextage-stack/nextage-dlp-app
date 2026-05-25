// PII redaction helpers — audit entries store hashes + truncated previews
// rather than full subject lines / attachment names. The original content is
// what the DLP system is supposed to protect; storing it would defeat the point.

import { createHmac } from "node:crypto";

const HMAC_KEY = process.env.AUDIT_HMAC_KEY;

/**
 * Stable hex digest of `value` using HMAC-SHA256 with the server-side key.
 * Returns an empty string for falsy input. Returns `value` itself if the key
 * is unset (dev only — production must set AUDIT_HMAC_KEY).
 */
export function hashValue(value: string | undefined | null): string {
  if (!value) return "";
  if (!HMAC_KEY) {
    // Dev fallback: deterministic-but-unsalted prefix so tests don't break.
    return `dev:${value.slice(0, 64)}`;
  }
  return createHmac("sha256", HMAC_KEY).update(value).digest("hex");
}

/** Returns the first N chars of `value`, useful as a non-PII preview. */
export function preview(value: string | undefined | null, n = 8): string {
  if (!value) return "";
  return value.slice(0, n);
}

export interface RedactedAuditFields {
  recipientHashes: string[];
  recipientDomains: string[];
  attachmentNameHashes: string[];
  attachmentCount: number;
  subjectHash: string;
  subjectLength: number;
}

/** Hashes the fields the client sent so we never persist raw PII. */
export function redactAuditFields(
  recipientEmails: string[] | undefined,
  attachmentNames: string[] | undefined,
  messageSubject: string | undefined,
): RedactedAuditFields {
  const recipients = recipientEmails ?? [];
  const attachments = attachmentNames ?? [];
  return {
    recipientHashes: recipients.map(hashValue),
    recipientDomains: Array.from(
      new Set(
        recipients
          .map((r) => r.split("@")[1]?.toLowerCase())
          .filter((d): d is string => !!d),
      ),
    ),
    attachmentNameHashes: attachments.map(hashValue),
    attachmentCount: attachments.length,
    subjectHash: hashValue(messageSubject),
    subjectLength: messageSubject?.length ?? 0,
  };
}
