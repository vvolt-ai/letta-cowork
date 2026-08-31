import type { ZohoEmail } from "../../types";

function normalizePart(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Stable UI identity for one concrete mailbox message. Zoho message IDs are
 * not sufficient on their own because they are scoped to an account/folder.
 */
export function emailIdentityKeyFromParts(
  accountId: unknown,
  folderId: unknown,
  messageId: unknown
): string {
  return JSON.stringify([
    normalizePart(accountId),
    normalizePart(folderId),
    normalizePart(messageId),
  ]);
}

export function emailIdentityKey(email: Pick<ZohoEmail, "accountId" | "folderId" | "messageId">): string {
  return emailIdentityKeyFromParts(email.accountId, email.folderId, email.messageId);
}

/** Exact scoped marker embedded in email-session titles for safe recovery. */
export function emailSessionMarkerFromParts(
  accountId: unknown,
  folderId: unknown,
  messageId: unknown
): string {
  const encoded = [accountId, folderId, messageId]
    .map((value) => encodeURIComponent(normalizePart(value)))
    .join("|");
  return `[email:${encoded}]`;
}

export function emailSessionMarker(
  email: Pick<ZohoEmail, "accountId" | "folderId" | "messageId">
): string {
  return emailSessionMarkerFromParts(email.accountId, email.folderId, email.messageId);
}
