/**
 * Neo4j API Handlers
 * Proxies local express requests to Vera Cowork server Neo4j endpoints.
 */

import type { Request, Response } from 'express';
import { getVeraCoworkApiClient } from '../../api/index.js';
import type { ExpressHandler, Neo4jQueryBody } from './types.js';

async function proxyNeo4jRequest(
  path: string,
  req: Request<unknown, unknown, Neo4jQueryBody>,
  res: Response,
): Promise<void> {
  try {
    const { query, params, loginUserId } = req.body ?? {};

    if (!query || typeof query !== 'string') {
      res.status(400).send('Missing query');
      return;
    }

    const api = getVeraCoworkApiClient();
    const data = await api.request(path, {
      method: 'POST',
      body: {
        query,
        params: params ?? {},
        ...(loginUserId ? { loginUserId } : {}),
      },
      requireAuth: true,
    });

    res.json(data);
  } catch (error) {
    console.error(`Failed to proxy Neo4j request to ${path}:`, error);
    res.status(500).send(error instanceof Error ? error.message : 'Failed to execute Neo4j request');
  }
}

export const neo4jRunQueryHandler: ExpressHandler = async (req, res) => {
  await proxyNeo4jRequest('/neo4j/runQuery', req as Request<unknown, unknown, Neo4jQueryBody>, res);
};

export const neo4jRunReadQueryHandler: ExpressHandler = async (req, res) => {
  await proxyNeo4jRequest('/neo4j/runReadQuery', req as Request<unknown, unknown, Neo4jQueryBody>, res);
};

export const neo4jExplainHandler: ExpressHandler = async (req, res) => {
  await proxyNeo4jRequest('/neo4j/explain', req as Request<unknown, unknown, Neo4jQueryBody>, res);
};