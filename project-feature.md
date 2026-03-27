# Vera Cowork Project Guide

## Purpose

This document is a **full-project technical guide** for `letta-cowork` / **Vera Cowork**.

It is written for agents and developers who need to quickly understand:

- what the app does
- how the main subsystems fit together
- where key code lives
- how the major runtime flows work
- how the unread email pipeline behaves today
- which improvements are safe to make first

This file intentionally goes beyond the email feature. The unread email auto-sync pipeline is documented here as one important subsystem inside the larger desktop app.

---

## What This Project Is

Vera Cowork is an **Electron desktop app** with a **React renderer** that provides a visual interface for working with **Letta Code agents**.

It combines several capabilities in one app:

1. **Interactive chat sessions with Letta agents**
2. **Persistent conversation/session management**
3. **Email ingestion and email-to-agent workflows**
4. **Messaging channel bridges**
   - WhatsApp
   - Telegram
   - Discord
   - Slack
5. **Skill download and local agent tooling support**
6. **Configuration management for Letta environment + channel bridges**

At a high level, this project is an **agent operations cockpit** for desktop users.

---

## High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        React Renderer                       │
│                                                             │
│  App.tsx                                                    │
│  Sidebar / Chat UI / Settings / Email UI / Channel UI       │
│  Hooks: useIPC, useSessionController, useAutoSyncUnread     │
│  Store: Zustand (useAppStore)                               │
└───────────────────────┬─────────────────────────────────────┘
                        │ window.electron (preload bridge)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                    │
│                                                             │
│  main.ts                                                    │
│  ipc-handlers.ts                                            │
│  envManager.ts / settings.ts                               │
│  runner.ts / runtime-state.ts                              │
│  email APIs / bridge managers / skill downloader           │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
                │                     │
                ▼                     ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│   Letta Code / SDK   │   │ External Integrations            │
│                      │   │                                  │
│ createSession        │   │ Zoho Mail API                    │
│ resumeSession        │   │ WhatsApp / Telegram / Discord    │
│ stream()             │   │ Slack bridge APIs                │
│ agent conversations  │   │ local file uploads / local OAuth │
└──────────────────────┘   └──────────────────────────────────┘
```

---

## System Mental Model

If you need one sentence to orient yourself, use this:

> Vera Cowork is a desktop shell around Letta Code agents that lets users chat with agents, route external messages into agents, automate unread email intake, and manage agent-adjacent integrations from one Electron/React application.

---

## Main Subsystems

## 1. React renderer

Primary purpose:

- render the desktop UI
- collect user input
- show session history and live agent output
- manage email and channel configuration screens
- trigger IPC calls to the Electron process

Key files:

- `src/ui/App.tsx`
  - application wiring
  - top-level state
  - email automation settings persistence
- `src/ui/store/useAppStore.ts`
  - global session store via Zustand
  - server-event handling
  - active session, history hydration, UI state
- `src/ui/hooks/useIPC.ts`
  - connects renderer to `window.electron` event stream
- `src/ui/hooks/useSessionController.ts`
  - session start/continue logic
- `src/ui/components/chat/*`
  - chat timeline and streaming message rendering
- `src/ui/components/sidebar/*`
  - session list, integrations, pipeline settings

---

## 2. Electron main process

Primary purpose:

- own privileged desktop/runtime operations
- expose IPC APIs to renderer
- manage Letta sessions and external integrations
- persist app settings and session metadata

Key files:

- `src/electron/main.ts`
  - app boot
  - window creation
  - IPC registration
  - integration initialization
- `src/electron/preload.cts`
  - safe renderer API surface via `window.electron`
- `src/electron/ipc-handlers.ts`
  - routes `session.start`, `session.continue`, `session.stop`, etc.
- `src/electron/libs/runner.ts`
  - creates and streams Letta sessions
- `src/electron/libs/runtime-state.ts`
  - in-memory runtime session state
- `src/electron/settings.ts`
  - electron-store persistence for settings and stored sessions
- `src/electron/envManager.ts`
  - Letta environment configuration

---

## 3. Letta session runtime

Primary purpose:

- create or resume Letta sessions
- stream assistant/tool/reasoning events back to the UI
- translate Letta lifecycle into app session state

Key files:

- `src/electron/libs/runner.ts`
- `src/electron/ipc-handlers.ts`
- `src/ui/store/useAppStore.ts`

Key behavior:

- `session.start` starts a new Letta conversation
- streamed messages are forwarded to the renderer as `stream.message`
- session lifecycle is reflected as `session.status`
- UI store updates the session timeline and ephemeral status accordingly

---

## 4. Email integration

Primary purpose:

- connect to Zoho Mail
- fetch folders/accounts/emails
- fetch message content by ID
- download/upload attachments
- support manual email-to-agent flow
- support unread email auto-sync pipeline

Key files:

- `src/electron/emails/fetchEmails.ts`
- `src/electron/emails/zohoApi.ts`
- `src/electron/emails/express.ts`
- `src/ui/hooks/useZohoEmail.ts`
- `src/ui/hooks/useProcessEmailToAgent.ts`
- `src/ui/hooks/useAutoSyncUnread.ts`

---

## 5. Channel bridges

Primary purpose:

- receive messages from external messaging platforms
- send them into Letta agents
- return the generated response back to the channel

Supported channels:

- WhatsApp
- Telegram
- Discord
- Slack

Key files:

- `src/electron/bridges/channelBridgeManager.ts`
- `src/electron/bridges/channelConfig.ts`
- `src/electron/bridges/lettaResponder.ts`
- `src/electron/bridges/whatsappBridge.ts`
- `src/electron/bridges/telegramBridge.ts`
- `src/electron/bridges/discordBridge.ts`
- `src/electron/bridges/slackBridge.ts`

---

## 6. Skills and external workflows

Primary purpose:

- provide reusable agent skill packs
- support Odoo, PDF, mail, and Neo4j-related workflows

Key directory:

- `skills/`

Current skill sets include:

- `skills/mails`
- `skills/neo4j-email`
- `skills/odoo`
- `skills/pdf-reader`

---

## Project Structure

```text
letta-cowork/
├── src/
│   ├── electron/
│   │   ├── main.ts
│   │   ├── preload.cts
│   │   ├── ipc-handlers.ts
│   │   ├── envManager.ts
│   │   ├── settings.ts
│   │   ├── lettaAgents.ts
│   │   ├── skillDownloader.ts
│   │   ├── bridges/
│   │   ├── emails/
│   │   └── libs/
│   └── ui/
│       ├── App.tsx
│       ├── components/
│       ├── hooks/
│       ├── store/
│       ├── utils/
│       └── render/
├── skills/
├── assets/
├── README.md
├── project-feature.md
└── package.json
```

---

## Runtime Flows

## Flow 1: starting a normal Letta session

```text
User enters prompt in UI
        │
        ▼
React component / hook builds client event
        │
        ▼
window.electron.sendClientEvent({ type: "session.start" })
        │
        ▼
Electron ipc-handlers.ts receives event
        │
        ▼
runLetta(...) in runner.ts
        │
        ▼
Letta session streams messages/events
        │
        ▼
Electron emits server-event payloads
        │
        ▼
useIPC / useAppStore handle stream.message + session.status
        │
        ▼
Chat timeline updates in renderer
```

### Important notes

- session lifecycle begins in Electron, not directly in React
- the renderer is mostly a state consumer and event initiator
- Zustand is the main client-side source of truth for session view state

---

## Flow 2: continue an existing conversation

```text
User selects existing session
        │
        ▼
Renderer sends session.continue
        │
        ▼
Electron resumes runtime session or Letta conversation
        │
        ▼
runner.ts streams new events
        │
        ▼
useAppStore merges new history/messages into timeline
```

---

## Flow 3: external channel message → Letta response

```text
Channel bridge receives inbound message
        │
        ▼
Attachment normalization / upload (if needed)
        │
        ▼
lettaResponder.ts builds prompt with channel metadata
        │
        ▼
Letta session create/resume
        │
        ▼
Assistant stream is merged into final response text
        │
        ▼
Channel bridge sends response back to platform
```

### Important design note

`lettaResponder.ts` is effectively the adapter between messaging channels and Letta session execution.

---

## Flow 4: unread email auto-sync pipeline

```text
Auto-sync enabled in UI
        │
        ▼
useAutoSyncUnread polls Zoho unread emails
        │
        ▼
Filter out already processed IDs + older-than since-date
        │
        ▼
Resolve target agents via routing rules or fallback list
        │
        ▼
For each email / target agent:
    fetch full content
    download+upload attachments
    build markdown prompt
    start Letta session
    wait for session completion
        │
        ▼
If every routed session completes successfully
        │
        ▼
mark email as read in Zoho
persist processed ID locally
```

### Important current behavior

This pipeline is still:

- polling-based
- renderer-driven
- local-state-backed

It is **not yet** a durable background queue or worker engine.

---

## Configuration and Persistence

## 1. Renderer localStorage

Used for UI-scoped settings, especially email automation.

Examples:

- `auto_sync_unread_enabled`
- `auto_sync_selected_agent_ids`
- `auto_sync_routing_rules`
- `auto_sync_since_date`
- `auto_sync_processed_unread_<accountId>_<folderId>`

Used for:

- unread pipeline config
- local processed email tracking
- lightweight user preferences

---

## 2. Electron store

Managed in:

- `src/electron/settings.ts`

Stores:

- cowork UI settings
- persisted session metadata

Examples:

- which integration sections are visible
- stored session list with title, timestamps, and agent metadata

---

## 3. User environment files

Managed in:

- `src/electron/envManager.ts`

Used for:

- Letta API key / base URL / default agent config
- user-level app environment persistence

Notes:

- environment is loaded during Electron startup
- app config is written into user-level environment storage
- agents modifying this subsystem should be careful not to expose secrets in logs or docs

---

## Main Files by Responsibility

## App shell and orchestration

- `src/ui/App.tsx`
- `src/ui/components/Sidebar.tsx`
- `src/ui/components/layout/WorkspaceLayout.tsx`

## Session state and event handling

- `src/ui/store/useAppStore.ts`
- `src/ui/hooks/useIPC.ts`
- `src/ui/hooks/useSessionController.ts`
- `src/electron/ipc-handlers.ts`
- `src/electron/libs/runner.ts`

## Email subsystem

- `src/ui/hooks/useZohoEmail.ts`
- `src/ui/hooks/useProcessEmailToAgent.ts`
- `src/ui/hooks/useAutoSyncUnread.ts`
- `src/electron/emails/fetchEmails.ts`
- `src/electron/emails/zohoApi.ts`
- `src/electron/emails/fileManager.ts`

## Channel bridge subsystem

- `src/electron/bridges/channelBridgeManager.ts`
- `src/electron/bridges/channelConfig.ts`
- `src/electron/bridges/lettaResponder.ts`
- `src/electron/bridges/*Bridge.ts`

## Skills and downloads

- `src/electron/skillDownloader.ts`
- `skills/**/SKILL.md`

## Settings and configuration

- `src/electron/settings.ts`
- `src/electron/envManager.ts`
- `src/ui/hooks/useCoworkSettings.ts`
- `src/ui/components/CoworkSettingsDialog.tsx`

---

## Email Pipeline Deep Dive

The unread email auto-sync feature is exposed in the UI as:

- **Auto-sync unread**

Key renderer files:

- `src/ui/components/sidebar/IntegrationList.tsx`
- `src/ui/components/sidebar/NewMailPipelineSetting.tsx`
- `src/ui/hooks/useAutoSyncUnread.ts`

Key backend files:

- `src/electron/preload.cts`
- `src/electron/main.ts`
- `src/electron/emails/fetchEmails.ts`
- `src/electron/ipc-handlers.ts`

### Current behavior summary

- polls unread Zoho emails every minute
- fetches up to 100 unread emails per poll
- routes each email by sender-rule or fallback agents
- fetches full content and uploads attachments
- creates a Letta session per email/agent pair
- waits for those sessions to complete successfully
- marks the email as read only if all routed sessions succeed
- stores processed message IDs locally in localStorage

### Why this matters

This makes the current pipeline safer than a dispatch-only design, because a failed agent run does not immediately cause the email to be marked read.

### Remaining limitations

- still renderer-bound
- no durable queue/state machine
- no retry engine
- processed IDs are still local-only
- large unread backlogs still depend on paginated fetch improvements

---

## Session Status Lifecycle

The app uses session status values like:

- `running`
- `completed`
- `error`
- `idle`

Conceptual flow:

```text
session.start
   │
   ▼
running
   │
   ├──► completed   (successful run)
   │
   ├──► error       (runner/session failure)
   │
   └──► idle        (abort / stop / no active execution)
```

Renderer store responsibilities:

- update titles and metadata
- track live streamed content
- maintain assistant draft / reasoning / tool execution state
- show chat history and errors to the user

---

## Where Agents Should Start Reading

If an agent is dropped into this project and needs to move fast, read in this order:

1. `README.md`
2. `project-feature.md`
3. `src/ui/App.tsx`
4. `src/ui/store/useAppStore.ts`
5. `src/electron/main.ts`
6. `src/electron/ipc-handlers.ts`
7. subsystem-specific files for the task
   - email: `src/ui/hooks/useAutoSyncUnread.ts`, `src/electron/emails/fetchEmails.ts`
   - channels: `src/electron/bridges/channelBridgeManager.ts`, `lettaResponder.ts`
   - sessions: `src/electron/libs/runner.ts`

---

## Safe Change Zones

## Safe-ish UI-only changes

Usually limited to:

- `src/ui/components/**`
- presentation updates
- labels, layout, visual state

## Medium-risk orchestration changes

Usually involve:

- `src/ui/App.tsx`
- `src/ui/store/useAppStore.ts`
- `src/ui/hooks/useSessionController.ts`
- `src/ui/hooks/useAutoSyncUnread.ts`

These affect user workflows and runtime coordination.

## Higher-risk infrastructure changes

Usually involve:

- `src/electron/ipc-handlers.ts`
- `src/electron/libs/runner.ts`
- `src/electron/main.ts`
- `src/electron/envManager.ts`
- `src/electron/bridges/*`
- `src/electron/emails/fetchEmails.ts`

These can affect cross-process behavior, credentials, external integrations, or session lifecycle.

---

## Known Limitations / Technical Debt

## Cross-project limitations

1. Session and integration behavior is split across renderer + Electron, which increases coordination complexity.
2. Some settings are localStorage-based while others use electron-store, so persistence is split.
3. Channel bridges and email automation are feature-rich but not yet unified under one job/state model.

## Unread email pipeline limitations

1. not a durable queue
2. no retry policy yet
3. processed IDs are client-local
4. no dead-letter/failure inbox
5. 100-email poll limit
6. renderer lifecycle still controls execution

## Operational caution areas

1. environment configuration handling
2. session title / session metadata consistency
3. attachment upload flows
4. bridge-specific platform auth/config

---

## Recommended Next Improvements

## Email pipeline

1. persist pipeline state outside localStorage
2. add retry / failure tracking
3. add pipeline observability UI
4. support pagination/backfill for larger unread inboxes
5. eventually move scheduling to a more durable background process

## Sessions

1. normalize session title handling across start/running/completed states
2. improve explicit status mapping for user-visible workflows
3. expose better session completion hooks to automation flows

## Channels

1. unify channel bridge status events and UI visibility
2. add per-channel troubleshooting surfaces
3. improve agent routing / per-channel agent selection

## Docs / onboarding

1. keep `AGENT-README.md` in sync with architecture changes
2. add subsystem-specific docs for bridges and email pipeline retries when implemented

---

## Quick Reference Cheatsheet

### If the task is about chat/session bugs
Read:

- `src/ui/store/useAppStore.ts`
- `src/electron/ipc-handlers.ts`
- `src/electron/libs/runner.ts`

### If the task is about unread email auto-sync
Read:

- `src/ui/hooks/useAutoSyncUnread.ts`
- `src/ui/components/sidebar/NewMailPipelineSetting.tsx`
- `src/electron/emails/fetchEmails.ts`
- `src/electron/preload.cts`

### If the task is about channel bots
Read:

- `src/electron/bridges/channelBridgeManager.ts`
- `src/electron/bridges/channelConfig.ts`
- `src/electron/bridges/lettaResponder.ts`

### If the task is about environment/config
Read:

- `src/electron/envManager.ts`
- `src/electron/settings.ts`
- `src/ui/components/ChangeEnv.tsx`
- `src/ui/components/CoworkSettingsDialog.tsx`

---

## Last Updated

This document was expanded into a full-project guide and now includes:

- architecture overview
- subsystem map
- text diagrams / flowcharts
- runtime flow descriptions
- unread email pipeline behavior
- change-risk guidance for future agents
