# Refactoring Plan

## Goal
Organize codebase with clean feature-based architecture, max 400 lines per file.

## Phase 1: Sidebar Component (Priority)
Break down Sidebar.tsx (867 lines) into:
- features/sidebar/components/Sidebar/index.tsx (main, ~250 lines)
- features/sidebar/components/AgentGroup/index.tsx (already extracted)
- features/sidebar/components/SidebarHeader/index.tsx 
- features/sidebar/components/SessionsTab/index.tsx
- features/sidebar/components/ConfigurationTab/index.tsx
- features/sidebar/components/EmailConversations/index.tsx
- features/sidebar/components/IntegrationSection/index.tsx
- features/sidebar/hooks/useSidebar.ts
- features/sidebar/hooks/useSessionGroups.ts
- features/sidebar/types.ts

## Phase 2: Common Components
Create src/ui/common/ for:
- components: Button, Input, Modal, Card, Avatar, Badge
- hooks: useDebounce, useLocalStorage, useCopyToClipboard

## Phase 3: Feature Folders
- features/chat/ - all chat-related
- features/channels/ - channel management
- features/email/ - email functionality
- features/auth/ - authentication

## Phase 4: Large Components (>400 lines)
1. PromptInput.tsx (1364 lines)
2. ChannelsManager.tsx (975 lines)
3. apiClient.ts (875 lines)
4. ipc-handlers.ts (709 lines)
5. main.ts (657 lines)

## Phase 5: Electron Structure
electron/
  main/ - main process
  preload/ - preload scripts
  ipc/ - ipc handlers by domain
  api/ - api clients
  services/ - business logic
