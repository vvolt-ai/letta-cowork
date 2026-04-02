---
name: letta-api
description: Interact with the Letta REST API for managing agents, memory blocks, conversations, passages, tools, runs, and groups. Use when the user wants to work with the Letta API directly, manage agents programmatically, or when they mention Letta API endpoints, core memory blocks, or archival memory.
---

# Letta API

This skill provides guidance for using the Letta REST API at `https://api.letta.com`.

## Authentication

All requests require a Bearer token:

```bash
curl https://api.letta.com/v1/agents \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

The `LETTA_API_KEY` environment variable should be set with your API key from the Letta dashboard.

## Base URL

```
https://api.letta.com
```

---

## 1. Agents

### 1.1 List Agents

```bash
curl 'https://api.letta.com/v1/agents/?limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Cursor pagination — return agents after this ID |
| `before` | string | Cursor pagination — return agents before this ID |
| `limit` | number | Max results per page |
| `ascending` | boolean | Sort oldest-to-newest (true) or newest-to-oldest (false, default) |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at`, `updated_at`, `last_run_completion` |
| `name` | string | Filter by exact agent name |
| `query_text` | string | Search by name |
| `tags` | string[] | Filter by tags |
| `match_all_tags` | boolean | Require all tags (true) or any (false) |
| `base_template_id` | string | Filter by base template |
| `template_id` | string | Filter by template |
| `identity_id` | string | Filter by identity |
| `created_by_id` | string | Filter by creator user ID |
| `project_id` | string | Filter by project |
| `last_stop_reason` | string | Filter by stop reason: `end_turn`, `error`, `max_steps`, `cancelled`, etc. |
| `include` | string[] | Include relations: `agent.blocks`, `agent.tools`, `agent.tags`, `agent.identities`, `agent.sources`, `agent.secrets`, `agent.managed_group`, `agent.pending_approval` |

**Response:** `{ items: AgentState[] }`

---

### 1.2 Create Agent

```bash
curl https://api.letta.com/v1/agents/ \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "description": "A helpful assistant",
    "model": "openai/gpt-4o",
    "memory_blocks": [
      {
        "label": "persona",
        "value": "I am a helpful assistant.",
        "description": "Agent personality and behavior"
      },
      {
        "label": "human",
        "value": "The user is a software developer.",
        "description": "What I know about the user"
      }
    ]
  }'
```

**Method:** `POST /v1/agents/`

**Body Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Agent name |
| `description` | string | Agent description |
| `agent_type` | string | `memgpt_agent`, `letta_v1_agent`, `react_agent`, `sleeptime_agent`, etc. |
| `system` | string | System prompt |
| `model` | string | LLM model handle (`provider/model-name`) |
| `model_settings` | object | Provider-specific LLM config |
| `context_window_limit` | number | Context window size |
| `embedding` | string | Embedding model handle |
| `memory_blocks` | array | Initial memory blocks: `{ label, value, description?, limit? }` |
| `block_ids` | string[] | Existing block IDs to attach |
| `tool_ids` | string[] | Tool IDs to attach |
| `tool_rules` | array | Tool invocation constraints |
| `folder_ids` | string[] | Data source folder references |
| `identity_ids` | string[] | Associated identities |
| `tags` | string[] | Agent tags |
| `metadata` | object | Custom metadata |
| `secrets` | object | Agent-specific env vars for tool execution |
| `include_base_tools` | boolean | Attach Letta core tools |
| `include_multi_agent_tools` | boolean | Enable inter-agent communication |
| `enable_sleeptime` | boolean | Background memory management |
| `message_buffer_autoclear` | boolean | Disable message history retention |
| `timezone` | string | IANA timezone |
| `initial_message_sequence` | array | Pre-populated messages |
| `compaction_settings` | object | Conversation summarization config |

**Response:** `AgentState`

---

### 1.3 Retrieve Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | Format `agent-<uuid4>` |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `include` | string[] | Relations to include: `agent.blocks`, `agent.tools`, `agent.tags`, etc. |

**Response:** `AgentState`

---

### 1.4 Update Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "new-name",
    "description": "Updated description",
    "system": "You are a specialized assistant..."
  }'
```

**Method:** `PATCH /v1/agents/{agent_id}`

**Body Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Agent name |
| `description` | string | Agent description |
| `system` | string | System prompt |
| `model` | string | LLM model handle |
| `model_settings` | object | Provider-specific config |
| `context_window_limit` | number | Context window size |
| `block_ids` | string[] | Memory block IDs |
| `tool_ids` | string[] | Tool IDs |
| `tool_rules` | array | Tool invocation constraints |
| `tags` | string[] | Agent tags |
| `metadata` | object | Custom metadata |
| `secrets` | object | Env vars for tool execution |
| `enable_sleeptime` | boolean | Background memory |
| `message_buffer_autoclear` | boolean | Disable message history |
| `embedding` | string | Embedding model |
| `timezone` | string | IANA timezone |
| `compaction_settings` | object | Summarization config |

**Response:** `AgentState`

---

### 1.5 Delete Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID \
  -X DELETE \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `DELETE /v1/agents/{agent_id}`

---

## 2. Agent Core Memory Blocks

### 2.1 List Core Memory Blocks

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/core-memory/blocks \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/core-memory/blocks`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `limit` | number | Max results |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at` |

**Response:** Array of `Block` objects

---

### 2.2 Retrieve Core Memory Block by Label

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/core-memory/blocks/$BLOCK_LABEL \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/core-memory/blocks/{block_label}`

**Response:** `Block`

---

### 2.3 Update Core Memory Block

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/core-memory/blocks/$BLOCK_LABEL \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "Updated block content...",
    "description": "Updated description",
    "limit": 50000
  }'
```

**Method:** `PATCH /v1/agents/{agent_id}/core-memory/blocks/{block_label}`

**Body Parameters (all optional):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | string | Block content |
| `description` | string | Block description |
| `limit` | number | Character limit |
| `tags` | string[] | Associated tags |
| `metadata` | object | Custom metadata |
| `is_template` | boolean | Template flag |

**Response:** Updated `Block`

---

### 2.4 Attach Block to Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/core-memory/blocks/attach/$BLOCK_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `PATCH /v1/agents/{agent_id}/core-memory/blocks/attach/{block_id}`

**Response:** `AgentState`

---

### 2.5 Detach Block from Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/core-memory/blocks/detach/$BLOCK_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `PATCH /v1/agents/{agent_id}/core-memory/blocks/detach/{block_id}`

**Response:** `AgentState`

---

## 3. Global Blocks

### 3.1 List All Blocks

```bash
curl 'https://api.letta.com/v1/blocks/?limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/blocks/`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results |
| `order` | string | `asc` or `desc` |
| `label_search` | string | Search by label |
| `description_search` | string | Search by description |
| `value_search` | string | Search by value content |
| `tags` | string[] | Filter by tags |
| `match_all_tags` | boolean | Require all tags |
| `identity_id` | string | Filter by identity |
| `project_id` | string | Filter by project |
| `connected_to_agents_count_eq` | number | Filter by exact agent connection count |
| `connected_to_agents_count_gt` | number | Filter by min agent connections |
| `connected_to_agents_count_lt` | number | Filter by max agent connections |

**Response:** Array of `Block` objects

---

### 3.2 Create Block

```bash
curl https://api.letta.com/v1/blocks/ \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "shared/knowledge",
    "value": "Shared knowledge base content...",
    "description": "Knowledge shared across agents",
    "limit": 100000
  }'
```

**Method:** `POST /v1/blocks/`

**Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `label` | string | Yes | Block label (e.g. `persona`, `human`, `shared/knowledge`) |
| `value` | string | Yes | Block content |
| `description` | string | No | Block description |
| `limit` | number | No | Character limit (default: 100000) |
| `is_template` | boolean | No | Whether block is a template |
| `tags` | string[] | No | Tags for categorization |
| `metadata` | object | No | Custom metadata |
| `project_id` | string | No | Associated project |

**Response:** `Block`

---

### 3.3 Retrieve Block

```bash
curl https://api.letta.com/v1/blocks/$BLOCK_ID \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/blocks/{block_id}`

**Response:** `Block`

---

### 3.4 Update Block

```bash
curl https://api.letta.com/v1/blocks/$BLOCK_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "Updated content...",
    "description": "Updated description"
  }'
```

**Method:** `PATCH /v1/blocks/{block_id}`

**Body Parameters (all optional):** `value`, `label`, `description`, `tags`, `is_template`, `limit`, `metadata`

**Response:** Updated `Block`

---

### 3.5 Delete Block

```bash
curl https://api.letta.com/v1/blocks/$BLOCK_ID \
  -X DELETE \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `DELETE /v1/blocks/{block_id}`

---

## 4. Agent Messages

### 4.1 List Messages

```bash
curl 'https://api.letta.com/v1/agents/$AGENT_ID/messages?limit=50&order=desc' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/messages`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `limit` | number | Max results |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at` |
| `conversation_id` | string | Filter by conversation |
| `group_id` | string | Filter by group |
| `include_return_message_types` | string[] | Filter message types |
| `include_err` | boolean | Include error messages |
| `use_assistant_message` | boolean | Parse tool args as assistant messages |

**Message Types:** `system_message`, `user_message`, `assistant_message`, `reasoning_message`, `hidden_reasoning_message`, `tool_call_message`, `tool_return_message`, `approval_request_message`, `approval_response_message`, `summary_message`, `event_message`

**Response:** Array of message objects

---

### 4.2 Send Message

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/messages \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, how are you?"}]
  }'
```

**Method:** `POST /v1/agents/{agent_id}/messages`

**Body Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | string or array | User message content (simple form) |
| `messages` | array | Array of `MessageCreate` objects: `{ role, content }` |
| `streaming` | boolean | Enable SSE streaming |
| `stream_tokens` | boolean | Stream individual tokens vs complete steps |
| `background` | boolean | Process in background when streaming |
| `include_pings` | boolean | Include keepalive pings |
| `max_steps` | number | Maximum agent processing steps |
| `enable_thinking` | string | Enable reasoning before responses |
| `include_return_message_types` | string[] | Filter response message types |
| `override_model` | string | Per-request model override |
| `override_system` | string | Per-request system prompt override |

**Response:** `LettaResponse` containing:
- `messages`: Array of message objects
- `stop_reason`: Termination cause
- `usage`: Token statistics

---

### 4.3 Send Message (Streaming)

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/messages \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "streaming": true,
    "stream_tokens": true
  }'
```

**Response:** Server-Sent Events stream

> **Note:** `POST /v1/agents/{agent_id}/messages/stream` is deprecated. Use `streaming: true` in the main messages endpoint instead.

---

## 5. Agent Tools

### 5.1 List Agent Tools

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/tools \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/tools`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `limit` | number | Max results |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at` |

**Response:** Array of `Tool` objects

---

### 5.2 Attach Tool to Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/tools/attach/$TOOL_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `PATCH /v1/agents/{agent_id}/tools/attach/{tool_id}`

**Response:** `AgentState`

---

### 5.3 Detach Tool from Agent

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/tools/detach/$TOOL_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `PATCH /v1/agents/{agent_id}/tools/detach/{tool_id}`

**Response:** `AgentState`

---

## 6. Global Tools

### 6.1 List Tools

```bash
curl 'https://api.letta.com/v1/tools/?limit=100' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/tools/`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results |
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `name` | string | Filter by exact name |
| `names` | string[] | Filter by multiple names |
| `tool_ids` | string[] | Filter by IDs |
| `search` | string | Case-insensitive partial match |
| `tool_types` | string[] | Filter by type |
| `exclude_tool_types` | string[] | Exclude types |
| `return_only_letta_tools` | boolean | Only Letta built-in tools |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at` |

**Tool Types:** `custom`, `letta_core`, `external_langchain`, `external_composio`, `external_mcp`

**Response:** Array of `Tool` objects

---

### 6.2 Create Tool

```bash
curl https://api.letta.com/v1/tools/ \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "def get_weather(location: str) -> str:\n    \"\"\"Get weather for a location.\n\n    Args:\n        location: City name\n    \"\"\"\n    return f\"Weather for {location}: Sunny\"",
    "description": "Get current weather for a location",
    "source_type": "python"
  }'
```

**Method:** `POST /v1/tools/`

**Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_code` | string | Yes | Python function source code |
| `description` | string | No | Tool description |
| `source_type` | string | No | `python` |
| `return_char_limit` | number | No | Max return characters |
| `default_requires_approval` | boolean | No | Require human approval |
| `enable_parallel_execution` | boolean | No | Allow parallel calls |
| `json_schema` | object | No | Full JSON schema |
| `args_json_schema` | object | No | Arguments schema |
| `pip_requirements` | array | No | `[{ name, version? }]` |
| `npm_requirements` | array | No | `[{ name, version? }]` |
| `tags` | string[] | No | Tags |

**Response:** `Tool`

---

### 6.3 Upsert Tool

```bash
curl https://api.letta.com/v1/tools/ \
  -X PUT \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_code": "def my_tool() -> str:\n    return \"hello\"",
    "description": "My tool"
  }'
```

**Method:** `PUT /v1/tools/`

Same parameters as Create. Creates or updates.

**Response:** `Tool`

---

### 6.4 Retrieve Tool

```bash
curl https://api.letta.com/v1/tools/$TOOL_ID \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/tools/{tool_id}`

**Response:** `Tool`

---

### 6.5 Update Tool

```bash
curl https://api.letta.com/v1/tools/$TOOL_ID \
  -X PATCH \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "source_code": "def my_tool() -> str:\n    return \"updated\""
  }'
```

**Method:** `PATCH /v1/tools/{tool_id}`

**Body Parameters (all optional):** Same as Create

**Response:** Updated `Tool`

---

### 6.6 Delete Tool

```bash
curl https://api.letta.com/v1/tools/$TOOL_ID \
  -X DELETE \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `DELETE /v1/tools/{tool_id}`

---

### 6.7 Search Tools

```bash
curl https://api.letta.com/v1/tools/search \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "weather",
    "search_mode": "hybrid",
    "limit": 10
  }'
```

**Method:** `POST /v1/tools/search`

**Body Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search text |
| `search_mode` | string | `vector`, `fts`, or `hybrid` |
| `limit` | number | Max results |
| `tool_types` | string[] | Filter by type |
| `tags` | string[] | Filter by tags |

**Response:** Array of `{ combined_score, tool, vector_rank, fts_rank }`

---

## 7. Archival Memory (Agent Passages)

### 7.1 List Archival Memory

```bash
curl 'https://api.letta.com/v1/agents/$AGENT_ID/archival-memory?limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/archival-memory`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Starting memory ID |
| `before` | string | Ending memory ID |
| `limit` | number | Max results |
| `ascending` | boolean | Sort oldest-to-newest (default: true) |
| `search` | string | Text-based filtering |

**Response:** Array of `Passage` objects

---

### 7.2 Create Archival Memory

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/archival-memory \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Important information to remember...",
    "tags": ["project", "requirements"]
  }'
```

**Method:** `POST /v1/agents/{agent_id}/archival-memory`

**Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Content to store |
| `created_at` | string | No | Custom timestamp (ISO) |
| `tags` | string[] | No | Labels for the passage |

**Response:** `Passage`

---

### 7.3 Delete Archival Memory

```bash
curl https://api.letta.com/v1/agents/$AGENT_ID/archival-memory/$MEMORY_ID \
  -X DELETE \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `DELETE /v1/agents/{agent_id}/archival-memory/{memory_id}`

---

### 7.4 Search Archival Memory

```bash
curl 'https://api.letta.com/v1/agents/$AGENT_ID/archival-memory/search?query=project+requirements&top_k=10' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/agents/{agent_id}/archival-memory/search`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Semantic search text |
| `top_k` | number | No | Max results |
| `start_datetime` | string | No | Lower time bound (ISO) |
| `end_datetime` | string | No | Upper time bound (ISO) |
| `tags` | string[] | No | Filter by labels |
| `tag_match_mode` | string | No | `any` or `all` |

**Response:** `{ count, results: [{ id, text, created_at, tags }] }`

---

## 8. Runs

### 8.1 List Runs

```bash
curl 'https://api.letta.com/v1/runs/?limit=20&agent_id=$AGENT_ID' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results |
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `agent_id` | string | Filter by agent |
| `agent_ids` | string[] | Filter by multiple agents |
| `conversation_id` | string | Filter by conversation |
| `statuses` | string[] | Filter by status |
| `stop_reason` | string | Filter by stop reason |
| `active` | boolean | Only active runs |
| `background` | boolean | Only background runs |
| `ascending` | boolean | Sort order |
| `order` | string | `asc` or `desc` |
| `order_by` | string | Sort field |

**Run Statuses:** `created`, `running`, `completed`, `failed`, `cancelled`, `requires_approval`

**Response:** Array of `Run` objects

---

### 8.2 Retrieve Run

```bash
curl https://api.letta.com/v1/runs/$RUN_ID \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/{run_id}`

**Response:** `Run` with id, agent_id, status, stop_reason, created_at, completed_at, timing metrics

---

### 8.3 List Run Messages

```bash
curl 'https://api.letta.com/v1/runs/$RUN_ID/messages?limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/{run_id}/messages`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `after` | string | Cursor pagination |
| `before` | string | Cursor pagination |
| `limit` | number | Max results |
| `order` | string | `asc` or `desc` |
| `order_by` | string | `created_at` |

**Response:** Array of message objects

---

### 8.4 Stream Run

```bash
curl https://api.letta.com/v1/runs/$RUN_ID/stream \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'$AGENT_ID'"
  }'
```

**Method:** `POST /v1/runs/{run_id}/stream`

**Body Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | Agent ID |
| `batch_size` | number | Batch size |
| `include_pings` | boolean | Keepalive pings |
| `poll_interval` | number | Poll interval |
| `starting_after` | string | Start after message ID |

**Response:** SSE stream

---

### 8.5 Get Run Usage

```bash
curl https://api.letta.com/v1/runs/$RUN_ID/usage \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/{run_id}/usage`

**Response:** Token metrics: `prompt_tokens`, `completion_tokens`, `total_tokens`, cache details, reasoning breakdown

---

### 8.6 List Run Steps

```bash
curl 'https://api.letta.com/v1/runs/$RUN_ID/steps?limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/{run_id}/steps`

**Query Parameters:** `after`, `before`, `limit`, `order`, `order_by`

**Response:** Array of step objects with token counts, model info, status, error data

---

### 8.7 Retrieve Run Trace

```bash
curl 'https://api.letta.com/v1/runs/$RUN_ID/trace?limit=100' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/runs/{run_id}/trace`

**Query Parameters:** `limit`

**Response:** OpenTelemetry span data

---

## 9. Passages (Global)

### 9.1 List Passages

```bash
curl 'https://api.letta.com/v1/passages/?agent_id=$AGENT_ID&limit=50' \
  -H "Authorization: Bearer $LETTA_API_KEY"
```

**Method:** `GET /v1/passages/`

**Query Parameters:** `limit`, `offset`, `agent_id`, `query`

**Response:** Array of `Passage` objects

---

### 9.2 Create Passage

```bash
curl https://api.letta.com/v1/passages/ \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-abc123",
    "text": "Important information to remember...",
    "metadata": {"source": "document.pdf"}
  }'
```

**Method:** `POST /v1/passages/`

---

### 9.3 Search Passages

```bash
curl https://api.letta.com/v1/passages/search \
  -X POST \
  -H "Authorization: Bearer $LETTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "project requirements",
    "agent_id": "agent-abc123"
  }'
```

**Method:** `POST /v1/passages/search`

---

## Data Models

### AgentState

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Agent ID (`agent-<uuid4>`) |
| `name` | string | Agent name |
| `agent_type` | string | `memgpt_agent`, `letta_v1_agent`, `react_agent`, `sleeptime_agent`, etc. |
| `description` | string | Agent description |
| `system` | string | System prompt |
| `model` | string | LLM model handle |
| `blocks` | Block[] | Memory blocks |
| `tools` | Tool[] | Attached tools |
| `tags` | string[] | Tags |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |
| `last_run_completion` | string | Last run timestamp |
| `last_stop_reason` | string | Last stop reason |
| `project_id` | string | Project ID |
| `metadata` | object | Custom metadata |

### Block

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Block ID (`block-<uuid4>`) |
| `label` | string | Block label (e.g. `persona`, `human`) |
| `value` | string | Block content |
| `description` | string | Description |
| `limit` | number | Character limit (default: 100000) |
| `is_template` | boolean | Template flag |
| `tags` | string[] | Tags |
| `metadata` | object | Custom metadata |
| `created_by_id` | string | Creator |
| `last_updated_by_id` | string | Last updater |
| `project_id` | string | Project ID |

### Tool

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Tool ID (`tool-<uuid4>`) |
| `name` | string | Tool name |
| `description` | string | Description |
| `source_code` | string | Python source |
| `tool_type` | string | `custom`, `letta_core`, `external_mcp`, etc. |
| `args_json_schema` | object | Argument schema |
| `json_schema` | object | Full schema |
| `pip_requirements` | array | Python deps |
| `npm_requirements` | array | Node deps |
| `tags` | string[] | Tags |
| `return_char_limit` | number | Max return chars |

### Run

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Run ID |
| `agent_id` | string | Agent ID |
| `conversation_id` | string | Conversation ID |
| `status` | string | `created`, `running`, `completed`, `failed`, `cancelled`, `requires_approval` |
| `stop_reason` | string | Why the run stopped |
| `created_at` | string | ISO timestamp |
| `completed_at` | string | ISO timestamp |

---

## Error Handling

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request — Invalid parameters |
| 401 | Unauthorized — Invalid API key |
| 404 | Not Found — Resource doesn't exist |
| 422 | Unprocessable Entity — Validation error |
| 500 | Internal Server Error |

Error response format:
```json
{
  "detail": "Error message"
}
```

## Pagination

Most list endpoints support cursor-based pagination:

| Parameter | Description |
|-----------|-------------|
| `limit` | Max results per page |
| `after` | Return items after this ID |
| `before` | Return items before this ID |
| `order` | `asc` or `desc` |
| `order_by` | Sort field (usually `created_at`) |

Some older endpoints use offset-based pagination:

| Parameter | Description |
|-----------|-------------|
| `limit` | Max results |
| `offset` | Skip first N results |

## Related Resources

- [Letta API Documentation](https://docs.letta.com/api/)
- [Letta Python SDK](https://docs.letta.com/api/python/)
