import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative } from 'node:path';

import { consumeAttachmentApproval } from './attachmentApproval.js';

import type { AttachmentRecovery } from './odooAttachmentRecovery.js';
import type { ToolRunContext } from '../../types.js';

export const PRIME_ATTACHMENT_AGENT = 'agent-b3ec33ef-7769-4fd6-8859-e6e064fe7384';
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const active = new Set<string>();

export interface OdooAttachmentInput {
  file_path: string;
  expected_sha256: string;
  so_id: number;
  so_name: string;
  expected_partner_id: number;
  expected_po_reference: string;
  source_account_id: string;
  source_folder_id: string;
  source_message_id: string;
}

export type OdooAttachmentCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Row = Record<string, unknown>;

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  throw new Error('CONNECTOR_READ_UNVERIFIED');
}

function safeId(value: unknown): number | null {
  const id = Array.isArray(value) ? value[0] : value;
  return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null;
}

function validateInput(raw: Record<string, unknown>): OdooAttachmentInput {
  const keys = [
    'file_path',
    'expected_sha256',
    'so_id',
    'so_name',
    'expected_partner_id',
    'expected_po_reference',
    'source_account_id',
    'source_folder_id',
    'source_message_id',
  ];
  if (
    Object.keys(raw).some((key) => !keys.includes(key)) ||
    keys.some((key) => raw[key] === undefined)
  ) {
    throw new Error('INPUT_INVALID');
  }
  const input = raw as unknown as OdooAttachmentInput;
  if (
    typeof input.file_path !== 'string' ||
    !isAbsolute(input.file_path) ||
    /^(\\\\|\/\/)/.test(input.file_path) ||
    extname(input.file_path).toLowerCase() !== '.pdf' ||
    typeof input.expected_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(input.expected_sha256) ||
    !safeId(input.so_id) ||
    !safeId(input.expected_partner_id) ||
    typeof input.so_name !== 'string' ||
    !/^SO\d+$/.test(input.so_name) ||
    typeof input.expected_po_reference !== 'string' ||
    !input.expected_po_reference.trim() ||
    input.expected_po_reference.length > 128 ||
    [input.source_account_id, input.source_folder_id, input.source_message_id].some(
      (id) => typeof id !== 'string' || !/^\d{5,32}$/.test(id),
    )
  ) {
    throw new Error('INPUT_INVALID');
  }
  return input;
}

async function verifiedFile(input: OdooAttachmentInput, root: string): Promise<Buffer> {
  const [file, allowed] = await Promise.all([realpath(input.file_path), realpath(root)]);
  const rel = relative(allowed, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new Error('FILE_OUTSIDE_APPROVED_DIRECTORY');
  const bucket = `${input.source_account_id}_${input.source_folder_id}_${input.source_message_id}`;
  if (basename(dirname(file)) !== bucket || extname(file).toLowerCase() !== '.pdf')
    throw new Error('SOURCE_FILE_IDENTITY_MISMATCH');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_PDF_BYTES)
      throw new Error('FILE_SIZE_INVALID');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, null);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size) throw new Error('FILE_CHANGED_DURING_READ');
    const content = bytes.subarray(0, offset);
    if (content.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('FILE_NOT_PDF');
    if (createHash('sha256').update(content).digest('hex') !== input.expected_sha256.toLowerCase())
      throw new Error('FILE_CHECKSUM_MISMATCH');
    return content;
  } finally {
    await handle.close();
  }
}

/** Bytes stay inside this boundary and the existing authorized connector payload. */
export async function attachVerifiedPdf(
  raw: Record<string, unknown>,
  ctx: ToolRunContext,
  call: OdooAttachmentCall,
  recovery: AttachmentRecovery,
): Promise<Record<string, unknown>> {
  if (
    ctx.agentId !== PRIME_ATTACHMENT_AGENT ||
    !ctx.conversationId ||
    !ctx.workingDirectory ||
    !consumeAttachmentApproval(ctx.attachmentApproval, raw)
  )
    throw new Error('EXPLICIT_HUMAN_APPROVAL_REQUIRED');
  const input = validateInput(raw);
  const key = `${ctx.agentId}:${input.so_id}:${input.source_account_id}/${input.source_folder_id}/${input.source_message_id}:${input.expected_sha256}`;
  if (active.has(key)) throw new Error('ATTACHMENT_OPERATION_ALREADY_RUNNING');
  active.add(key);
  let attachmentId: number | null = null;
  try {
    ctx.signal.throwIfAborted();
    const bytes = await verifiedFile(input, ctx.workingDirectory);
    const name = basename(input.file_path);
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    const marker = `VVPO-${input.source_message_id}-${input.expected_sha256.toLowerCase()}`;
    const search = async (model: string, domain: unknown[], fields: string[]) => {
      ctx.signal.throwIfAborted();
      return rows(await call('odoo_search', { model, domain, fields, limit: 10 }));
    };
    const order = (
      await search(
        'sale.order',
        [['id', '=', input.so_id]],
        ['id', 'name', 'partner_id', 'client_order_ref'],
      )
    )[0];
    if (
      !order ||
      order.name !== input.so_name ||
      safeId(order.partner_id) !== input.expected_partner_id ||
      order.client_order_ref !== input.expected_po_reference
    )
      throw new Error('SO_CUSTOMER_OR_SOURCE_IDENTITY_MISMATCH');

    const findAttachment = async () => {
      const found = await search(
        'ir.attachment',
        [
          ['res_model', '=', 'sale.order'],
          ['res_id', '=', input.so_id],
          ['name', '=', name],
        ],
        ['id', 'name', 'res_model', 'res_id', 'file_size', 'checksum', 'mimetype'],
      );
      if (found.length > 1) throw new Error('DUPLICATE_ATTACHMENTS_REQUIRE_REVIEW');
      const row = found[0];
      if (
        row &&
        (row.res_model !== 'sale.order' ||
          row.res_id !== input.so_id ||
          row.name !== name ||
          row.file_size !== bytes.length ||
          row.checksum !== sha1 ||
          row.mimetype !== 'application/pdf' ||
          !safeId(row.id))
      ) {
        throw new Error('EXISTING_ATTACHMENT_MISMATCH');
      }
      return row;
    };
    const findNote = async (id: number) => {
      const notes = await search(
        'mail.message',
        [
          ['model', '=', 'sale.order'],
          ['res_id', '=', input.so_id],
          ['body', 'ilike', marker],
        ],
        ['id', 'model', 'res_id', 'attachment_ids', 'subtype_id'],
      );
      const note = notes.find(
        (row) =>
          row.model === 'sale.order' &&
          row.res_id === input.so_id &&
          Array.isArray(row.attachment_ids) &&
          row.attachment_ids.includes(id) &&
          safeId(row.id),
      );
      if (!note) return undefined;
      const subtypeId = safeId(note.subtype_id);
      if (!subtypeId) throw new Error('LOG_NOTE_SUBTYPE_UNVERIFIED');
      const subtype = (
        await search('mail.message.subtype', [['id', '=', subtypeId]], ['id', 'internal'])
      )[0];
      if (!subtype || subtype.internal !== true) throw new Error('LOG_NOTE_NOT_INTERNAL');
      return note;
    };
    let attachment = await findAttachment();
    // Establish note-read permission before creating anything.
    await search(
      'mail.message',
      [
        ['model', '=', 'sale.order'],
        ['res_id', '=', input.so_id],
        ['body', 'ilike', marker],
      ],
      ['id', 'attachment_ids'],
    );
    if (!attachment) {
      if (await recovery.has(key, 'attachment'))
        throw new Error('PREVIOUS_WRITE_UNVERIFIED_MANUAL_RECONCILIATION_REQUIRED');
      ctx.signal.throwIfAborted();
      await recovery.mark(key, 'attachment');
      try {
        await call('odoo_create', {
          model: 'ir.attachment',
          values: {
            name,
            type: 'binary',
            res_model: 'sale.order',
            res_id: input.so_id,
            mimetype: 'application/pdf',
            datas: bytes.toString('base64'),
          },
        });
      } catch {
        /* An ambiguous write is followed by one direct read, never another create. */
      }
      attachment = await findAttachment();
      if (!attachment) throw new Error('ATTACHMENT_WRITE_UNVERIFIED');
    }
    attachmentId = safeId(attachment.id);
    if (!attachmentId) throw new Error('ATTACHMENT_ID_UNVERIFIED');
    await recovery.clear(key, 'attachment');
    let note = await findNote(attachmentId);
    if (!note) {
      if (await recovery.has(key, 'note'))
        return {
          status: 'partial',
          attachment_id: attachmentId,
          attachment_verified: true,
          log_note_verified: false,
          reason: 'PREVIOUS_NOTE_WRITE_UNVERIFIED',
          next_action: 'Direct-read reconciliation is required; do not repost or re-upload.',
        };
      ctx.signal.throwIfAborted();
      await recovery.mark(key, 'note');
      try {
        await call('odoo_call_method', {
          model: 'sale.order',
          method: 'message_post',
          args: JSON.stringify([[input.so_id]]),
          kwargs: JSON.stringify({
            body: `${marker}\nOriginal PO PDF verified for ${input.so_name}; PO ${input.expected_po_reference}; source ${input.source_account_id}/${input.source_folder_id}/${input.source_message_id}.`,
            message_type: 'comment',
            subtype_xmlid: 'mail.mt_note',
            attachment_ids: [attachmentId],
          }),
        });
      } catch {
        /* Recover note identity by direct read; do not repost blindly. */
      }
      note = await findNote(attachmentId);
    }
    if (!note)
      return {
        status: 'partial',
        attachment_id: attachmentId,
        so_id: input.so_id,
        attachment_verified: true,
        log_note_verified: false,
        reason: 'LOG_NOTE_LINK_UNVERIFIED',
        next_action:
          'Read the existing attachment and note state before an explicitly approved recovery; do not re-upload.',
      };
    await recovery.clear(key, 'note');
    return {
      status: 'verified',
      so_id: input.so_id,
      so_name: input.so_name,
      attachment_id: attachmentId,
      attachment_name: name,
      file_size: bytes.length,
      sha256: input.expected_sha256.toLowerCase(),
      odoo_checksum_sha1: sha1,
      log_note_id: note.id,
      log_note_attachment_verified: true,
    };
  } catch (error) {
    // Never expose connector exception bodies: they may contain the write payload.
    const reason =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'ATTACHMENT_OPERATION_BLOCKED';
    return {
      status: attachmentId ? 'partial' : 'blocked',
      attachment_id: attachmentId,
      reason,
      next_action:
        'Preserve state; obtain the missing permission/evidence or perform direct-read reconciliation before retrying.',
    };
  } finally {
    active.delete(key);
  }
}
