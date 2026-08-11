/**
 * Odoo API Handlers
 * Proxies local express requests to Vera Cowork server Odoo endpoints.
 */

import { getVeraCoworkApiClient } from '../../api/index.js';

import type {
  ExpressHandler,
  OdooSearchBody,
  OdooCountBody,
  OdooReadBody,
  OdooFieldsBody,
  OdooRunToolBody,
} from './types.js';
import type { Request, Response } from 'express';

async function proxyOdooRequest(
  path: string,
  method: 'GET' | 'POST',
  body: unknown,
  res: Response,
): Promise<void> {
  try {
    const api = getVeraCoworkApiClient();
    const data = await api.request(path, {
      method,
      body: body ?? undefined,
      requireAuth: true,
    });
    res.json(data);
  } catch (error) {
    console.error(`Failed to proxy Odoo request to ${path}:`, error);
    const message = error instanceof Error ? error.message : 'Failed to execute Odoo request';
    res.status(500).json({
      ok: false,
      error: 'ODOO_PROXY_ERROR',
      message,
      path,
      method,
    });
  }
}

/**
 * GET /odoo/models
 * List available Odoo models
 */
export const odooListModelsHandler: ExpressHandler = async (_req, res) => {
  await proxyOdooRequest('/odoo/models', 'GET', undefined, res);
};

/**
 * POST /odoo/models/search
 * Search and read Odoo records
 */
export const odooSearchHandler: ExpressHandler = async (req: Request, res: Response) => {
  const body = req.body as OdooSearchBody;
  if (!body?.model) {
    res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'Missing required field: model' });
    return;
  }
  await proxyOdooRequest('/odoo/models/search', 'POST', body, res);
};

/**
 * POST /odoo/models/count
 * Count Odoo records
 */
export const odooCountHandler: ExpressHandler = async (req: Request, res: Response) => {
  const body = req.body as OdooCountBody;
  if (!body?.model) {
    res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'Missing required field: model' });
    return;
  }
  await proxyOdooRequest('/odoo/models/count', 'POST', body, res);
};

/**
 * POST /odoo/models/read
 * Read Odoo records by IDs
 */
export const odooReadHandler: ExpressHandler = async (req: Request, res: Response) => {
  const body = req.body as OdooReadBody;
  if (!body?.model || !Array.isArray(body?.ids)) {
    res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'Missing required fields: model, ids' });
    return;
  }
  await proxyOdooRequest('/odoo/models/read', 'POST', body, res);
};

/**
 * POST /odoo/models/fields
 * List fields for an Odoo model
 */
export const odooFieldsHandler: ExpressHandler = async (req: Request, res: Response) => {
  const body = req.body as OdooFieldsBody;
  if (!body?.model) {
    res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'Missing required field: model' });
    return;
  }
  await proxyOdooRequest('/odoo/models/fields', 'POST', body, res);
};

/**
 * POST /odoo/run-tool
 * Run any allowlisted Odoo MCP tool by name through Vera Cowork server.
 */
export const odooRunToolHandler: ExpressHandler = async (req: Request, res: Response) => {
  const body = req.body as OdooRunToolBody;
  if (!body?.toolName) {
    res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'Missing required field: toolName' });
    return;
  }
  await proxyOdooRequest('/odoo/run-tool', 'POST', { toolName: body.toolName, args: body.args ?? {} }, res);
};
