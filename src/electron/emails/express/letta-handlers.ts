/**
 * Letta API Handlers
 * Handles Letta API proxy endpoints for conversations and agents.
 */

import type { Request, Response } from "express";

import { fetchLettaRuntime } from "../../services/letta-runtime/index.js";
import type {
  ExpressHandler,
  LettaConversationQuery,
  LettaMessagesQuery,
} from "./types.js";

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Fetch conversation details from Letta API
 * GET /letta/conversation/:conversationId
 */
export const lettaConversationHandler: ExpressHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const conversationId = firstString(req.params.conversationId);
    const { agentId: rawAgentId, limit = 50 } =
      req.query as LettaConversationQuery;
    const agentId = firstString(rawAgentId);

    if (!conversationId) {
      res.status(400).send("Missing conversationId");
      return;
    }

    const path = agentId
      ? `agents/${encodeURIComponent(agentId)}/messages?${new URLSearchParams({
          conversation_id: conversationId,
          limit: String(limit),
          order: "asc",
        })}`
      : `conversations/${encodeURIComponent(conversationId)}`;
    const response = await fetchLettaRuntime(path);
    if (!response.ok) {
      res
        .status(response.status)
        .send("Failed to fetch conversation from Letta");
      return;
    }
    res.json(await response.json());
  } catch (error) {
    console.error("Failed to fetch conversation from Letta:", error);
    res.status(500).send("Failed to fetch conversation from Letta");
  }
};

/**
 * Fetch messages from a Letta conversation
 * GET /letta/conversation/:conversationId/messages
 */
export const lettaMessagesHandler: ExpressHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const conversationId = firstString(req.params.conversationId);
    const {
      agentId: rawAgentId,
      limit = 50,
      order = "asc",
    } = req.query as LettaMessagesQuery;
    const agentId = firstString(rawAgentId);

    if (!conversationId || !agentId) {
      res.status(400).send("Missing conversationId or agentId");
      return;
    }

    const query = new URLSearchParams({
      conversation_id: conversationId,
      limit: String(limit),
      order: String(order),
    });
    const response = await fetchLettaRuntime(
      `agents/${encodeURIComponent(agentId)}/messages?${query}`,
    );
    if (!response.ok) {
      res.status(response.status).send("Failed to fetch messages from Letta");
      return;
    }
    res.json(await response.json());
  } catch (error) {
    console.error("Failed to fetch messages from Letta:", error);
    res.status(500).send("Failed to fetch messages from Letta");
  }
};

/**
 * Fetch agent details from Letta API
 * GET /letta/agent/:agentId
 */
export const lettaAgentHandler: ExpressHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const agentId = firstString(req.params.agentId);
    if (!agentId) {
      res.status(400).send("Missing agentId");
      return;
    }

    const response = await fetchLettaRuntime(
      `agents/${encodeURIComponent(agentId)}`,
    );
    if (!response.ok) {
      res.status(response.status).send("Failed to fetch agent from Letta");
      return;
    }
    res.json(await response.json());
  } catch (error) {
    console.error("Failed to fetch agent from Letta:", error);
    res.status(500).send("Failed to fetch agent from Letta");
  }
};
