import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import type { McpLocalConfig, McpRemoteConfig, McpOAuthConfig } from '@opencode-ai/sdk/v2/client';
import { useChatStore } from '@/stores/chatStore';
import { getDirectoryClient } from '@/stores/chat-store-utils';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { VisibilityToggle } from './CustomizeDialog';
import { useToast } from './Toast';

type McpStatus = {
  status: 'connected' | 'disabled' | 'failed' | 'needs_auth' | 'needs_client_registration';
  error?: string;
};

type McpEntry = {
  name: string;
  status: McpStatus;
};

export function McpsPanel() {
  const { showToast } = useToast();
  const [mcps, setMcps] = useState<McpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Auth flow state
  const [authingMcp, setAuthingMcp] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // AbortController to cancel auth request on unmount
  const authAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { authAbortRef.current?.abort(); }, []);

  const getClient = () => {
    const { directory, baseUrl } = useChatStore.getState();
    if (!directory) return null;
    return { client: getDirectoryClient(directory, baseUrl), directory };
  };

  const fetchMcps = async () => {
    const ctx = getClient();
    if (!ctx) {
      setMcps([]);
      setLoading(false);
      return;
    }
    try {
      const result = await ctx.client.mcp.status({ directory: ctx.directory });
      const raw = result?.data;
      const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, McpStatus>;
      setMcps(Object.entries(data).map(([name, status]) => ({ name, status })));
    } catch (err) {
      console.warn('[McpsPanel] Failed to fetch MCP status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMcps();
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setLoading(true);
    await fetchMcps();
    setRefreshing(false);
  };

  const handleToggle = async (name: string, currentlyConnected: boolean) => {
    const ctx = getClient();
    if (!ctx) return;
    try {
      // Write enabled state to config first so it persists across server restarts,
      // then connect/disconnect to apply immediately.
      if (currentlyConnected) {
        await ctx.client.global.config.update({ config: { mcp: { [name]: { enabled: false } } } });
        await ctx.client.mcp.disconnect({ name, directory: ctx.directory });
      } else {
        await ctx.client.global.config.update({ config: { mcp: { [name]: { enabled: true } } } });
        await ctx.client.mcp.connect({ name, directory: ctx.directory });
      }
    } catch (err) {
      console.warn('[McpsPanel] Toggle failed:', err);
      const msg = err instanceof Error ? err.message : 'Toggle failed';
      showToast({ variant: 'error', title: 'MCP toggle failed', description: msg, duration: 4000 });
    } finally {
      await fetchMcps();
    }
  };

  const handleAuth = async (name: string) => {
    const ctx = getClient();
    if (!ctx) return;
    setAuthingMcp(name);
    setAuthLoading(true);

    authAbortRef.current?.abort();
    const abort = new AbortController();
    authAbortRef.current = abort;

    try {
      if (window.electronAPI?.openOAuthWindow) {
        // Electron: 2-step flow — start() gets the URL, BrowserWindow intercepts the redirect
        const startResult = await ctx.client.mcp.auth.start({ name, directory: ctx.directory });
        if (abort.signal.aborted) return;

        const authUrl = startResult?.data?.authorizationUrl;
        if (!authUrl) {
          showToast({ variant: 'success', title: 'Already authenticated', description: `${name} is connected`, duration: 4000 });
          await fetchMcps();
          return;
        }

        const code = await window.electronAPI.openOAuthWindow(authUrl);
        if (abort.signal.aborted) return;

        if (!code) {
          showToast({ variant: 'error', title: 'Auth cancelled', description: 'OAuth window was closed', duration: 4000 });
          return;
        }

        await ctx.client.mcp.auth.callback({ name, directory: ctx.directory, code });
        if (abort.signal.aborted) return;
      } else {
        // Browser: use the blocking authenticate() call (opens browser server-side)
        await ctx.client.mcp.auth.authenticate({ name, directory: ctx.directory });
        if (abort.signal.aborted) return;
      }

      showToast({ variant: 'success', title: 'Authenticated', description: `${name} is now connected`, duration: 4000 });
      await fetchMcps();
    } catch (err) {
      if (abort.signal.aborted) return;
      console.error('[McpsPanel] MCP auth failed:', err);
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      showToast({ variant: 'error', title: 'Auth failed', description: msg, duration: 4000 });
    } finally {
      setAuthingMcp(null);
      setAuthLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mcps;
    return mcps.filter((m) => m.name.toLowerCase().includes(q));
  }, [mcps, searchQuery]);

  const connectedCount = mcps.filter((m) => m.status.status === 'connected').length;

  return (
    <>
      {/* Search + actions */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface px-2">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search MCPs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {searchQuery.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="size-5 flex items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <Icon name="close" size="small" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className={cn(
            'size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground',
            showAddForm && 'bg-[var(--overlay-10)] text-foreground',
          )}
          title="Add MCP"
          aria-label="Add MCP"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground disabled:opacity-50"
          title="Refresh MCPs"
          aria-label="Refresh MCPs"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
        {showAddForm && (
          <AddMcpForm
            onAdded={() => {
              setShowAddForm(false);
              handleRefresh();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading MCPs...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No MCP results' : 'No MCPs configured'}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((mcp) => {
              const isConnected = mcp.status.status === 'connected';
              const needsAuth = mcp.status.status === 'needs_auth' || mcp.status.status === 'needs_client_registration';
              const isAuthing = authingMcp === mcp.name;
              const label = `${isConnected ? 'Disconnect' : 'Connect'} ${mcp.name}`;
              const { dot, text } = statusDisplay(mcp.status);

              return (
                <div key={mcp.name} className="rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--overlay-10)]">
                  <div className="flex w-full items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] text-foreground">{mcp.name}</span>
                        <span className={cn('inline-block size-2 shrink-0 rounded-full', dot)} />
                        <span className="shrink-0 text-[12px] text-muted-foreground">{text}</span>
                      </div>
                      {mcp.status.status === 'failed' && mcp.status.error && (
                        <span className="block truncate text-[12px] text-[var(--error)]">
                          {mcp.status.error}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 justify-end">
                      {needsAuth ? (
                        <button
                          type="button"
                          onClick={() => handleAuth(mcp.name)}
                          disabled={authLoading}
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--overlay-10)] disabled:opacity-50"
                        >
                          {isAuthing && <Loader2 className="size-3 animate-spin" />}
                          {isAuthing ? 'Waiting...' : 'Authenticate'}
                        </button>
                      ) : (
                        <VisibilityToggle
                          checked={isConnected}
                          label={label}
                          onChange={() => handleToggle(mcp.name, isConnected)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && mcps.length > 0 && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {connectedCount} of {mcps.length} MCPs connected
        </div>
      )}
    </>
  );
}

function statusDisplay(status: McpStatus): { dot: string; text: string } {
  switch (status.status) {
    case 'connected':
      return { dot: 'bg-green-500', text: 'Connected' };
    case 'disabled':
      return { dot: 'bg-gray-400', text: 'Disabled' };
    case 'failed':
      return { dot: 'bg-red-500', text: 'Failed' };
    case 'needs_auth':
      return { dot: 'bg-yellow-500', text: 'Needs auth' };
    case 'needs_client_registration':
      return { dot: 'bg-yellow-500', text: 'Needs registration' };
    default:
      return { dot: 'bg-gray-400', text: 'Unknown' };
  }
}

// ── Add MCP inline form ──────────────────────────────────────────

type AddMcpFormProps = {
  onAdded: () => void;
  onCancel: () => void;
};

type AuthMode = 'auto-oauth' | 'oauth' | 'headers' | 'none';

const inputClass =
  'h-8 w-full rounded-md border border-border bg-transparent px-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none';

function AddMcpForm({ onAdded, onCancel }: AddMcpFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'local' | 'remote'>('local');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('auto-oauth');
  const [headers, setHeaders] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scope, setScope] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseKeyValue = (raw: string): Record<string, string> | null => {
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) return null;
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const { directory, baseUrl } = useChatStore.getState();
    if (!directory) return;

    setSubmitting(true);
    setError(null);

    try {
      const mcpName = name.trim();
      let mcpConfig: McpLocalConfig | McpRemoteConfig;

      if (type === 'local') {
        if (!command.trim()) {
          setError('Command is required');
          setSubmitting(false);
          return;
        }
        const localConfig: McpLocalConfig = { type: 'local', command: command.trim().split(/\s+/) };
        if (envVars.trim()) {
          const parsed = parseKeyValue(envVars);
          if (!parsed) {
            setError('Invalid env vars — use KEY=VALUE format, one per line');
            setSubmitting(false);
            return;
          }
          localConfig.environment = parsed;
        }
        mcpConfig = localConfig;
      } else {
        if (!url.trim()) {
          setError('URL is required');
          setSubmitting(false);
          return;
        }
        const remoteConfig: McpRemoteConfig = { type: 'remote', url: url.trim() };

        if (authMode === 'headers') {
          remoteConfig.oauth = false;
          if (headers.trim()) {
            const parsed = parseKeyValue(headers);
            if (!parsed) {
              setError('Invalid headers — use Key=Value format, one per line');
              setSubmitting(false);
              return;
            }
            remoteConfig.headers = parsed;
          }
        } else if (authMode === 'oauth') {
          const oauthObj: McpOAuthConfig = {};
          if (clientId.trim()) oauthObj.clientId = clientId.trim();
          if (clientSecret.trim()) oauthObj.clientSecret = clientSecret.trim();
          if (scope.trim()) oauthObj.scope = scope.trim();
          remoteConfig.oauth = oauthObj;
        } else if (authMode === 'none') {
          remoteConfig.oauth = false;
        }
        // auto-oauth: leave oauth unset (OpenCode default)
        mcpConfig = remoteConfig;
      }

      const client = getDirectoryClient(directory, baseUrl);
      await client.global.config.update({ config: { mcp: { [mcpName]: mcpConfig } } });

      try {
        await client.mcp.connect({ name: mcpName, directory });
      } catch {
        // Connection may fail initially — MCP will still be in config
      }

      onAdded();
    } catch (err: unknown) {
      console.error('[McpsPanel] Failed to add MCP:', err);
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message)
        : 'Failed to add MCP';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pillClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1 text-[12px] font-medium transition-colors',
      active ? 'bg-[var(--overlay-10)] text-foreground' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <form onSubmit={handleSubmit} className="mb-2 rounded-lg border border-border bg-surface p-3">
      <div className="space-y-2.5">
        {/* Name */}
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          autoFocus
        />

        {/* Type toggle */}
        <div className="flex gap-1">
          <button type="button" onClick={() => setType('local')} className={pillClass(type === 'local')}>
            Local
          </button>
          <button type="button" onClick={() => setType('remote')} className={pillClass(type === 'remote')}>
            Remote
          </button>
        </div>

        {type === 'local' ? (
          <>
            <input
              type="text"
              placeholder="npx -y @modelcontextprotocol/server-filesystem"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className={inputClass}
            />
            <textarea
              placeholder={'Environment variables (one per line)\nKEY=value\nANOTHER={env:SECRET}'}
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none resize-none"
            />
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="https://mcp.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
            />

            {/* Auth mode */}
            <div>
              <span className="mb-1 block text-[12px] text-muted-foreground">Auth</span>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setAuthMode('auto-oauth')} className={pillClass(authMode === 'auto-oauth')}>
                  Auto OAuth
                </button>
                <button type="button" onClick={() => setAuthMode('oauth')} className={pillClass(authMode === 'oauth')}>
                  OAuth
                </button>
                <button type="button" onClick={() => setAuthMode('headers')} className={pillClass(authMode === 'headers')}>
                  Headers
                </button>
                <button type="button" onClick={() => setAuthMode('none')} className={pillClass(authMode === 'none')}>
                  None
                </button>
              </div>
            </div>

            {authMode === 'headers' && (
              <textarea
                placeholder={'Headers (one per line)\nAuthorization=Bearer {env:MY_API_KEY}\nX-Custom=value'}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none resize-none"
              />
            )}

            {authMode === 'oauth' && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Client ID (or {env:VAR})"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Client Secret (or {env:VAR})"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Scope (e.g. tools:read tools:execute)"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            {authMode === 'auto-oauth' && (
              <p className="text-[11px] text-muted-foreground">
                OpenCode will auto-detect OAuth on 401 — no extra config needed.
              </p>
            )}
          </>
        )}

        {error && <p className="text-[12px] text-[var(--error)]">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md bg-[var(--accent-primary)] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
