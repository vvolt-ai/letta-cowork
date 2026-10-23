import { ODOO_ATTACHMENT_TOOL } from './_shared/attachmentApproval.js';
import { attachVerifiedPdf } from './_shared/odooAttachmentCore.js';
import { fileAttachmentRecovery } from './_shared/odooAttachmentRecovery.js';
import { getVeraCoworkApiClient } from '../../../api/index.js';

import type { ClientToolDefinition } from '../types.js';

export const odooAttachmentTool: ClientToolDefinition = {
  name: ODOO_ATTACHMENT_TOOL,
  description:
    'Prime-only pilot: attach one checksum-verified original local PO PDF to an exact existing SO and internal Log Note. Always requires a fresh human permission response for this exact file/SO/source. Uses existing governed Odoo permissions only; no order creation/confirmation or email sending. Files must be inside the trusted session working directory and exact ZohoAttachments source bucket. Missing proof or permission blocks the operation.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      file_path: {
        type: 'string',
        description: 'Exact absolute local original PDF path; no UNC/network path.',
      },
      expected_sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
      so_id: { type: 'integer', minimum: 1 },
      so_name: { type: 'string', pattern: '^SO[0-9]+$' },
      expected_partner_id: { type: 'integer', minimum: 1 },
      expected_po_reference: { type: 'string', minLength: 1, maxLength: 128 },
      source_account_id: { type: 'string', pattern: '^[0-9]{5,32}$' },
      source_folder_id: { type: 'string', pattern: '^[0-9]{5,32}$' },
      source_message_id: { type: 'string', pattern: '^[0-9]{5,32}$' },
    },
    required: [
      'file_path',
      'expected_sha256',
      'so_id',
      'so_name',
      'expected_partner_id',
      'expected_po_reference',
      'source_account_id',
      'source_folder_id',
      'source_message_id',
    ],
  },
  run: async (args, ctx) => {
    try {
      const api = getVeraCoworkApiClient();
      if (!api.isAuthenticated())
        return {
          output: 'Attachment blocked: authenticated Vera context unavailable.',
          isError: true,
        };
      const result = await attachVerifiedPdf(
        args,
        ctx,
        async (toolName, input) => {
          const value = await api.request<unknown>('/odoo/run-tool', {
            method: 'POST',
            body: { toolName, args: input },
            requireAuth: true,
          });
          if (
            value &&
            typeof value === 'object' &&
            'ok' in value &&
            (value as { ok?: boolean }).ok === false
          ) {
            throw new Error('CONNECTOR_OPERATION_FAILED');
          }
          return value;
        },
        fileAttachmentRecovery(),
      );
      return { output: JSON.stringify(result), isError: result.status !== 'verified' };
    } catch {
      return {
        output:
          'Attachment blocked: exact human approval, runtime identity or connector permission unavailable.',
        isError: true,
      };
    }
  },
};
