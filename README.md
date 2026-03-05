<div align="center">

# Letta Cowork

[![Platform](https://img.shields.io/badge/platform-%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/letta-ai/letta-cowork/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-39.2.7-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.3.1-blue.svg)](https://vitejs.dev/)

A desktop application for running Letta Code agents with a visual interface.

</div>

## What is Letta Cowork?

Letta Cowork is a fork of [Claude-Cowork](https://github.com/DevAgentForge/Claude-Cowork) that replaces the Claude SDK with the [`@letta-ai/letta-code-sdk`](https://www.npmjs.com/package/@letta-ai/letta-code-sdk). It provides a native desktop GUI for interacting with [Letta Code](https://github.com/letta-ai/letta-code) agents.

### Why Letta Code SDK?

The [Letta Code SDK](https://github.com/letta-ai/letta-code-sdk) is the SDK interface to [Letta Code](https://github.com/letta-ai/letta-code). Build agents with persistent memory that learn over time.

```typescript
import { createSession, resumeSession } from '@letta-ai/letta-code-sdk';

// First session - agent learns something
const session1 = createSession();
await session1.send('Remember: the secret word is "banana"');
for await (const msg of session1.stream()) { /* ... */ }
const agentId = session1.agentId;
session1.close();

// Later... agent still remembers
await using session2 = resumeSession(agentId);
await session2.send('What is the secret word?');
for await (const msg of session2.stream()) {
  if (msg.type === 'assistant') console.log(msg.content); // "banana"
}
```

**Key concepts:**
- **Agent** (`agentId`): Persistent entity with memory that survives across sessions
- **Conversation** (`conversationId`): A message thread within an agent
- **Session** (`sessionId`): A single execution/connection

Agents remember across conversations (via memory blocks), but each conversation has its own message history. This means you can run multiple concurrent conversations with the same agent - each conversation has its own message history while sharing the agent's persistent memory.

---

## Project Structure

```
letta-cowork/
├── src/
│   ├── electron/                 # Electron main process
│   │   ├── main.ts              # Main entry point
│   │   ├── preload.cts          # Preload script for IPC
│   │   ├── envManager.ts        # Environment configuration
│   │   ├── ipc-handlers.ts      # IPC communication handlers
│   │   ├── skillDownloader.ts  # Skill download management
│   │   ├── bridges/             # Messaging platform integrations
│   │   │   ├── whatsappBridge.ts
│   │   │   ├── telegramBridge.ts
│   │   │   ├── discordBridge.ts
│   │   │   └── slackBridge.ts
│   │   ├── emails/              # Email integration
│   │   │   ├── express.ts       # Local OAuth server
│   │   │   ├── fetchEmails.ts   # Email API operations
│   │   │   ├── helper.ts        # Email utilities
│   │   │   ├── types.ts         # Email type definitions
│   │   │   └── zohoApi.ts       # Zoho Mail API
│   │   └── libs/                # Core libraries
│   │       ├── runner.ts        # Agent runner
│   │       └── runtime-state.ts # Runtime state management
│   └── ui/                      # React frontend
│       ├── App.tsx             # Main App component
│       ├── main.tsx            # UI entry point
│       ├── components/         # React components
│       │   ├── Sidebar.tsx
│       │   ├── ChatMainPanel.tsx
│       │   ├── DecisionPanel.tsx
│       │   ├── PromptInput.tsx
│       │   ├── ChannelSetupDialog.tsx
│       │   ├── SkillDownloadDialog.tsx
│       │   └── channel-settings/  # Channel configuration UI
│       ├── hooks/              # Custom React hooks
│       ├── store/              # Zustand state management
│       └── render/             # Rendering utilities
├── skills/                     # Agent skills
│   ├── mails/                  # Zoho Mail operations
│   ├── neo4j-email/            # Neo4j email schema
│   ├── odoo/                   # Odoo ERP integration
│   └── pdf-reader/             # PDF processing
├── assets/                     # Static assets
├── patches/                    # Dependency patches
├── .env.example               # Environment template
├── package.json               # Project dependencies
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript config
└── electron-builder.json      # Electron builder config
```

---

## Available Services

### Messaging Platforms

| Service | Description | Port | Configuration |
|---------|-------------|------|---------------|
| **WhatsApp** | Baileys-powered WhatsApp bot with QR code authentication | - | [`whatsappConfig.ts`](src/electron/bridges/channelConfig.ts) |
| **Telegram** | Telegram bot with bot token authentication | - | [`telegramConfig.ts`](src/electron/bridges/channelConfig.ts) |
| **Discord** | Discord bot with DM/Group support | - | [`discordConfig.ts`](src/electron/bridges/channelConfig.ts) |
| **Slack** | Slack bot with socket mode | - | [`slackConfig.ts`](src/electron/bridges/channelConfig.ts) |

### Email Integration

| Service | Description | Port | Documentation |
|---------|-------------|------|----------------|
| **Zoho Mail** | Email operations via local Express API | 4321 | [SKILL.md](skills/mails/SKILL.md) |

The email server runs as a local OAuth callback handler for Zoho Mail. It provides:
- Email fetching and search
- **Fetch email by ID** - Get full email content by message ID
- Attachment download
- Multi-account support

### Agent Skills

| Skill | Description | Documentation |
|-------|-------------|---------------|
| **mails** | Zoho Mail local operations | [skills/mails/SKILL.md](skills/mails/SKILL.md) |
| **neo4j-email** | Neo4j email schema integration | [skills/neo4j-email/SKILL.md](skills/neo4j-email/SKILL.md) |
| **odoo** | Odoo ERP operations | [skills/odoo/SKILL.md](skills/odoo/SKILL.md) |
| **pdf-reader** | PDF document processing | [skills/pdf-reader/SKILL.md](skills/pdf-reader/SKILL.md) |

---

## Prerequisites

- [Bun](https://bun.sh/) or Node.js 22+
- Letta API key from [app.letta.com/settings](https://app.letta.com/settings)
- (Optional) [letta-code-sdk](https://github.com/letta-ai/letta-code-sdk) cloned locally at `../letta-code-sdk` (temporary - will be published to npm)

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/letta-ai/letta-cowork.git
cd letta-cowork
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Get your Letta API key from [app.letta.com/settings](https://app.letta.com/settings), then edit `.env` and add your API key:

```bash
# Letta Cloud (recommended for most users)
LETTA_API_KEY=your-api-key-here
LETTA_BASE_URL=https://api.letta.com  # This is the default

# Optional: Use a specific agent (defaults to LRU agent)
# LETTA_AGENT_ID=agent-xxx
# LETTA_SKIP_DEFAULT_AGENTS="true"
```

**Local Development** (for advanced users running Letta server locally):

```bash
# Uncomment these lines to use a local Letta server instead:
# LETTA_BASE_URL=http://localhost:8283
# LETTA_API_KEY=dummy  # Local server ignores this
```

**Email Server Configuration:**

```bash
EMAIL_SERVER_BASE_URL=http://localhost:8000
```

**Note:** The app defaults to Letta Cloud (`https://api.letta.com`). For local development, see `.env.example` for localhost configuration.

---

## Running the Application

### Development Mode

Start the development server with hot reload:

```bash
bun run dev
```

This command runs both the React frontend (Vite) and Electron main process concurrently:
- Frontend: http://localhost:5173 (default Vite port)
- Electron: Main process with IPC handlers

### Building for Production

```bash
# Type checking and build
bun run build
```

### Building Distributables

```bash
# macOS ARM64 (Apple Silicon)
bun run dist:mac-arm64

# macOS x64 (Intel)
bun run dist:mac-x64

# Windows
bun run dist:win

# Linux
bun run dist:linux
```

### Other Commands

```bash
# Linting
bun run lint

# Preview production build
bun run preview

# Rebuild native modules (if needed)
bun run rebuild
```

---

## Architecture

Letta Cowork uses [`@letta-ai/letta-code-sdk`](https://www.npmjs.com/package/@letta-ai/letta-code-sdk) to run agents.

### How It Works

1. The app spawns the Letta Code CLI as a subprocess via the SDK
2. Communication happens via stdin/stdout JSON streaming
3. Each task creates a new conversation on the LRU agent (via `createSession()`)
4. Agent memory persists across conversations via memory blocks

### Key Components

- **Electron Main Process**: Handles IPC, window management, native integrations
- **React Frontend**: UI components built with React 19, Zustand for state management
- **Bridge System**: Modular messaging platform integrations (WhatsApp, Telegram, Discord, Slack)
- **Email System**: Local Express server for OAuth and Zoho Mail API operations
- **Skill System**: Downloadable agent skills for specialized tasks

---

## Configuration

### Channel Setup

Each messaging platform can be configured through the UI:
- Open the app and navigate to the channel settings
- Configure bot tokens, auto-start options, and response behaviors
- Settings are persisted locally

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LETTA_API_KEY` | Letta API key | Required |
| `LETTA_BASE_URL` | Letta API endpoint | `https://api.letta.com` |
| `LETTA_AGENT_ID` | Specific agent to use | LRU agent |
| `EMAIL_SERVER_BASE_URL` | Email server URL | `http://localhost:8000` |
| `DEBUG_IPC` | Enable IPC debugging | `false` |
| `LETTA_NO_SYNC` | Disable sync | `false` |

---

## Development

```bash
# Start development server (hot reload)
bun run dev

# Type checking and build
bun run build

# Run linting
bun run lint
```

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Related Links

- [Letta Code SDK](https://github.com/letta-ai/letta-code-sdk)
- [Letta Code](https://github.com/letta-ai/letta-code)
- [Claude-Cowork](https://github.com/DevAgentForge/Claude-Cowork)
- [Zoho Mail API](https://www.zoho.com/mail/help/)
