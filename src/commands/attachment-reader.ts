// Reads attachments + a header sample for encryption detection.
// Shared between commands.ts (OnSend) and taskpane.ts (manual check).
//
// The header sample is larger than just the magic bytes so Check 1 can:
//   - Parse the ZIP central directory's general-purpose-bit-flag (offset 0x06)
//   - Detect PDF /Encrypt entries that appear in the first few KB

import { AttachmentWithHeader } from "../models/dlp-result.model";

// 4 KiB is enough to (a) match every magic byte we care about, (b) read the
// first ZIP local file header including the general-purpose-bit-flag,
// (c) hit the leading "/Encrypt" reference for most encrypted PDFs.
const HEADER_BYTES = 4096;
// 4 KiB binary = ~5462 base64 chars. We slice a bit more for safety.
const BASE64_CHARS_TO_READ = 5600;

export async function readAttachmentsWithHeaders(
  item: Office.MessageCompose,
): Promise<AttachmentWithHeader[]> {
  const attachments = await listAttachments(item);
  const enriched = await Promise.all(
    attachments.map(async (att) => {
      const magicBytes = await readHeaderBytes(item, att.id).catch(() => null);
      return {
        id: att.id,
        name: att.name,
        size: att.size ?? 0,
        isInline: att.isInline ?? false,
        magicBytes,
      } satisfies AttachmentWithHeader;
    }),
  );
  return enriched;
}

function listAttachments(item: Office.MessageCompose): Promise<Office.AttachmentDetailsCompose[]> {
  return new Promise((resolve) => {
    if (typeof item.getAttachmentsAsync !== "function") {
      console.warn("[Attachments] getAttachmentsAsync unavailable");
      resolve([]);
      return;
    }
    item.getAttachmentsAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve((result.value ?? []) as Office.AttachmentDetailsCompose[]);
      } else {
        console.warn("[Attachments] failed:", result.error);
        resolve([]);
      }
    });
  });
}

function readHeaderBytes(item: Office.MessageCompose, attachmentId: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof item.getAttachmentContentAsync !== "function") {
      reject(new Error("getAttachmentContentAsync not available (mobile?)"));
      return;
    }

    item.getAttachmentContentAsync(
      attachmentId,
      { asyncContext: null },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error(result.error?.message ?? "Failed to read content"));
          return;
        }

        const value = result.value;
        if (value.format !== Office.MailboxEnums.AttachmentContentFormat.Base64) {
          reject(new Error(`Unsupported format: ${value.format}`));
          return;
        }

        try {
          // Trim to a multiple of 4 so atob doesn't choke on partial groups.
          const sample = value.content.slice(0, BASE64_CHARS_TO_READ);
          const aligned = sample.slice(0, sample.length - (sample.length % 4));
          const decoded = atob(aligned);
          const len = Math.min(HEADER_BYTES, decoded.length);
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = decoded.charCodeAt(i);
          }
          resolve(bytes);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    );
  });
}
