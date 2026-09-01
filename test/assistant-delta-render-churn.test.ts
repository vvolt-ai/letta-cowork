import { expect, test } from "bun:test";

import { looksLikeMarkdown } from "../src/ui/render/markdown";
import { useAppStore } from "../src/ui/store/useAppStore";

test("recognizes GFM tables and bold text as Markdown", () => {
  expect(looksLikeMarkdown("| Operation | Before | Now |\n| --- | --- | --- |\n| Render | 60 | 20 |")).toBe(true);
  expect(looksLikeMarkdown("Performance improves by **99%**.")).toBe(true);
});

test("assistant token deltas do not churn the global sessions tree", () => {
  const sessionId = "assistant-render-churn-test";
  useAppStore.setState((state) => ({
    ...state,
    fetchSessionHistory: () => undefined,
    sessions: {
      ...state.sessions,
      [sessionId]: {
        id: sessionId,
        title: "Render test",
        status: "running",
        messages: [],
        permissionRequests: [],
        ephemeral: {
          reasoning: [],
          tools: [],
          cliResults: [],
          status: "generating",
          lastUpdated: Date.now(),
        },
      } as any,
    },
  }));

  let globalUpdates = 0;
  const unsubscribe = useAppStore.subscribe(() => {
    globalUpdates += 1;
  });

  for (let index = 0; index < 100; index += 1) {
    useAppStore.getState().handleServerEvent({
      type: "stream.message",
      payload: {
        sessionId,
        message: {
          type: "assistant",
          uuid: "assistant-answer",
          content: "x",
        },
      },
    } as any);
  }

  expect(globalUpdates).toBe(0);

  useAppStore.getState().handleServerEvent({
    type: "stream.message",
    payload: {
      sessionId,
      message: { type: "result", success: true },
    },
  } as any);

  const assistant = useAppStore
    .getState()
    .sessions[sessionId]?.messages.find((message) => message.type === "assistant") as { content?: string } | undefined;
  expect(assistant?.content).toBe("x".repeat(100));

  unsubscribe();
});
