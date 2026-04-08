/**
 * Letta API Handlers
 * Handles Letta API proxy endpoints for conversations and agents
 */

import type { Request, Response } from "express";
import type { ExpressHandler, LettaConversationQuery, LettaMessagesQuery } from "./types.js";

/**
 * Get Letta API key from environment
 */
function getLettaApiKey(): string | null {
  return process.env.LETTA_API_KEY || null;
}

/**
 * Fetch conversation details from Letta API
 * GET /letta/conversation/:conversationId
 */
export const lettaConversationHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { agentId, limit = 50 } = req.query as LettaConversationQuery;

    if (!conversationId) {
      res.status(400).send("Missing conversationId");
      return;
    }

    const LETTA_API_KEY = getLettaApiKey();
    if (!LETTA_API_KEY) {
      res.status(500).send("Letta API key not configured");
      return;
    }

    // If agentId is provided, fetch via agent messages endpoint
    if (agentId) {
      const response = await fetch(
        `https://api.letta.com/v1/agents/${agentId}/messages?conversation_id=${conversationId}&limit=${limit}&order=asc`,
        {
          headers: {
            "Authorization": `Bearer ${LETTA_API_KEY}`,
          },
        }
      );
      if (!response.ok) {
        res.status(response.status).send("Failed to fetch conversation from Letta");
        return;
      }
      const data = await response.json();
      res.json(data);
      return;
    }

    // Otherwise try to fetch conversation directly
    const response = await fetch(
      `https://api.letta.com/v1/conversations/${conversationId}`,
      {
        headers: {
          "Authorization": `Bearer ${LETTA_API_KEY}`,
        },
      }
    );
    if (!response.ok) {
      res.status(response.status).send("Failed to fetch conversation from Letta");
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Failed to fetch conversation from Letta:", error);
    res.status(500).send("Failed to fetch conversation from Letta");
  }
};

/**
 * Fetch messages from a Letta conversation
 * GET /letta/conversation/:conversationId/messages
 */
export const lettaMessagesHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { agentId, limit = 50, order = "asc" } = req.query as LettaMessagesQuery;

    if (!conversationId || !agentId) {
      res.status(400).send("Missing conversationId or agentId");
      return;
    }

    const LETTA_API_KEY = getLettaApiKey();
    if (!LETTA_API_KEY) {
      res.status(500).send("Letta API key not configured");
      return;
    }

    const response = await fetch(
      `https://api.letta.com/v1/agents/${agentId}/messages?conversation_id=${conversationId}&limit=${limit}&order=${order}`,
      {
        headers: {
          "Authorization": `Bearer ${LETTA_API_KEY}`,
        },
      }
    );
    if (!response.ok) {
      res.status(response.status).send("Failed to fetch messages from Letta");
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Failed to fetch messages from Letta:", error);
    res.status(500).send("Failed to fetch messages from Letta");
  }
};

/**
 * Fetch agent details from Letta API
 * GET /letta/agent/:agentId
 */
export const lettaAgentHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      res.status(400).send("Missing agentId");
      return;
    }

    const LETTA_API_KEY = getLettaApiKey();
    if (!LETTA_API_KEY) {
      res.status(500).send("Letta API key not configured");
      return;
    }

    const response = await fetch(
      `https://api.letta.com/v1/agents/${agentId}`,
      {
        headers: {
          "Authorization": `Bearer ${LETTA_API_KEY}`,
        },
      }
    );
    if (!response.ok) {
      res.status(response.status).send("Failed to fetch agent from Letta");
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Failed to fetch agent from Letta:", error);
    res.status(500).send("Failed to fetch agent from Letta");
  }
};
