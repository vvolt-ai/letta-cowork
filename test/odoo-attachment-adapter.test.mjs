import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  attachVerifiedPdf,
  PRIME_ATTACHMENT_AGENT,
} from '../dist-electron/services/client-tools/runners/_shared/odooAttachmentCore.js';
import { recordAttachmentApproval } from '../dist-electron/services/client-tools/runners/_shared/attachmentApproval.js';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';
import { fileAttachmentRecovery } from '../dist-electron/services/client-tools/runners/_shared/odooAttachmentRecovery.js';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'cowork-odoo-pdf-'));
  try {
    const bucket = join(root, '12345_23456_34567');
    await mkdir(bucket);
    const bytes = Buffer.from('%PDF-1.7\nSynthetic PO fixture only\n%%EOF');
    const path = join(bucket, 'original-po.pdf');
    await writeFile(path, bytes);
    const args = {
      file_path: path,
      expected_sha256: createHash('sha256').update(bytes).digest('hex'),
      so_id: 91,
      so_name: 'SO12345',
      expected_partner_id: 77,
      expected_po_reference: 'PO-123',
      source_account_id: '12345',
      source_folder_id: '23456',
      source_message_id: '34567',
    };
    const state = {
      attachment: null,
      note: null,
      calls: [],
      intents: new Set(),
      createAmbiguous: false,
      noteFails: false,
      denied: false,
      mismatch: false,
      duplicates: false,
      createNoResult: false,
    };
    const recovery = {
      async has(key, phase) {
        return state.intents.has(`${key}:${phase}`);
      },
      async mark(key, phase) {
        const id = `${key}:${phase}`;
        if (state.intents.has(id)) throw new Error('EXISTS');
        state.intents.add(id);
      },
      async clear(key, phase) {
        state.intents.delete(`${key}:${phase}`);
      },
    };
    const context = (input = args) => {
      const decision = { behavior: 'allow' };
      recordAttachmentApproval(decision, input);
      return {
        signal: new AbortController().signal,
        agentId: PRIME_ATTACHMENT_AGENT,
        conversationId: 'conv-fixture',
        workingDirectory: root,
        attachmentApproval: decision,
      };
    };
    const call = async (name, input) => {
      state.calls.push({ name, input });
      if (state.denied) throw new Error('Permission denied');
      if (name === 'odoo_search') {
        if (input.model === 'sale.order')
          return [
            {
              id: 91,
              name: state.mismatch ? 'SO999' : 'SO12345',
              partner_id: [77, 'Fixture'],
              client_order_ref: 'PO-123',
            },
          ];
        if (input.model === 'ir.attachment')
          return state.attachment
            ? state.duplicates
              ? [state.attachment, state.attachment]
              : [state.attachment]
            : [];
        if (input.model === 'mail.message') return state.note ? [state.note] : [];
        if (input.model === 'mail.message.subtype') return [{ id: 2, internal: true }];
      }
      if (name === 'odoo_create') {
        assert.equal(input.model, 'ir.attachment');
        assert.equal(input.values.datas, bytes.toString('base64'));
        if (!state.createNoResult)
          state.attachment = {
            id: 901,
            name: 'original-po.pdf',
            res_model: 'sale.order',
            res_id: 91,
            file_size: bytes.length,
            checksum: createHash('sha1').update(bytes).digest('hex'),
            mimetype: 'application/pdf',
          };
        if (state.createAmbiguous) throw new Error('Serialization error after write');
        return 901;
      }
      if (name === 'odoo_call_method') {
        assert.equal(input.method, 'message_post');
        assert.deepEqual(JSON.parse(input.args), [[91]]);
        assert.deepEqual(JSON.parse(input.kwargs).attachment_ids, [901]);
        if (state.noteFails) throw new Error('Denied or ambiguous note');
        state.note = {
          id: 902,
          model: 'sale.order',
          res_id: 91,
          attachment_ids: [901],
          subtype_id: [2, 'Note'],
        };
        return 902;
      }
      throw new Error('Unexpected fixture operation');
    };
    await run({ args, state, recovery, context, call, bytes, root });
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'cowork-odoo-pdf-')));
    await rm(root, { recursive: true, force: true });
  }
}

test('adapter forces fresh human permission even in unrestricted/session-granted mode', async () => {
  const session = {
    pendingPermissions: new Map(),
    permissionGrants: { allowAll: true, allowedTools: new Set() },
  };
  let request;
  const handler = createCanUseToolHandler(
    session,
    (id) => {
      request = id;
    },
    'unrestricted',
  );
  const pending = handler('OdooAttachPdf', { so_id: 91 });
  assert.ok(request);
  session.pendingPermissions.get(request).resolve({ behavior: 'deny' });
  assert.equal((await pending).behavior, 'deny');
});

test('no genuine approval, another agent, changed args, or reused approval cannot write', async () =>
  fixture(async ({ args, context, call, recovery, state }) => {
    await assert.rejects(
      attachVerifiedPdf(
        args,
        { ...context(), attachmentApproval: { behavior: 'allow' } },
        call,
        recovery,
      ),
      /EXPLICIT_HUMAN_APPROVAL_REQUIRED/,
    );
    await assert.rejects(
      attachVerifiedPdf(args, { ...context(), agentId: 'agent-other' }, call, recovery),
      /EXPLICIT_HUMAN_APPROVAL_REQUIRED/,
    );
    await assert.rejects(
      attachVerifiedPdf({ ...args, so_id: 92 }, context(), call, recovery),
      /EXPLICIT_HUMAN_APPROVAL_REQUIRED/,
    );
    assert.equal(state.calls.length, 0);
  }));

test('path/source/hash/type/size validation fails before connector calls', async () =>
  fixture(async ({ args, context, call, recovery, state, root }) => {
    for (const bad of [
      { ...args, expected_sha256: '0'.repeat(64) },
      { ...args, source_message_id: '99999' },
      { ...args, file_path: join(root, 'missing.pdf') },
      { ...args, file_path: '\\\\server\\share\\po.pdf' },
    ]) {
      try {
        const result = await attachVerifiedPdf(bad, context(bad), call, recovery);
        assert.equal(result.status, 'blocked');
      } catch (error) {
        assert.match(error.message, /INPUT_INVALID/);
      }
    }
    const elsewhere = join(root, 'elsewhere');
    await mkdir(elsewhere);
    assert.equal(
      (await attachVerifiedPdf(args, { ...context(), workingDirectory: elsewhere }, call, recovery))
        .reason,
      'FILE_OUTSIDE_APPROVED_DIRECTORY',
    );
    const wrongType = Buffer.from('Not a PDF');
    await writeFile(args.file_path, wrongType);
    const badType = {
      ...args,
      expected_sha256: createHash('sha256').update(wrongType).digest('hex'),
    };
    assert.equal(
      (await attachVerifiedPdf(badType, context(badType), call, recovery)).reason,
      'FILE_NOT_PDF',
    );
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
    await writeFile(args.file_path, oversized);
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'FILE_SIZE_INVALID',
    );
    assert.equal(state.calls.length, 0);
  }));

test('SO/customer/source mismatch and connector denial never create attachment or note', async () =>
  fixture(async ({ args, context, call, recovery, state }) => {
    state.mismatch = true;
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'SO_CUSTOMER_OR_SOURCE_IDENTITY_MISMATCH',
    );
    state.mismatch = false;
    state.denied = true;
    assert.equal((await attachVerifiedPdf(args, context(), call, recovery)).status, 'blocked');
    assert.equal(state.calls.filter((x) => x.name !== 'odoo_search').length, 0);
  }));

test('original PDF and internal Log Note are verified; no bytes/base64 leave the adapter', async () =>
  fixture(async ({ args, context, call, recovery, state, bytes }) => {
    const ctx = context();
    const result = await attachVerifiedPdf(args, ctx, call, recovery);
    assert.equal(result.status, 'verified');
    assert.equal(result.attachment_id, 901);
    assert.equal(result.log_note_id, 902);
    assert.equal(result.file_size, bytes.length);
    assert.equal(result.sha256, args.expected_sha256);
    assert.doesNotMatch(JSON.stringify(result), /datas|Synthetic PO fixture/);
    assert.ok(!JSON.stringify(result).includes(bytes.toString('base64')));
    await assert.rejects(
      attachVerifiedPdf(args, ctx, call, recovery),
      /EXPLICIT_HUMAN_APPROVAL_REQUIRED/,
    );
    const second = await attachVerifiedPdf(args, context(), call, recovery);
    assert.equal(second.status, 'verified');
    assert.equal(state.calls.filter((x) => x.name === 'odoo_create').length, 1);
    assert.equal(state.calls.filter((x) => x.name === 'odoo_call_method').length, 1);
  }));

test('ambiguous attachment write is recovered by readback, not another create', async () =>
  fixture(async ({ args, context, call, recovery, state }) => {
    state.createAmbiguous = true;
    assert.equal((await attachVerifiedPdf(args, context(), call, recovery)).status, 'verified');
    assert.equal(state.calls.filter((x) => x.name === 'odoo_create').length, 1);
  }));

test('unverified creates and notes preserve recovery intent and prevent duplicate retries', async () =>
  fixture(async ({ args, context, call, recovery, state }) => {
    state.createNoResult = true;
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'ATTACHMENT_WRITE_UNVERIFIED',
    );
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'PREVIOUS_WRITE_UNVERIFIED_MANUAL_RECONCILIATION_REQUIRED',
    );
    assert.equal(state.calls.filter((x) => x.name === 'odoo_create').length, 1);
    state.createNoResult = false;
    state.intents.clear();
    state.noteFails = true;
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'LOG_NOTE_LINK_UNVERIFIED',
    );
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'PREVIOUS_NOTE_WRITE_UNVERIFIED',
    );
    assert.equal(state.calls.filter((x) => x.name === 'odoo_call_method').length, 1);
  }));

test('duplicate or mismatched attachment metadata cannot claim completion', async () =>
  fixture(async ({ args, context, call, recovery, state }) => {
    await attachVerifiedPdf(args, context(), call, recovery);
    state.duplicates = true;
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'DUPLICATE_ATTACHMENTS_REQUIRE_REVIEW',
    );
    state.duplicates = false;
    state.attachment.checksum = 'bad';
    assert.equal(
      (await attachVerifiedPdf(args, context(), call, recovery)).reason,
      'EXISTING_ATTACHMENT_MISMATCH',
    );
  }));

test('byte-free recovery intents survive a new runtime instance and exclusive writes', async () =>
  fixture(async ({ root }) => {
    const journal = join(root, 'journal');
    const first = fileAttachmentRecovery(journal);
    await first.mark('synthetic-key', 'attachment');
    const second = fileAttachmentRecovery(journal);
    assert.equal(await second.has('synthetic-key', 'attachment'), true);
    await assert.rejects(second.mark('synthetic-key', 'attachment'));
    await second.clear('synthetic-key', 'attachment');
    assert.equal(await first.has('synthetic-key', 'attachment'), false);
  }));
