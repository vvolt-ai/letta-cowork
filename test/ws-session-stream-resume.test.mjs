import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { WsSession } from "../dist-electron/libs/runner/ws/session.js";
import { getVeraCoworkApiClient } from "../dist-electron/api/index.js";

function sendSse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

test("WsSession resumes an accepted run by sequence cursor without resubmitting", async () => {
  const previousBaseUrl = process.env.LETTA_BASE_URL;
  const previousApiKey = process.env.LETTA_API_KEY;
  const veraApi = getVeraCoworkApiClient();
  const previousAccessTokenOverride = Object.getOwnPropertyDescriptor(
    veraApi,
    "accessToken",
  );
  Object.defineProperty(veraApi, "accessToken", {
    configurable: true,
    value: null,
  });
  let initialSubmissions = 0;
  let resumeRequests = 0;
  let resumeBody = null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "PATCH" && url.pathname === "/v1/conversations/conv-resume") {
      for await (const _chunk of req) void _chunk;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "conv-resume",
        agent_id: "agent-resume",
        model: "provider/model-resume",
      }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/conversations/conv-resume") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "conv-resume",
        agent_id: "agent-resume",
        model: "provider/model-resume",
        in_context_message_ids: [],
      }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/conversations/conv-resume/messages") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/conversations/conv-resume/messages") {
      initialSubmissions += 1;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      sendSse(res, {
        message_type: "assistant_message",
        run_id: "run-resume",
        seq_id: 1,
        id: "message-resume",
        content: "before-drop ",
      });
      setTimeout(() => res.destroy(new Error("simulated disconnect")), 20);
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/runs/run-resume/stream") {
      resumeRequests += 1;
      let raw = "";
      for await (const chunk of req) raw += chunk;
      resumeBody = raw ? JSON.parse(raw) : {};
      res.writeHead(200, { "content-type": "text/event-stream" });
      sendSse(res, {
        message_type: "assistant_message",
        run_id: "run-resume",
        seq_id: 2,
        id: "message-resume",
        content: "after-resume",
      });
      sendSse(res, {
        message_type: "stop_reason",
        run_id: "run-resume",
        seq_id: 3,
        stop_reason: "end_turn",
      });
      res.end();
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Unhandled ${req.method} ${url.pathname}` }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  process.env.LETTA_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.LETTA_API_KEY = "test-api-key";

  try {
    const session = new WsSession({
      agentId: "agent-resume",
      conversationId: "conv-resume",
      model: "provider/model-resume",
      permissionMode: "unrestricted",
    });
    await session.initialize();
    await session.send("resume safely");

    const events = [];
    for await (const event of session.stream()) events.push(event);

    assert.equal(initialSubmissions, 1);
    assert.equal(resumeRequests, 1);
    assert.equal(resumeBody.starting_after, 1);
    assert.equal(resumeBody.batch_size, 1000);
    assert.equal(
      events.filter((event) => event.type === "result").at(-1)?.success,
      true,
    );
    assert.deepEqual(
      events.filter((event) => event.type === "assistant").map((event) => event.content),
      ["before-drop ", "after-resume"],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousBaseUrl === undefined) delete process.env.LETTA_BASE_URL;
    else process.env.LETTA_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.LETTA_API_KEY;
    else process.env.LETTA_API_KEY = previousApiKey;
    if (previousAccessTokenOverride) {
      Object.defineProperty(veraApi, "accessToken", previousAccessTokenOverride);
    } else {
      delete veraApi.accessToken;
    }
  }
});
