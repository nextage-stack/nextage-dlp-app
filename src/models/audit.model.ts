// Audit log entry — written to Cosmos DB container dlp-audit-log

export type AuditAction =
  | "SEND_BLOCKED"
  | "SEND_ALLOWED"
  | "WARNING_SHOWN"
  | "EXEMPTION_APPLIED"
  | "MANUAL_CHECK"
  | "DLP_UNAVAILABLE";

export type AuditResult = "PASSED" | "FAILED" | "WARNED" | "EXEMPTED";

export interface AuditEntry {
  id: string;
  partitionKey: string; // userEmail
  timestamp: string;
  userEmail: string;
  action: AuditAction;
  checkNumber: 1 | 2 | 3 | 0; // 0 = aggregate event
  result: AuditResult;
  recipientEmails: string[];
  attachmentNames: string[];
  messageSubject: string;
  severity: "BLOCK" | "WARNING" | "INFO";
  ttl: number; // seconds — 90 days default
}
