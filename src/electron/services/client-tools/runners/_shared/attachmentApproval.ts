import { createHash } from 'node:crypto';

export const ODOO_ATTACHMENT_TOOL = 'OdooAttachPdf';
const approvals = new WeakMap<object, string>();

function fingerprint(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');
}

/** Called only by the trusted renderer permission resolver, never from tool arguments. */
export function recordAttachmentApproval(decision: object, input: unknown): void {
  if ((decision as { behavior?: string }).behavior !== 'allow') return;
  const updated = decision as { updatedInput?: unknown; updated_input?: unknown };
  approvals.set(decision, fingerprint(updated.updatedInput ?? updated.updated_input ?? input));
}

export function consumeAttachmentApproval(decision: unknown, input: unknown): boolean {
  if (!decision || typeof decision !== 'object') return false;
  const approved = approvals.get(decision);
  approvals.delete(decision);
  return Boolean(approved && approved === fingerprint(input));
}
