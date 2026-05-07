/**
 * Letta Respond Handler
 * --------------------
 * POST /letta/respond
 *
 * Sends a prompt to a Letta agent through cowork's in-process runner and
 * returns the assistant reply synchronously. Mirrors vera-cowork-server's
 * /api/letta/respond but runs locally on the user's machine, which means the
 * turn has access to:
 *   - User's local skills (~/.letta/skills/)
 *   - Custom Electron tools registered in the runner
 *   - Local file system via Read/Write tools
 *
 * Intended callers: Zoho email widget (via relay or direct), local scripts,
 * other processes on the same machine.
 */

import type { Request, Response } from "express";
import type { ExpressHandler } from "./types.js";
import { runScheduledPrompt } from "../../services/scheduler/run-scheduled-prompt.js";

interface RespondBody {
  text?: string;
  agentId?: string;
  conversationId?: string;
}

export const lettaRespondHandler: ExpressHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const body = (req.body ?? {}) as RespondBody;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const agentId =
      typeof body.agentId === "string" ? body.agentId.trim() : "";
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;

    if (!text) {
      res.status(400).json({ error: "Missing required field: text" });
      return;
    }

    if (!agentId) {
      res.status(400).json({ error: "Missing required field: agentId" });
      return;
    }

    const result = await runScheduledPrompt(agentId, conversationId, text);

    if (result.error) {
      res.status(500).json({
        error: result.error,
        assistantText: result.output ?? null,
        conversationId: result.conversationId ?? null,
      });
      return;
    }

    res.json({
      assistantText: result.output ?? "",
      conversationId: result.conversationId ?? null,
    });
  } catch (error) {
    console.error("[letta-respond] Failed to run agent turn:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
