'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { getCoordinatorClient } from '@/lib/coordinator-client';
import { useToast } from './Toast';

type AuthMethod = {
  type: 'api' | 'oauth';
  label: string;
};

type ConnectProviderDialogProps = {
  providerId: string;
  providerName: string;
  onClose: () => void;
  onBack?: () => void;
  onSuccess?: () => void;
};

export function ConnectProviderDialog({ providerId, providerName, onClose, onBack, onSuccess }: ConnectProviderDialogProps) {
  const { showToast } = useToast();
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [selectedMethodIndex, setSelectedMethodIndex] = useState<number | undefined>(undefined);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthState, setOAuthState] = useState<'pending' | 'complete' | 'error'>('pending');
  const [oauthUrl, setOAuthUrl] = useState<string | null>(null);
  const [oauthCode, setOAuthCode] = useState('');
  const [oauthMethod, setOAuthMethod] = useState<'code' | 'auto' | null>(null);
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  
  // Ollama-specific state
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'running' | 'not-running'>('unknown');
  const isOllama = providerId === 'ollama';

  useEffect(() => {
    async function loadAuthMethods() {
      try {
        const client = getCoordinatorClient();
        const methods = await client.listProviderAuthMethods();
        const providerMethods = methods[providerId] || [{ type: 'api', label: 'API Key' }];
        setAuthMethods(providerMethods);

        if (providerMethods.length === 1) {
          setSelectedMethodIndex(0);
        }
      } catch (error) {
        console.error('[ConnectProviderDialog] Failed to load auth methods:', error);
      }
    }

    if (!isOllama) {
      loadAuthMethods();
    }
  }, [providerId, isOllama]);

  const selectedMethod = selectedMethodIndex !== undefined ? authMethods[selectedMethodIndex] : null;

  // Check Ollama health
  const checkOllamaHealth = async (url: string) => {
    setCheckingHealth(true);
    setHealthStatus('unknown');
    setError('');

    try {
      const client = getCoordinatorClient();
      
      // Try to list models as a health check
      const result = await client.listOllamaModels();
      
      if (result.running) {
        setHealthStatus('running');
      } else {
        setHealthStatus('not-running');
        setError('Ollama server is not responding. Make sure it is running with: ollama serve');
      }
    } catch (err) {
      setHealthStatus('not-running');
      setError('Cannot connect to Ollama. Make sure it is running with: ollama serve');
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (isOllama) {
      checkOllamaHealth(ollamaBaseUrl);
    }
  }, [isOllama, ollamaBaseUrl]);

  const handleOllamaConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const client = getCoordinatorClient();
      
      // For Ollama, the "API key" is actually the base URL
      await client.setProviderAuth({ providerID: providerId, apiKey: ollamaBaseUrl });

      showToast({
        variant: 'success',
        title: `Connected to ${providerName}`,
        description: 'Ollama has been connected successfully',
        duration: 4000,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Ollama';
      setError(message);
      showToast({
        variant: 'error',
        title: 'Connection failed',
        description: message,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMethodSelect = async (index: number) => {
    setSelectedMethodIndex(index);
    const method = authMethods[index];

    if (method.type === 'oauth') {
      setLoading(true);
      setError('');
      setOAuthState('pending');
      setOAuthMethod(null);
      setConfirmationCode('');

      try {
        const client = getCoordinatorClient();
        const result = await client.authorizeOAuth({ providerID: providerId, method: index });
        setOAuthUrl(result.url);
        setOAuthMethod(result.method === 'code' ? 'code' : 'auto');

        if (result.instructions && result.method === 'auto') {
          if (result.instructions.includes(':')) {
            const code = result.instructions.split(':')[1]?.trim();
            setConfirmationCode(code || result.instructions);
          } else {
            setConfirmationCode(result.instructions);
          }
        }

        if (result.method === 'code') {
          setTimeout(() => {
            window.open(result.url, '_blank');
            setLoading(false);
          }, 500);
        } else if (result.method === 'auto') {
          setTimeout(() => {
            window.open(result.url, '_blank');

            setTimeout(async () => {
              try {
                await client.oauthCallback({ providerID: providerId, method: index });

                setOAuthState('complete');
                showToast({
                  variant: 'success',
                  title: `Connected to ${providerName}`,
                  description: `${providerName} provider has been connected successfully`,
                  duration: 4000,
                });
                onSuccess?.();
                onClose();
              } catch (err) {
                const message = err instanceof Error ? err.message : 'OAuth callback failed';
                setError(message);
                setOAuthState('error');
                showToast({
                  variant: 'error',
                  title: 'OAuth failed',
                  description: message,
                  duration: 5000,
                });
              } finally {
                setLoading(false);
              }
            }, 1000);
          }, 500);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start OAuth flow';
        setError(message);
        setOAuthState('error');
        setLoading(false);
      }
    }
  };

  const handleOAuthCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMethodIndex) return;

    setLoading(true);
    setError('');

    try {
      const client = getCoordinatorClient();
      await client.oauthCallback({ providerID: providerId, method: selectedMethodIndex, code: oauthCode });

      setOAuthState('complete');
      showToast({
        variant: 'success',
        title: `Connected to ${providerName}`,
        description: `${providerName} provider has been connected successfully`,
        duration: 4000,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth callback failed';
      setError(message);
      setOAuthState('error');
      showToast({
        variant: 'error',
        title: 'OAuth failed',
        description: message,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const client = getCoordinatorClient();

      // Set the API key (coordinator validates it with provider API)
      await client.setProviderAuth({ providerID: providerId, apiKey });

      showToast({
        variant: 'success',
        title: `Connected to ${providerName}`,
        description: `${providerName} provider has been connected successfully`,
        duration: 4000,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect provider';
      setError(message);
      showToast({
        variant: 'error',
        title: 'Connection failed',
        description: message,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (selectedMethodIndex !== undefined) {
      setSelectedMethodIndex(undefined);
      setOAuthState('pending');
      setError('');
    } else if (onBack) {
      onBack();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)]">
      <div className="bg-background rounded-lg shadow-[var(--shadow-lg)] border border-border max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {onBack && !isOllama && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
                title="Go back"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold">Connect {providerName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4">
          {isOllama ? (
            <form onSubmit={handleOllamaConnect}>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ollama runs locally on your machine. No API key required - just need to connect to the running server.
                  </p>
                  <label htmlFor="ollamaUrl" className="block text-sm font-medium mb-2">
                    Ollama Server URL
                  </label>
                  <input
                    id="ollamaUrl"
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] font-mono"
                    disabled={loading}
                  />
                  {error && (
                    <p className="text-[var(--accent-red)] text-xs mt-2">{error}</p>
                  )}
                </div>

                {/* Health status indicator */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    {healthStatus === 'running' ? (
                      <CheckCircle className="size-5 text-[var(--accent-green)]" />
                    ) : healthStatus === 'not-running' ? (
                      <X className="size-5 text-[var(--accent-red)]" />
                    ) : (
                      <Loader2 className="size-5 text-muted-foreground" />
                    )}
                    <span className="text-sm">
                      {healthStatus === 'running' ? 'Server is running' : 
                       healthStatus === 'not-running' ? 'Server not running' : 
                       'Checking status...'}
                    </span>
                  </div>
                  {checkingHealth && (
                    <Loader2 className="size-4 text-muted-foreground animate-spin" />
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Make sure Ollama is installed and running. Start it with: <code className="bg-muted px-1 py-0.5 rounded">ollama serve</code>
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  disabled={loading || healthStatus !== 'running'}
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  Connect
                </button>
              </div>
            </form>
          ) : selectedMethodIndex === undefined ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Select an authentication method for {providerName}
              </p>
              <div className="space-y-2">
                {authMethods.map((method, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleMethodSelect(index)}
                    className="w-full px-4 py-3 text-left text-sm border border-border rounded-md hover:bg-[var(--overlay-10)] transition-colors flex items-center gap-3"
                  >
                    <div className="w-4 h-2 rounded-sm bg-muted flex items-center justify-center">
                      <div className="w-2.5 h-0.5 ml-0 bg-muted-foreground hidden" />
                    </div>
                    <span>{method.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : selectedMethod?.type === 'api' ? (
            <form onSubmit={handleApiKeySubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium mb-2">
                    API Key
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                    autoFocus
                    disabled={loading}
                  />
                  {error && (
                    <p className="text-[var(--accent-red)] text-xs mt-2">{error}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Your API key will be stored locally in <code className="bg-muted px-1 py-0.5 rounded">~/.cushion/config.json</code>
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={goBack}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  disabled={!apiKey || loading}
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  Connect
                </button>
              </div>
            </form>
          ) : selectedMethod?.type === 'oauth' ? (
            <div>
              {oauthState === 'pending' && (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Starting OAuth flow...</span>
                </div>
              )}
                {oauthState === 'error' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-[var(--accent-red)]">
                      <X className="size-4" />
                      <span>OAuth flow failed</span>
                    </div>
                  {error && <p className="text-sm text-muted-foreground">{error}</p>}
                  <button
                    type="button"
                    onClick={goBack}
                    className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
                  >
                    Back
                  </button>
                </div>
              )}
              {oauthState !== 'error' && oauthMethod === 'code' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Visit <span className="text-[var(--accent-primary)] underline cursor-pointer" onClick={() => window.open(oauthUrl || '', '_blank')}>authorization page</span> to get your code
                  </p>
                  <form onSubmit={handleOAuthCodeSubmit}>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="oauthCode" className="block text-sm font-medium mb-2">
                          Code
                        </label>
                        <input
                          id="oauthCode"
                          type="text"
                          value={oauthCode}
                          onChange={(e) => setOAuthCode(e.target.value)}
                          placeholder="Enter code from authorization page"
                          className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                          autoFocus
                          disabled={loading}
                        />
                        {error && (
                          <p className="text-[var(--accent-red)] text-xs mt-2">{error}</p>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={goBack}
                          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          disabled={loading}
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          disabled={!oauthCode || loading}
                        >
                          {loading && <Loader2 className="size-4 animate-spin" />}
                          Connect
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
              {oauthState !== 'error' && oauthMethod === 'auto' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Visit <span className="text-[var(--accent-primary)] underline cursor-pointer" onClick={() => window.open(oauthUrl || '', '_blank')}>authorization page</span> to complete authorization
                  </p>
                  {confirmationCode && (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Confirmation Code
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={confirmationCode}
                          readOnly
                          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-muted font-mono pr-10 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(confirmationCode);
                            showToast({
                              variant: 'success',
                              title: 'Copied',
                              description: 'Confirmation code copied to clipboard',
                              duration: 2000,
                            });
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
                          title="Copy code"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Waiting for authorization...</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
