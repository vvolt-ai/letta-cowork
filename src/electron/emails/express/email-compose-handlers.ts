import type { Request } from "express";
import type { ExpressHandler } from "./types.js";
import {
  createEmailDraft,
  sendComposedEmail,
  type EmailAttachmentInput,
  type EmailComposePayload,
} from "../fetchEmails.js";

interface ComposeRequestBody {
  to?: string[] | string;
  cc?: string[] | string;
  bcc?: string[] | string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachmentInput[];
  draftId?: string;
}

const splitAddresses = (value?: string[] | string): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => Boolean(entry && entry.trim()))
      .map((entry) => entry.trim());
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

function toComposePayload(req: Request): EmailComposePayload {
  const body = req.body as ComposeRequestBody | undefined;
  if (!body) {
    throw new Error("Request body is required");
  }

  const to = splitAddresses(body.to);
  const cc = splitAddresses(body.cc);
  const bcc = splitAddresses(body.bcc);

  if (!body.subject || !body.subject.trim()) {
    throw new Error("Subject is required");
  }

  if (!body.bodyHtml && !body.bodyText) {
    throw new Error("Either bodyHtml or bodyText must be provided");
  }

  const attachments = Array.isArray(body.attachments) && body.attachments.length > 0
    ? body.attachments.map((attachment) => {
        if (!attachment?.name || !attachment?.url) {
          throw new Error("Each attachment must include both name and url");
        }
        return attachment;
      })
    : undefined;

  return {
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: body.bodyHtml,
    attachments,
    draftId: body.draftId,
  };
}

const successResponse = (data: unknown) => ({ success: true, data });
const errorResponse = (error: unknown) => ({ success: false, error: error instanceof Error ? error.message : String(error) });

export const draftEmailHandler: ExpressHandler = async (req, res) => {
  try {
    const payload = toComposePayload(req);
    console.log('[EmailCompose] Draft request', {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      attachments: payload.attachments?.map((att) => att.name),
    });
    const result = await createEmailDraft(payload);
    console.log('[EmailCompose] Draft created', result);
    res.json(successResponse(result));
  } catch (error) {
    console.error('[EmailCompose] Draft failed', error);
    res.status(400).json(errorResponse(error));
  }
};

export const sendEmailHandler: ExpressHandler = async (req, res) => {
  try {
    const payload = toComposePayload(req);
    console.log('[EmailCompose] Send request', {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      draftId: payload.draftId,
      attachments: payload.attachments?.map((att) => att.name),
    });
    const result = await sendComposedEmail(payload);
    console.log('[EmailCompose] Send success', result);
    res.json(successResponse(result));
  } catch (error) {
    console.error('[EmailCompose] Send failed', error);
    res.status(400).json(errorResponse(error));
  }
};
