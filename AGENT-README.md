# AGENT-README

## What this project is

**Vera Cowork** is an Electron + React desktop app for working with **Letta Code agents**.

Core capabilities:

- chat with Letta agents in a desktop UI
- manage/persist session metadata
- connect Zoho Mail and route emails into agents
- run messaging bridges for WhatsApp, Telegram, Discord, and Slack
- download/use project skills

---

## Fast architecture map

```text
React UI
  └─ src/ui/
      ├─ App.tsx
      ├─ store/useAppStore.ts
      ├─ hooks/
      └─ components/

Electron main
  └─ src/electron/
      ├─ main.ts
      ├─ preload.cts
      ├─ ipc-handlers.ts
      ├─ libs/runner.ts
      ├─ emails/
      └─ bridges/
```

---

## Read these first

1. `README.md`
2. `project-feature.md`
3. `src/ui/App.tsx`
4. `src/ui/store/useAppStore.ts`
5. `src/electron/main.ts`
6. `src/electron/ipc-handlers.ts`

---

## Most important subsystems

### Sessions / chat
- `src/electron/libs/runner.ts`
- `src/electron/ipc-handlers.ts`
- `src/ui/store/useAppStore.ts`

### Email automation
- `src/ui/hooks/useAutoSyncUnread.ts`
- `src/ui/hooks/useProcessEmailToAgent.ts`
- `src/electron/emails/fetchEmails.ts`
- `src/ui/components/sidebar/NewMailPipelineSetting.tsx`

### Channel bridges
- `src/electron/bridges/channelBridgeManager.ts`
- `src/electron/bridges/channelConfig.ts`
- `src/electron/bridges/lettaResponder.ts`
- `src/electron/bridges/*Bridge.ts`

### Settings / env
- `src/electron/settings.ts`
- `src/electron/envManager.ts`
- `src/ui/components/CoworkSettingsDialog.tsx`
- `src/ui/components/ChangeEnv.tsx`

---

## Key runtime flows

### Start session
```text
UI -> sendClientEvent(session.start) -> ipc-handlers -> runner.ts -> Letta stream -> useAppStore -> chat UI
```

### Unread email auto-sync
```text
useAutoSyncUnread
  -> fetch unread Zoho emails
  -> filter processed IDs
  -> route to agents
  -> fetch full email + attachments
  -> start Letta session(s)
  -> wait for successful completion
  -> mark email read
```

### Channel bridge response
```text
Bridge receives message -> lettaResponder.ts -> Letta session -> bridge sends response back
```

---

## Persistence model

### localStorage
Used mainly for email auto-sync config and processed unread IDs.

### electron-store
Used for cowork settings and stored session metadata.

### env manager
Used for Letta environment configuration and user-level app env persistence.

---

## Important cautions

1. Renderer and Electron responsibilities are split; cross-process changes need care.
2. Unread email automation is useful but still not a full durable queue.
3. Attachment handling touches both Zoho fetch and Letta file upload flows.
4. Avoid exposing secrets when touching env/config code.
5. Session metadata and session status behavior are central to many flows.

---

## Current pipeline note

The first safety improvement in the unread email pipeline is:

- **mark email as read only after the auto-created Letta session(s) complete successfully**

This reduces false-success cases where a session starts but later fails.

---

## When you need more detail

Open:

- `project-feature.md` for full architecture + flowcharts
- `skills/**/SKILL.md` for project-specific workflows
