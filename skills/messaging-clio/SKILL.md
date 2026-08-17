---
name: messaging-clio
description: Sends a bounded message to Verivolt's Clio governance agent through Clio's separate Letta account and returns the reply. Use when an agent needs Clio guidance about governance, ViKi, rules, escalation, ownership, or process and direct same-account agent messaging cannot reach Clio.
---

# Messaging Clio

Use the bundled client to message Clio across the Letta account boundary. The client reads `CLIO_LETTA_API_KEY` from the current agent's secret environment and never accepts the token in arguments or input.

## Before messaging

Use Clio for governance, ViKi, deployed rules, escalation, unclear ownership, or process conflicts. Do not use this route when the answer is already supported by current deployed rules or when a direct same-account agent-messaging tool can reach Clio safely.

Apply the data-sensitivity rule before sending. Do not send Level 4 material, secrets, credentials, private personal data, compensation or employment terms, active legal or negotiation details, or customer-confidential content unless the applicable policy explicitly authorizes that transport and disclosure.

This shared API credential authenticates access to Clio but does **not** cryptographically establish which calling agent supplied the message. The client labels the caller as an unverified claim. Never use a reply obtained through this route as sole authorization for a sensitive action; verify the decision owner and authority through an approved path.

## Configure the current agent

Save the Clio account token to each agent that needs this skill:

```text
/secret set CLIO_LETTA_API_KEY <CLIO_ACCOUNT_API_TOKEN>
```

Start a new session after setting or rotating the secret. Never paste the token into chat, a command argument, JSON input, source code, screenshots, logs, or Git.

Defaults:

- Clio agent: `agent-800b8961-14e2-4849-acc3-e88129dfc1de`
- Letta API: `https://api.letta.com`

Only set `CLIO_AGENT_ID` or `CLIO_LETTA_BASE_URL` when an authorized administrator confirms that the target changed.

## Send a message

Resolve the script relative to this `SKILL.md`. For a global installation, run:

```bash
node "$HOME/.letta/skills/messaging-clio/scripts/message-clio.mjs" <<'JSON'
{
  "message": "State one clear question for Clio."
}
JSON
```

Pass one JSON object on standard input:

- `message`: required non-empty question or notification;
- `conversationId`: optional `conv-...` ID returned by an earlier call;
- `caller`: optional safe display label. The runtime `AGENT_ID` is used when available.

Do not put message JSON or secrets in command-line arguments.

A successful response has this shape:

```json
{
  "agentId": "agent-800b8961-14e2-4849-acc3-e88129dfc1de",
  "conversationId": "conv-...",
  "reply": "Clio's response",
  "stopReason": "end_turn"
}
```

If `conversationId` is omitted, the client creates a new Clio conversation. Preserve the returned ID only while the same bounded discussion needs continuity. Pass it back for a follow-up:

```bash
node "$HOME/.letta/skills/messaging-clio/scripts/message-clio.mjs" <<'JSON'
{
  "conversationId": "conv-REPLACE_WITH_RETURNED_ID",
  "message": "One follow-up question that depends on the previous answer."
}
JSON
```

Do not reuse one conversation across unrelated users, channels, customers, or sensitivity contexts. Start a new conversation to prevent context leakage.

## Message discipline

1. Ask one clear question per message.
2. Include only the minimum context Clio needs.
3. Separate confirmed facts, uncertainty, and the requested decision or guidance.
4. Identify relevant policy, source, date, or repository path when known.
5. Do not claim that the caller label proves identity or authority.
6. Treat Clio as a collaborator, not a subordinate.
7. Report Clio's reply accurately and retain its uncertainty or conditions.

Suggested message structure:

```text
Topic: <short topic>
Known: <confirmed facts>
Unclear: <specific gap or conflict>
Question: <one decision or guidance request>
Source/date: <portable source reference when relevant>
Sensitivity: <Level 1-4 classification>
```

## Error handling

- **`CLIO_LETTA_API_KEY` unavailable:** tell the user to save it with `/secret set CLIO_LETTA_API_KEY ...` and start a new session. Never ask them to paste it into chat.
- **401/403:** the saved Clio token is invalid, expired, revoked, or lacks access. Stop and ask an authorized administrator to rotate or correct it.
- **404 for the agent:** verify `CLIO_AGENT_ID` with Clio's administrator. Do not search other accounts using unrelated credentials.
- **404 for a conversation:** start a new conversation unless continuity is operationally necessary. Never substitute another user's conversation ID.
- **429:** report rate limiting and wait before one bounded retry; do not loop.
- **Timeout or network failure:** report that Clio was not reached. Do not invent a reply or silently switch to another authority.
- **No assistant reply or approval stop:** report `stopReason`. Do not auto-approve tools or bypass Clio's approval boundary.

## Security boundary

The skill contains no credentials. It can only access resources authorized by `CLIO_LETTA_API_KEY`. Rotate the token when exposed, when a client is retired, or when access should be removed. Prefer a dedicated, revocable token scoped to Clio access rather than a general account credential when Letta supports that scope.
