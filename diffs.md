# OpenCode Chat UI Parity Differences

This document tracks differences between Cushion's chat UI and the OpenCode desktop app UI.

**Comparison target**: OpenCode Desktop (Tauri-based app). Focus is desktop UI parity.

## Priority Legend
- **HIGH** - Critical UX/behavior gap
- **MEDIUM** - Important UI/interaction difference
- **LOW** - Nice-to-have or edge-case parity

---

## STATUS SUMMARY

### Fixed or Mostly Aligned
1. ✅ @ mention searches workspace + grouping + fuzzy match
2. ✅ Scroll behavior for nested blocks + auto-scroll working-state fixes
3. ✅ Markdown rendering for text/reasoning parts
4. ✅ Tool part styling (BasicTool-like wrapper, icons, collapsible)
5. ✅ Copy buttons for user and response text (basic parity, no tooltip)
6. ✅ Resizable chat panel width (desktop)
7. ✅ Prompt input auto-expands (sticky at bottom, no manual resize)
8. ✅ Popover/autocomplete with sticky headers and grouped suggestions
9. ✅ Prompt input container (card layout, sections, drop overlay, shell mode)
10. ✅ Context chips parity (icons, tooltips, scroll, remove affordance)
11. ✅ Attachment thumbnails
12. ✅ Diff summary accordion (sticky headers, file icons, change bars)
13. ✅ Session turn resume-scroll button + duration display
14. ✅ Diff hunk expansion (show only changed parts with expandable separators)

---

### 🔄 NEXT: Provider Connection Polish + Other Parity Items

**Next Steps**:
1. Test API key validation with actual provider APIs (beyond basic validation)
2. Verify refresh button works correctly with models.dev (edge case testing)
3. Test error handling for various invalid API key scenarios
4. Add provider icon components matching OpenCode's ProviderIcon (nice-to-have)
5. Focus on other parity gaps (SessionContextUsage, ProgressCircle, etc.)

---

### 🔄 NEXT: Full Provider Connection Testing

---

## NOTES

The items above are scoped to the desktop UI parity request. Web-only features were excluded.

The "Active Development" section tracks currently in-progress features that are not yet part of the parity comparison.

---

### 🔄 NEXT: Ollama Provider Integration (HIGH PRIORITY - Local/Open-Source AI Backend)

**Why This Is Important**
- Users want fully open-source and local AI alternatives
- Ollama is the most popular local LLM runtime
- Integration must be seamless (no manual config file editing)
- Auto-discovery is critical for good UX
- Context window configuration is essential for coding tasks

**Current Implementation Status**
- ✅ Basic Ollama provider added to Cushion coordinator
  - Health check endpoint
  - Model discovery via `/api/tags`
  - Storage integration (baseURL, connection state)
  - RPC endpoints: `provider/ollama/list`, `provider/ollama/pull`, `provider/ollama/delete`
- ✅ Frontend client methods for Ollama operations
- ✅ Ollama-specific UI in ConnectProviderDialog
  - Health status indicator (running/not-running)
  - Custom baseURL support (default: `http://localhost:11434`)
  - "Local" badge in ModelSelector

### ✅ COMPLETED: Ollama Backend Auto-Discovery + Config Writer (Option A - Write to OpenCode)

**Backend (Coordinator)**
- ✅ Ollama auto-discovery module (`apps/coordinator/src/providers/ollama-discover.ts`)
  - `discoverModels(baseUrl)` - Auto-discover installed models via Ollama's `/api/tags`
  - `estimateContextWindow(model)` - Estimate context window based on model family/size
  - Parses model metadata: name, family, parameter size (e.g., 7B, 13B, 34B)
  - Returns model list with formatted names (e.g., `qwen3:8b` → `Qwen3 8B`)

- ✅ Ollama config writer (`apps/coordinator/src/providers/ollama-config.ts`)
  - `writeOllamaToConfig()` - Write Ollama config to `~/.config/opencode/opencode.json`
  - Auto-enables `tools: true` for all models (CRITICAL for agentic actions)
  - Sets reasonable context windows based on model size:
    - 7B models: 8k (default)
    - 8B models: 12k
    - 13B models: 16k (good for coding)
    - 14B models: 16k
    - 32B models: 32k
    - 34B models: 64k
    - 70B models: 128k
  - Merges with existing config (preserves other providers)
  - Uses XDG-compliant config path: `~/.config/opencode/opencode.json`

- ✅ RPC endpoint (`apps/coordinator/src/server.ts`)
  - `provider/ollama/write-config` - Write discovered models to OpenCode config
  - Handler: `handleOllamaWriteConfig()`
  - Parameters: `baseUrl?`, `models?` (optional, auto-discovers if not provided)
  - Returns: `{ success: boolean, message: string }`

- ✅ Frontend client extension (`apps/frontend/lib/coordinator-client.ts`)
  - `writeOllamaConfig(params)` - Client method for writing Ollama config

**Architecture Decision: Option A (Write to OpenCode Config)**
- Chosen approach: Write directly to OpenCode's config file
- Config location: `~/.config/opencode/opencode.json` (XDG-compliant)
- Desktop App auto-picks up config changes (via file reload on next connection)
- Benefits: Works with existing Desktop App, no UI changes needed to chat system

**OpenCode Config Format Generated**:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "qwen3:8b": {
          "id": "qwen3:8b",
          "name": "Qwen3 8B",
          "limit": { "context": 16384 },
          "options": { "tools": true }
        }
      }
    }
  }
}
```

**Testing**:
- ✅ TypeScript compilation passes
- ✅ Coordinator builds successfully
- ⏳ Auto-discovery tested with real Ollama instance
- ⏳ Config writing tested
- ⏳ OpenCode Desktop App picks up new models
- ⏳ Tools work with new context windows

**Critical Issues Identified (Based on Real User Experience)**

**1. Auto-Discovery is Missing (CRITICAL)**
- **Problem**: Current implementation requires manual model listing via RPC
- **OpenCode approach**: Uses `@ai-sdk/openai-compatible` with static model definitions in config
- **Required**: Auto-discover all installed Ollama models on connection
- **Solution**: When user connects Ollama, automatically:
  - Call `GET /api/tags` to list all models
  - Display each model with options
  - No manual config file editing needed

**2. Context Window Defaults to 4k (CRITICAL - Breaks Tools)**
- **Problem**: Ollama sets `num_ctx` to 4096 by default, even for models that support 40k+
- **Impact**: Tools/agent actions fail because context is too small
- **Real User Example**:
  - `qwen3:8b` supports ~40k context
  - But Ollama runs it with 4k context by default
  - Agentic actions (file ops, tools) don't work
  - **Fix Required**: Set `num_ctx` parameter in Ollama model
- **Manual CLI Fix** (what users currently must do):
  ```bash
  ollama run qwen3:8b
  >>> /set parameter num_ctx 16384
  >>> /save qwen3:8b-16k
  ```
- **Required UI Feature**:
  - Context window slider per model
  - Recommended presets: 4k, 8k, 16k, 32k, 64k, 128k
  - Auto-create variant on save (e.g., `qwen3:8b-16k`)
  - Warn user about VRAM requirements for larger contexts
  - 70B models may need 64k+ (user research needed)

**3. Tools Support Not Enabled by Default (CRITICAL)**
- **Problem**: Even with correct context, tools don't work unless `tools: true` is set in config
- **OpenCode config requirement**:
  ```json
  {
    "provider": {
      "ollama": {
        "npm": "@ai-sdk/openai-compatible",
        "name": "Ollama",
        "options": {
          "baseURL": "http://localhost:11434/v1"
        },
        "models": {
          "qwen3:8b-16k": {
            "tools": true  // ← Critical for agentic actions
          }
        }
      }
    }
  }
  ```
- **Required**: Auto-enable `tools: true` for all connected Ollama models
- **Required**: UI indicator showing which models support tools

**4. Model Variant Management (HIGH)**
- **Problem**: Users can't easily create model variants with different settings
- **Real User Example**: `qwen3:8b` → `qwen3:8b-16k` (after context change)
- **Required UI Features**:
  - Duplicate/clone model variant button
  - Edit model name
  - Edit context window
  - Delete model variant
  - All within the same dialog (not separate Ollama panel)

**5. Integration with OpenCode Desktop (ARCHITECTURAL DECISION NEEDED)**
- **Current Issue**: Cushion has two provider systems:
  1. Cushion coordinator (localhost:3001) - where we added Ollama
  2. OpenCode Desktop App (localhost:4097) - what chat UI actually uses
- **OpenCode's Ollama Integration**:
  - Uses `@ai-sdk/openai-compatible` npm package
  - Reads config from `~/.config/opencode/opencode.json`
  - No auto-discovery (models defined statically in config)
  - Base URL: `http://localhost:11434/v1` (note: `/v1` suffix required)
- **Question**: Which approach should Cushion use?
  - **Option A**: Write to OpenCode's config file, let Desktop App handle it
  - **Option B**: Use Cushion's coordinator as the provider system (requires chat UI changes)
  - **Option C**: Hybrid - Cushion writes config, but also maintains its own registry

**Required Implementation**

**Phase 1: Backend Auto-Discovery (COMPLETED ✅)**

When user clicks "Connect Ollama" in ModelSelector, the backend now:
1. ✅ Health Check - Show green checkmark if server running
2. ✅ Auto-Discover Models - Call `GET /api/tags` to list all models
3. ✅ Context Window Estimation - Auto-calculate based on model size
4. ✅ Write to OpenCode Config - Auto-enable `tools: true` for all models

### ✅ COMPLETED: LocalAIButton - Dedicated Local AI Menu (Phase 2a)

**Design Decision: Separate Local AI Button (not inside ConnectProviderDialog)**
- Local AI is fundamentally different from cloud providers (no API keys, runs on machine, free)
- Dedicated button gives always-accessible management without digging into provider settings
- Scalable to other local providers later (LM Studio, LocalAI, vLLM)
- Minimal OpenCode-style menu design

**Files Created**:
- `apps/frontend/components/chat/LocalAIButton.tsx` — Main component with popover menu
- `apps/frontend/components/chat/Icon.tsx` — Added `computer` icon

**Files Modified**:
- `apps/frontend/components/chat/PromptInput.tsx` — Added `<LocalAIButton>` next to ModelSelector
- `apps/frontend/lib/coordinator-client.ts` — Defensive error handling in `handleResponse` (was crashing on `response.error.message` when undefined)
- `apps/coordinator/src/server.ts` — Fixed `handleOllamaWriteConfig` to enrich partial models from frontend with discovery data (was crashing on `family.toLowerCase()` when frontend sent `{ id, name }` without `family`/`parameterSize`)

**LocalAIButton Features**:
- Monitor icon button in prompt input area (next to ModelSelector)
- Popover menu with:
  - Header: "Local AI" with close button
  - Status indicator: green/red dot showing Ollama running state
  - Model list: each model shows toggle dot (●), name, and settings button (⋯)
  - Toggle enables/disables model (writes to OpenCode config)
  - Click model name to select as active model
  - Footer: Refresh + Pull model buttons
- Pull Model dialog: text input + popular models quick-select list

**Bugs Fixed During Implementation**:
1. **`toLowerCase` crash** — `handleOllamaWriteConfig` in server.ts called `estimateContextWindow(model)` on partial model objects from frontend (missing `family`/`parameterSize`). Fixed by enriching partial models with discovery data from Ollama before estimation.
2. **`response.error.message` crash** — `coordinator-client.ts` `handleResponse` crashed when error response had undefined `message`. Fixed with fallback: `response.error.message || response.error.data?.toString() || 'Unknown error'`.

**Known Issues (MUST FIX NEXT)**:

**CRITICAL: No Feedback Loop Between Config Write and ChatStore**

The LocalAIButton writes config to `~/.config/opencode/opencode.json` but there's no way to update the chatStore's `providers` list afterward:

1. `writeOllamaConfig` → writes config to disk ✅
2. OpenCode Desktop App detects change → updates its provider list (eventually) ⏳
3. ChatStore `providers` updates → LocalAIButton can see enabled models ❌ **NO TRIGGER**

**Impact**:
- Toggling a model writes to disk but the UI doesn't reflect it on re-open
- `enabled` flags are derived from `ollamaProvider?.models` in the chatStore (comes from OpenCode SDK)
- Since the chatStore only fetches providers during `connect()`, the enabled state resets when the menu re-opens
- Selecting a model via `setSelectedModel({ providerID: 'ollama', modelID })` works in the store, but the model won't be usable for chat until OpenCode reloads its config

**Solution Required**:
After `writeOllamaConfig` succeeds, call OpenCode SDK's `localClient.config.providers()` to re-fetch the provider list and update `chatStore.providers`. This is the same call used during `connect()` at `chatStore.ts:804`. Need to either:
- Export a `refreshProviders()` action on the chatStore
- Or call the OpenCode SDK directly from LocalAIButton and update the store

**Data Flow (Current - Broken)**:
```
LocalAIButton → writeOllamaConfig → disk ✅
                                     ↓
                              OpenCode detects (eventually) ⏳
                                     ↓
                              chatStore.providers ❌ (stale)
```

**Data Flow (Required - Fixed)**:
```
LocalAIButton → writeOllamaConfig → disk ✅
              → refreshProviders() → OpenCode SDK → chatStore.providers ✅
```

---

**Phase 2b: Frontend UI Remaining (NEXT)**

**Architecture Decision: Option A - Write to OpenCode Config**

Since the chat UI uses OpenCode Desktop App (localhost:4097) exclusively for AI operations, we'll write directly to its config file.

**Frontend Implementation Plan - Remaining Items**

Items moved from ConnectProviderDialog approach to LocalAIButton approach:

**Step 1: Enhanced ConnectProviderDialog for Ollama**
1. Health Check (already exists ✅)
   - Display green checkmark if Ollama running
   - Show error if not running with "ollama serve" instructions

2. Auto-Discover Models (NEW)
   - Call RPC: `provider/ollama/write-config` with no `models` parameter
   - Backend auto-discovers all installed models
   - Display loading spinner while discovering
   - Show discovered model list:
     ```
     ┌─────────────────────────────────────┐
     │ Connect Ollama                 [X] │
     │                                     │
     │ ✅ Ollama is running            │
     │                                     │
     │ Select models to configure:          │
     │                                     │
     │ ☑ qwen3:8b         [Edit]      │
     │    Context: 16k  [Delete]     │
     │ ☑ mistral:7b        [Edit]      │
     │    Context: 12k                  │
     │ ☑ llama2:7b        [Edit]      │
     │    Context: 8k                   │
     │                                     │
     │ [Select All] [Cancel]             │
     └─────────────────────────────────────┘
     ```

**Step 2: Per-Model Configuration (All in Same Dialog)**
For each discovered model, display:
- **Model name**: Auto-formatted (e.g., `qwen3:8b` → `Qwen3 8B`)
- **Default context**: Estimated from model size
- **Recommended context**: Badge based on model family
- **Context window slider**: 
  - Presets: 4k, 8k, 16k, 32k, 64k, 128k
  - Max limited to 128k (Ollama limit)
  - "Recommended" badge on optimal preset
  - VRAM warning if context too large
- **Tools support checkbox**: Checked by default (CRITICAL)
- **"Create variant" button**:
  - Disabled if no changes from default
  - Shows prompt: "Save as qwen3:8b-16k?"

**Step 3: Context Window Presets (Smart Defaults)**
```
Model Size      | Default | Recommended (Coding) | Max
----------------|---------|-------------------|-----
7B           | 8k      | 16k                | 64k
8B           | 12k     | 16k-32k            | 64k
13B          | 16k     | 32k                | 128k
14B          | 16k     | 32k                | 128k
32B          | 32k     | 64k                | 128k
34B          | 32k     | 64k                | 128k
70B          | 64k     | 64k+               | 128k
```

**Step 4: Write to OpenCode Config**
After user selects models and settings:
- Call RPC: `provider/ollama/write-config` with:
  ```json
  {
    "baseUrl": "http://localhost:11434",
    "models": [
      { "id": "qwen3:8b", "name": "Qwen3 8B", "family": "qwen" },
      { "id": "mistral:7b", "name": "Mistral 7B", "family": "mistral" }
    ]
  }
  ```
- Backend:
  - Auto-calculates context windows for each model
  - Enables `tools: true` for all models
  - Writes to `~/.config/opencode/opencode.json`
  - Merges with existing providers
- Success message: "Successfully configured 2 Ollama models for OpenCode"

**Step 5: OpenCode Desktop App Detection**
After config write:
- Desktop App auto-detects config file changes (file watcher or next connection)
- Models appear in ModelSelector dropdown automatically
- User can immediately select and use Ollama models

**Phase 1: Auto-Discovery + Connection Dialog Enhancement**

When user clicks "Connect Ollama" in ModelSelector:

1. **Health Check** (already implemented ✅)
   - Show green checkmark if server running
   - Show error if not running (with "ollama serve" instructions)

2. **Auto-Discover Models** (NEW)
   - Fetch `GET http://localhost:11434/api/tags`
   - Parse response: `{ models: [{ name, size, digest, details }] }`
   - Display list of installed models

3. **Per-Model Configuration** (NEW - ALL IN SAME DIALOG)
   For each discovered model, show:
   - **Model name** (e.g., `qwen3:8b`)
   - **Default context** (estimate from model size: 7B→8k, 13B→16k, 34B→32k, 70B→64k)
   - **Recommended context** (based on model's actual capabilities if available)
   - **Context window slider** with presets:
     - 4k (default, low VRAM)
     - 16k (good for coding)
     - 32k (recommended for tools)
     - 64k (recommended for large projects)
     - 128k (max for most models, requires lots of VRAM)
   - **VRAM warning** if context > available memory
   - **Tools support checkbox** (default: checked)
   - **"Create variant" button** - saves as new model name

4. **Write to OpenCode Config** (NEW or use existing)
   - Create/append to `~/.config/opencode/opencode.json`:
     ```json
     {
       "provider": {
         "ollama": {
           "npm": "@ai-sdk/openai-compatible",
           "name": "Ollama",
           "options": {
             "baseURL": "http://localhost:11434/v1"
           },
           "models": {
             "qwen3:8b-16k": {
               "tools": true
             }
           }
         }
       }
     }
     ```
   - If Ollama already in config, append/replace models only
   - Trigger config reload in OpenCode Desktop App

**Phase 2: Context Window Management**

**Research Needed**:

**Research Needed**:
- What are the downsides of setting larger context windows?
  - Increased VRAM usage (quantified: X GB per 1k tokens for model size Y)
  - Slower inference (quantify: Z% slower for 2x context)
  - Any other tradeoffs?
- What are the optimal contexts for different model sizes?
  - 7B models: 16k-32k recommended?
  - 13B models: 32k-64k recommended?
  - 34B models: 64k-128k recommended?
  - 70B models: 64k-128k+? (user mentioned might need more than 32k)

**Implementation**:
- Display VRAM usage estimates based on model size and context
- Show "Recommended" badge for optimal context per model
- Auto-detect available VRAM (if possible)
- Warn user before creating variant with too-large context

**Phase 3: Model Management (All in Same Dialog)**

**Required Features** (PHASE 3 - FUTURE):
1. **Pull new models** (integrated into ConnectProviderDialog)
   - Search Ollama library (API endpoint? or web scrape?)
   - Show popular models with download buttons
   - Progress bar during download
   - Auto-configure pulled models with optimal settings

2. **Delete models**
   - Remove from local Ollama storage
   - Remove from config file
   - Update UI immediately

3. **Edit model variants**
   - Change context window (with slider)
   - Duplicate model with different settings
   - Rename variants
   - Enable/disable tools per variant

**Research Needed**:

**Technical Requirements**

**Backend (Coordinator)**
- ✅ Ollama health check (already exists)
- ✅ Model discovery via `/api/tags` (already exists)
- ✅ Context window management via Ollama API calls (NEW - using estimation for now)
- ✅ Model variant creation via `/api/copy` or similar (PHASE 3 - not yet)
- ✅ Config file writing to `~/.config/opencode/opencode.json` (COMPLETED ✅)
- ✅ OpenCode Desktop App config reload trigger (file watcher - automatic)

**Frontend**
- ✅ Ollama-specific UI in ConnectProviderDialog (already exists)
- ✅ LocalAIButton with model list, toggle, select, pull dialog (COMPLETED)
- ⏳ Fix feedback loop: refresh chatStore providers after config write (CRITICAL - NEXT)
- ❌ Context window slider component (via ⋯ settings button - PHASE 2b)
- ❌ VRAM usage calculator/warning (PHASE 2b)
- ❌ Model variant management UI (PHASE 2b)

**Key Constraints**:
- Must be all in the same dialog (no separate Ollama panel per user)
- Must support auto-discovery (critical for UX)
- Must handle context window correctly (critical for tools to work)
- Must enable tools by default (critical for agentic actions)
- Must write to OpenCode's config file (or integrate with existing Cushion provider system)

**Testing Checklist**:
- ✅ Backend: Auto-discover models from running Ollama instance
- ✅ Backend: Estimate context windows for different model sizes
- ✅ Backend: Write config file to `~/.config/opencode/opencode.json`
- ✅ Backend: Enriches partial frontend models with discovery data before estimation
- ✅ Frontend: LocalAIButton displays discovered model list in popover menu
- ✅ Frontend: Toggle models on/off (writes to OpenCode config)
- ✅ Frontend: Pull model dialog with popular models quick-select
- ✅ Frontend: TypeScript compilation passes
- ⏳ Frontend: Fix feedback loop (chatStore providers not refreshing after config write)
- ⏳ Frontend: Context window slider (⋯ settings button placeholder exists)
- ⏳ Frontend: VRAM warnings
- ⏳ Frontend: Model variant management
- ⏳ End-to-end: Verify tools work with configured models
- ⏳ End-to-end: OpenCode Desktop App picks up new models after config write

**Open Questions**:
1. Should we integrate with OpenCode Desktop App's config system, or use Cushion's provider system exclusively?
2. What is the API endpoint for pulling models from Ollama library? (or do we need to use CLI?)
3. What are the exact downsides of larger context windows? (need user research)
4. How do we trigger OpenCode Desktop App to reload config after writing? (file watcher? IPC?)
5. Can we detect available VRAM to provide accurate warnings?

**References**:
- OpenCode's Ollama integration: `https://opencode.ai/docs/config/`
- Ollama API docs: `https://github.com/ollama/ollama/blob/main/docs/api.md`
- Real user issue: context defaults to 4k, breaks tools, requires manual `/set parameter num_ctx`