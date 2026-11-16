import type { Letta } from "@letta-ai/letta-client";

type Conversation = Letta.Conversations.Conversation;
type ConversationListParams = Letta.Conversations.ConversationListParams;

// Bound both retained data and work. Hitting a limit is an error, never success
// with an incomplete navigation list. SDK retries are disabled within this budget.
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_CONVERSATIONS = 10_000;
const LOAD_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;

export async function loadConversationPages(
  client: Pick<Letta, "conversations">,
  agentId: string,
): Promise<Conversation[]> {
  if (!agentId.trim()) {
    throw new Error("A non-empty agent ID is required to list conversations");
  }

  const conversations: Conversation[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error("Conversation loading exceeded its time budget; no partial list returned");
    }
    const query: ConversationListParams = {
      agent_id: agentId,
      archive_status: "unarchived",
      limit: PAGE_SIZE,
      order: "desc",
      order_by: "last_message_at",
      ...(after === undefined ? {} : { after }),
    };
    const response: unknown = await client.conversations.list(query, {
      timeout: Math.min(REQUEST_TIMEOUT_MS, remaining),
      maxRetries: 0,
    });
    // Preserve the existing adapter's array and legacy {items} response shapes.
    const items = Array.isArray(response) ? response : response && typeof response === 'object' && Array.isArray((response as {items?:unknown}).items) ? (response as {items:Conversation[]}).items : undefined;
    if (Date.now() >= deadline) {
      throw new Error("Conversation loading exceeded its time budget; no partial list returned");
    }
    if (!Array.isArray(items) || items.length > PAGE_SIZE) {
      throw new Error("Invalid conversation page response");
    }
    // The public SDK returns an array, without a next-page marker. Even a short
    // page may reflect a server-side cap, so only an empty page proves completion.
    if (items.length === 0) return conversations;

    let added = 0;
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !item.id.trim()) {
        throw new Error("Conversation page contains an invalid conversation ID");
      }
      if (seenIds.has(item.id)) continue;
      if (conversations.length >= MAX_CONVERSATIONS) {
        throw new Error("Conversation loading exceeded its item limit; no partial list returned");
      }
      seenIds.add(item.id);
      conversations.push(item);
      added += 1;
    }

    const cursor = items[items.length - 1].id;
    if (seenCursors.has(cursor) || added === 0) {
      throw new Error("Conversation pagination made no progress; no partial list returned");
    }
    seenCursors.add(cursor);
    after = cursor;
  }

  throw new Error("Conversation loading exceeded its page limit; no partial list returned");
}
