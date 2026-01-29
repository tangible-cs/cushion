# OpenCode AI Chat Integration for Cushion

**Goal**: Fully integrated AI chat that can read/edit Cushion files using OpenCode's backend + React frontend

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cushion (Next.js)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ CodeMirror   │  │ File Browser │  │  Chat Sidebar    │  │
│  │   Editor     │  │              │  │ (React Port)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                   │             │
│         │ selections       │ files             │ messages    │
│         └──────────────────┴───────────────────┘             │
│                        │                                     │
│                ┌───────▼────────┐                            │
│                │ Cushion Store   │                            │
│                │  (Zustand)     │                            │
│                └───────┬────────┘                            │
└────────────────────────┼─────────────────────────────────────┘
                         │ WebSocket
                ┌────────▼────────┐
                │ OpenCode SDK    │
                │  (Client)       │
                └────────┬────────┘
                         │ JSON-RPC
                ┌────────▼────────┐
                │ OpenCode        │
                │ Coordinator     │
                │  (Node/ws)      │
                └─────────────────┘
```

## Phase 1: Backend Integration

### 1.1 Research OpenCode Coordinator

**Files to Research**:
- `opencode/packages/app/src/context/sync.tsx` — WebSocket sync layer
- `opencode/packages/app/src/context/sdk.tsx` — SDK client wrapper
- `opencode/packages/app/src/context/server.tsx` — Server connection management
- `opencode/packages/app/src/context/global-sync.tsx` — Global sync manager
- `opencode/packages/sdk/v2/client.ts` — Client SDK implementation
- `opencode/packages/coordinator/src/` — Backend coordinator

**Key Concepts**:
- WebSocket JSON-RPC communication
- Session management (create, abort, stream)
- Message/part synchronization
- File operations through SDK
- Agent/model selection
- Worktree/sandbox management

**Do NOT Trust**: RPC method names, message schemas, authentication flow — verify in actual code

### 1.2 Study Cushion Coordinator

**Files to Research**:
- `apps/coordinator/src/server.ts` — Existing WebSocket server
- `apps/coordinator/src/workspace/manager.ts` — File operations
- `packages/types/src/` — Shared TypeScript types

**Integration Points**:
- Add OpenCode SDK as dependency to coordinator
- Create OpenCode client instance
- Expose OpenCode capabilities via existing RPC methods
- OR: Run separate OpenCode coordinator on different port

**Approach Decision**:
- [ ] Merge OpenCode into Cushion coordinator (single server)
- [ ] Run parallel coordinators (recommended for MVP)
- [ ] Use OpenCode coordinator directly (skip Cushion coordinator for chat)

**Do NOT Trust**: That existing Cushion coordinator can handle OpenCode's workload — test performance

## Phase 2: SDK & Client Layer

### 2.1 OpenCode SDK Client

**Files to Research**:
- `opencode/packages/sdk/v2/client.ts` — Main client
- `opencode/packages/sdk/v2/` — Type definitions
- `opencode/packages/app/src/context/sdk.tsx` — React/Solid wrapper

**Key Classes/Functions**:
- `createOpencodeClient()` — Client factory
- `client.session.create()` — Create new chat session
- `client.session.prompt()` — Send message
- `client.session.abort()` — Cancel ongoing request
- `client.session.shell()` — Shell command
- `client.worktree.create()` — Create worktree
- `client.file.read()`, `client.file.write()` — File ops

**Do NOT Trust**: That the SDK will work in browser environment — verify WebSocket handling

### 2.2 Create React SDK Wrapper

**New File**: `apps/frontend/lib/opencode-client.ts`

```typescript
// PSEUDO-CODE - Research actual implementation first
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

export function useOpenCodeClient(workspace: string) {
  // Research: How to connect to coordinator?
  // Research: Authentication tokens?
  // Research: WebSocket reconnection logic?
  const client = createOpencodeClient({
    baseUrl: 'ws://localhost:3000', // Verify port
    directory: workspace,
    throwOnError: true,
  })

  return client
}
```

**Do NOT Trust**: This pseudocode — actual implementation will be different

## Phase 3: State Management (Port SolidJS → React)

### 3.1 Research SolidJS Contexts

**Files to Research**:
- `opencode/packages/app/src/context/prompt.tsx` — Message parts, context items
- `opencode/packages/app/src/context/sync.tsx` — Message/part sync from WebSocket
- `opencode/packages/app/src/context/local.tsx` — Local settings (model, agent)
- `opencode/packages/app/src/context/layout.tsx` — UI state, tabs, panels
- `opencode/packages/app/src/context/file.tsx` — File operations

**Key State Structures**:
- `Prompt` — Array of text/file/agent parts
- `ContextItem` — File attachments with selections/comments
- `Message` — Chat messages with metadata
- `Part` — Message parts (text, file, tool, agent)
- `SessionStatus` — Idle, busy, error

**Do NOT Trust**: That SolidJS signals map directly to React hooks — reactivity is different

### 3.2 Create Zustand Store

**New File**: `apps/frontend/stores/chatStore.ts`

```typescript
// PSEUDO-CODE - Research actual structures first
interface ChatState {
  // Research: What prompt state is needed?
  prompt: Prompt
  cursorPosition?: number
  contextItems: ContextItem[]

  // Research: What session state is needed?
  sessions: Session[]
  currentSessionId?: string
  messages: Record<string, Message[]>
  sessionStatus: Record<string, SessionStatus>

  // Research: What local settings?
  selectedModel?: Model
  selectedAgent?: Agent

  // Actions
  setPrompt: (prompt: Prompt, cursor?: number) => void
  addContextItem: (item: ContextItem) => void
  createSession: () => Promise<string>
  sendMessage: (message: string) => Promise<void>
  abortSession: (sessionId: string) => Promise<void>
}
```

**Do NOT Trust**: Store structure — verify against actual SolidJS context usage

### 3.3 Persistence Strategy

**Research Files**:
- `opencode/packages/app/src/utils/persist.ts` — Persistence utilities
- `opencode/packages/app/src/context/prompt.tsx` — Prompt persistence
- `opencode/packages/app/src/context/layout.tsx` — Layout persistence

**What to Persist**:
- Current prompt and cursor
- Context items
- Session tabs
- Model/agent selection
- Session scroll positions

**Do NOT Trust**: Persisting everything — may exceed localStorage limits

## Phase 4: React Component Porting

### 4.1 Research PromptInput Component

**File to Research**: `opencode/packages/app/src/components/prompt-input.tsx` (1622 lines)

**Key Features**:
- Rich text editing with CodeMirror/contenteditable
- @mentions for files and agents
- / slash commands
- File/image drag-and-drop
- Message history (↑/↓ navigation)
- Shell mode (!)
- Optimistic UI updates
- Model/agent selectors

**Dependencies to Replace**:
- `@opencode-ai/ui/*` — Replace with existing Cushion UI or shadcn/ui
- `@solid-primitives/*` — Use React equivalents
- SolidJS components — Rewrite in React

**Do NOT Trust**: Any implementation details — read the entire file carefully

### 4.2 Research Session Page

**File to Research**: `opencode/packages/app/src/pages/session.tsx`

**Key Features**:
- Message history display
- Diff review panel
- Terminal integration
- File browser integration
- Context tab
- Tab management

**Do NOT Trust**: Layout structure — will need to adapt to Cushion's UI

### 4.3 Create React Components

**New Files**:
- `apps/frontend/components/chat/PromptInput.tsx` — Chat input
- `apps/frontend/components/chat/MessageList.tsx` — Message history
- `apps/frontend/components/chat/ContextPanel.tsx` — Context items
- `apps/frontend/components/chat/ModelSelector.tsx` — Model/agent picker
- `apps/frontend/components/chat/FileAttachment.tsx` — Attached files

**Do NOT Trust**: That you can just copy-paste — must understand each function first

## Phase 5: Cushion Integration

### 5.1 Editor Selection to Chat

**Files to Research**:
- `apps/frontend/components/editor/CodeEditor.tsx` — CodeMirror editor
- `apps/frontend/lib/wiki-link.tsx` — How they handle selections
- Cushion's cursor/selection API

**Integration**:
- Add "Ask AI" button/keyboard shortcut
- Capture selected text
- Create ContextItem with file path + selection
- Pre-fill PromptInput with @file reference

**Do NOT Trust**: Selection API will be straightforward — test edge cases

### 5.2 File Browser Integration

**Files to Research**:
- `apps/frontend/components/workspace/FileBrowser.tsx` — File tree
- How OpenCode integrates file operations

**Integration**:
- Add context menu: "Ask AI about this file"
- Drag file into chat
- Show AI context badges on files

**Do NOT Trust**: File path handling across workspaces

### 5.3 Workspace/Worktree Support

**Research**:
- OpenCode's worktree concept
- Cushion's workspace structure
- How to map Cushion workspaces → OpenCode worktrees

**Do NOT Trust**: They're 1:1 compatible — verify mapping logic

## Phase 6: Dependencies & Setup

### 6.1 Install OpenCode SDK

```bash
# Research: Is this published to npm?
pnpm add @opencode-ai/sdk/v2

# OR: Copy SDK from source?
cp -r opencode/packages/sdk packages/opencode-sdk
```

**Do NOT Trust**: Package is published — verify in npm registry

### 6.2 UI Components

**Research**:
- `opencode/packages/ui/src/` — UI component library
- What components PromptInput uses
- Can we use them in React?

**Approaches**:
- [ ] Port OpenCode UI to React
- [ ] Use shadcn/ui as replacement
- [ ] Mix of both

**Do NOT Trust**: Any UI component will work without adaptation

### 6.3 WebSocket Configuration

**Research**:
- OpenCode coordinator port (default?)
- Authentication requirements
- Reconnection strategy
- CORS configuration

**Do NOT Trust**: Default configuration — verify in coordinator code

## Phase 7: Testing Strategy

### 7.1 Unit Tests

**Research**:
- OpenCode's test files
- Testing approach for state management
- Mocking WebSocket connections

**Test Coverage**:
- Prompt parsing and rendering
- Context item management
- Message synchronization
- File selection → context conversion

**Do NOT Trust**: Mocking WebSocket is trivial — test real connections

### 7.2 Integration Tests

**Test Scenarios**:
- Send message, receive response
- Attach file, verify it's in context
- Select text from editor, verify it's in chat
- Create session, abort, verify cleanup
- Navigate message history

**Do NOT Trust**: Everything works end-to-end — test manually too

## Phase 8: Progressive Implementation Plan

### Sprint 1: Backend Setup
- [ ] Run OpenCode coordinator
- [ ] Connect Cushion frontend via WebSocket
- [ ] Test simple message send/receive
- [ ] Verify session management

### Sprint 2: Chat Input
- [ ] Port PromptInput basic functionality
- [ ] Implement message sending
- [ ] Add model/agent selection
- [ ] Test basic chat flow

### Sprint 3: Message History
- [ ] Implement MessageList component
- [ ] Sync messages from WebSocket
- [ ] Add streaming response support
- [ ] Test multi-turn conversations

### Sprint 4: Context Integration
- [ ] Implement file attachments
- [ ] Add editor selection → chat context
- [ ] Create ContextPanel component
- [ ] Test file-aware conversations

### Sprint 5: Advanced Features
- [ ] Add slash commands
- [ ] Implement shell mode
- [ ] Add image attachments
- [ ] Optimize performance

### Sprint 6: Polish
- [ ] Improve error handling
- [ ] Add loading states
- [ ] Implement keyboard shortcuts
- [ ] Write documentation

## Research Checklist

**Backend**:
- [ ] Read `opencode/packages/coordinator/src/` completely
- [ ] Read `opencode/packages/sdk/v2/client.ts` completely
- [ ] Understand WebSocket message format
- [ ] Understand authentication flow
- [ ] Understand session lifecycle

**State Management**:
- [ ] Read `opencode/packages/app/src/context/prompt.tsx` completely
- [ ] Read `opencode/packages/app/src/context/sync.tsx` completely
- [ ] Read `opencode/packages/app/src/context/local.tsx` completely
- [ ] Read `opencode/packages/app/src/context/layout.tsx` completely
- [ ] Map all SolidJS signals to React state

**Components**:
- [ ] Read `opencode/packages/app/src/components/prompt-input.tsx` completely
- [ ] Read `opencode/packages/app/src/pages/session.tsx` completely
- [ ] Read `opencode/packages/app/src/components/session/session-context-tab.tsx` completely
- [ ] Identify all dependencies to port

**Cushion**:
- [ ] Read Cushion coordinator RPC methods
- [ ] Read Cushion file system integration
- [ ] Read Cushion editor selection API
- [ ] Understand Cushion's state management

**General**:
- [ ] Verify OpenCode SDK is available
- [ ] Understand worktree vs workspace
- [ ] Research CORS requirements
- [ ] Plan authentication/authorization

## Critical Warnings

1. **DO NOT** copy code without understanding it first
2. **DO NOT** assume SolidJS patterns translate directly to React
3. **DO NOT** skip reading entire files — edge cases are important
4. **DO NOT** trust the coordinator port — verify in code
5. **DO NOT** assume authentication is handled — verify
6. **DO NOT** trust that localStorage will be sufficient — test limits
7. **DO NOT** skip error handling — AI requests fail often
8. **DO NOT** assume WebSocket reconnection is automatic — implement it

## Success Criteria

- [ ] Can send/receive messages in chat sidebar
- [ ] Can select text in editor and send to AI
- [ ] Can attach files to chat
- [ ] Messages sync correctly
- [ ] Session state persists
- [ ] Model/agent selection works
- [ ] Error handling works
- [ ] Performance is acceptable

## Questions to Answer During Research

1. What port does OpenCode coordinator use?
2. Is OpenCode SDK published to npm? If not, how to import?
3. What's the WebSocket message format?
4. How does authentication work?
5. How are sessions created/destroyed?
6. What's the worktree concept? How does it map to Cushion workspaces?
7. How does streaming responses work?
8. What's the token counting mechanism?
9. How are files attached to messages?
10. What's the context item structure?
11. How does optimistic UI work?
12. What's the slash command system?
13. How does the @mention system work?
14. What UI components from OpenCode can we reuse?
15. What's the persistence strategy?
