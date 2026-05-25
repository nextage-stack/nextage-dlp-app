// Writes audit log entries to Azure Functions proxy. Fire-and-forget — never blocks send.

import { AuditAction, AuditEntry, AuditResult } from "../models/audit.model";
import { DLPResult, EmailData } from "../models/dlp-result.model";
import { API_BASE_URL, API_TIMEOUT_MS, AUDIT_TTL_SECONDS } from "../shared/constants";

export class AuditService {
  constructor(private readonly accessToken: string) {}

  /**
   * Fire-and-forget audit write. Kicks off all entry posts and returns
   * immediately — failures are logged via the per-entry catch handler.
   */
  writeAudit(email: EmailData, result: DLPResult): void {
    const entries = this.buildEntries(email, result);
    entries.forEach((entry) => {
      this.postEntry(entry).catch((err) => {
        console.warn("[Audit] write failed:", err);
      });
    });
  }

  /**
   * Records a "DLP service unavailable" event so coverage gaps are observable
   * even though we fail-open. Fire-and-forget — never throws.
   */
  recordUnavailable(reason: string, partialEmail?: Partial<EmailData>): void {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      partitionKey: partialEmail?.userEmail ?? "unknown",
      timestamp: new Date().toISOString(),
      userEmail: partialEmail?.userEmail ?? "unknown",
      action: "DLP_UNAVAILABLE",
      checkNumber: 0,
      result: "FAILED",
      recipientEmails: partialEmail?.recipients ?? [],
      attachmentNames: (partialEmail?.attachments ?? []).map((a) => a.name),
      messageSubject: partialEmail?.subject ?? "",
      severity: "BLOCK",
      ttl: AUDIT_TTL_SECONDS,
    };

    this.postEntry({ ...entry, details: { reason } } as AuditEntry & { details: { reason: string } })
      .catch((err) => console.warn("[Audit] unavailable-event write failed:", err));
  }

  private buildEntries(email: EmailData, result: DLPResult): AuditEntry[] {
    const baseEntry = {
      partitionKey: email.userEmail,
      timestamp: new Date().toISOString(),
      userEmail: email.userEmail,
      recipientEmails: email.recipients,
      attachmentNames: email.attachments.map((a) => a.name),
      messageSubject: email.subject,
      ttl: AUDIT_TTL_SECONDS,
    };

    return result.results
      .filter((r) => !r.isValid)
      .map((r) => ({
        ...baseEntry,
        id: crypto.randomUUID(),
        action: this.mapAction(r.severity, result.shouldBlock),
        checkNumber: r.check,
        result: this.mapResult(r.severity),
        severity: r.severity,
      }));
  }

  private mapAction(severity: string, blocked: boolean): AuditAction {
    if (severity === "BLOCK" && blocked) return "SEND_BLOCKED";
    if (severity === "BLOCK") return "WARNING_SHOWN"; // Safe Mode: would-block became visible
    if (severity === "WARNING") return "WARNING_SHOWN";
    return "SEND_ALLOWED";
  }

  private mapResult(severity: string): AuditResult {
    switch (severity) {
      case "BLOCK":
        return "FAILED";
      case "WARNING":
        return "WARNED";
      default:
        return "PASSED";
    }
  }

  private async postEntry(entry: AuditEntry): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/audit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Audit API returned ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
