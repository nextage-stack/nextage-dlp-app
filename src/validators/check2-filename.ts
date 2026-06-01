// Check 2: Filename-to-client matching (WARNING only, never blocks).
//
// Token matching uses word boundaries so a customer alias of "CC" doesn't
// accidentally match the filename "account_ccharge_2024.xlsx".

import { Customer, Exemption } from "../models/customer.model";
import { AttachmentWithHeader, CheckResult } from "../models/dlp-result.model";
import { findCustomersInRecipients, getUserPermission } from "./shared";

export interface Check2Input {
  attachments: AttachmentWithHeader[];
  recipients: string[];
  userEmail: string;
  customers: Customer[];
  exemptions: Exemption[];
}

export function runCheck2(input: Check2Input): CheckResult {
  const { attachments, recipients, userEmail, customers, exemptions } = input;

  const permission = getUserPermission(userEmail, exemptions);
  if (permission === "ALL_CHECKS" || permission === "CHECK_2_BYPASS") {
    return pass("המשתמש פטור מבדיקת שם קובץ");
  }

  if (attachments.length === 0) {
    return pass("אין קבצים מצורפים");
  }

  const matched = findCustomersInRecipients(recipients, customers);
  if (matched.length === 0) {
    return pass("לא זוהה לקוח לפי הנמענים");
  }

  const validNames = new Set<string>();
  matched.forEach((c) => {
    if (c.customerName) validNames.add(c.customerName.toLowerCase());
    c.aliases.forEach((a) => validNames.add(a.toLowerCase()));
  });

  const tokens = Array.from(validNames).filter((t) => t.length > 0);

  const mismatched = attachments
    .map((a) => a.name)
    .filter((name) => !nameMatchesAnyToken(name, tokens));

  if (mismatched.length === 0) {
    return pass("✓ שמות הקבצים תואמים את הלקוח");
  }

  return {
    check: 2,
    isValid: false,
    severity: "WARNING",
    message: `שם קובץ לא תואם את הלקוח. שמות תקינים: ${tokens.join(", ")}`,
    details: { mismatched, validNames: tokens },
  };
}

function nameMatchesAnyToken(name: string, tokens: string[]): boolean {
  const lower = name.toLowerCase();
  // QA fix: prefer substring match. For long tokens (>3 chars) any
  // occurrence counts — "ClientCorpData.xlsx" matches "clientcorp".
  // Short aliases (≤3 chars like "CC", "TS") still require word boundaries
  // to avoid false matches like "CC" inside "account".
  return tokens.some((token) => {
    const idx = lower.indexOf(token);
    if (idx < 0) return false;
    if (token.length > 3) return true;
    const before = idx === 0 ? null : lower.charAt(idx - 1);
    const afterIdx = idx + token.length;
    const after = afterIdx >= lower.length ? null : lower.charAt(afterIdx);
    return isBoundary(before) && isBoundary(after);
  });
}

function isBoundary(ch: string | null): boolean {
  if (ch === null) return true;
  // Letters/digits are NOT boundaries; punctuation, whitespace, and dots are.
  // Includes Hebrew (֐-׿) and Arabic (؀-ۿ) ranges so an
  // alias in those scripts isn't incorrectly bounded.
  return !/[a-z0-9֐-׿؀-ۿ]/.test(ch);
}

function pass(message: string): CheckResult {
  return { check: 2, isValid: true, severity: "INFO", message };
}
