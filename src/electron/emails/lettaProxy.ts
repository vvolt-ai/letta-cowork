import type { Request, Response } from "express";
import { Letta } from "@letta-ai/letta-client";

function createLettaClient(): Letta {
  const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
  const apiKey = (process.env.LETTA_API_KEY || "").trim();

  return new Letta({
    baseURL,
    apiKey: apiKey || null,
  });
}

function sanitizeError(error: unknown): { error: string } {
  if (error instanceof Error) {
    return { error: error.message || "Failed to communicate with Letta API" };
  }
  return { error: "Failed to communicate with Letta API" };
}

function requireAgentId(req: Request, res: Response): string | null {
  const agentId = (req.params.agentId as string)?.trim();
  if (!agentId) {
    res.status(400).json({ error: "Missing required path parameter: agentId" });
    return null;
  }
  return agentId;
}

export async function listAgentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const client = createLettaClient();
    const response = await client.agents.list({ limit: 50 });
    res.json(response?.items ?? []);
  } catch (error) {
    console.error("[lettaProxy] listAgentsHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}

export async function getAgentHandler(req: Request, res: Response): Promise<void> {
  const agentId = requireAgentId(req, res);
  if (!agentId) return;

  try {
    const client = createLettaClient();
    const agent = await client.agents.retrieve(agentId);
    res.json(agent);
  } catch (error) {
    console.error("[lettaProxy] getAgentHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}

export async function listToolsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const client = createLettaClient();
    const response = await (client.tools as any).list({ limit: 100 });
    res.json(response?.items ?? response ?? []);
  } catch (error) {
    console.error("[lettaProxy] listToolsHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}

export async function listModelsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const client = createLettaClient();
    const response = await client.models.list();
    res.json(response ?? []);
  } catch (error) {
    console.error("[lettaProxy] listModelsHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}

export async function listBlocksHandler(req: Request, res: Response): Promise<void> {
  const agentId = requireAgentId(req, res);
  if (!agentId) return;

  try {
    const client = createLettaClient();
    const response = await (client.agents as any).coreMemory.blocks.list(agentId);
    res.json(response?.items ?? response ?? []);
  } catch (error) {
    console.error("[lettaProxy] listBlocksHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}

export async function archivalSearchHandler(req: Request, res: Response): Promise<void> {
  const agentId = requireAgentId(req, res);
  if (!agentId) return;

  const query = String(req.query.query ?? "").trim();
  const limit = Number(req.query.limit ?? 10);

  if (!query) {
    res.status(400).json({ error: "Missing required query parameter: query" });
    return;
  }

  try {
    const client = createLettaClient();
    const response = await (client.agents as any).archivalMemory.list(agentId, {
      query,
      limit: Number.isFinite(limit) ? limit : 10,
    });
    res.json(response?.items ?? response ?? []);
  } catch (error) {
    console.error("[lettaProxy] archivalSearchHandler failed", error);
    res.status(500).json(sanitizeError(error));
  }
}
