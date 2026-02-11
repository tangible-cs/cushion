/**
 * Provider OAuth Handlers
 *
 * OAuth implementations adapted from OpenCode plugins
 * Browser flow uses local server for callback (more reliable than headless)
 */

const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000; // 3 seconds

/**
 * OpenAI OAuth (browser flow)
 * Adapted from OpenCode's codex.ts plugin - "ChatGPT Pro/Plus (browser)" method
 */
export class OpenAIOAuth {
  private CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
  private ISSUER = "https://auth.openai.com";
  private OAUTH_PORT = 1455;
  private httpServer: any = null;

  /**
   * Generate PKCE codes
   */
  private async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const verifier = this.generateRandomString(43);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const challenge = this.base64UrlEncode(hash);
    return { verifier, challenge };
  }

  private generateRandomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private generateState(): string {
    return this.base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
  }

  /**
   * Start local HTTP server to receive OAuth callback
   */
  private async startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
    if (this.httpServer) {
      return { port: this.OAUTH_PORT, redirectUri: `http://localhost:${this.OAUTH_PORT}/auth/callback` };
    }

    const http = await import('http');

    return new Promise((resolve) => {
      this.httpServer = http.createServer((req: any, res: any) => {
        const url = new URL(req.url || '', `http://localhost:${this.OAUTH_PORT}`);

        // Handle favicon.ico and other browser requests gracefully
        if (url.pathname === "/favicon.ico") {
          res.writeHead(404);
          res.end();
          return;
        }

        if (url.pathname === "/auth/callback") {
          // Check if we've already processed a callback for this OAuth flow
          if (this.hasProcessedCallback) {
            res.writeHead(409, { 'Content-Type': 'text/plain' });
            res.end('OAuth callback already processed');
            return;
          }

          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");
          const errorDescription = url.searchParams.get("error_description");

          if (error) {
            const errorMsg = errorDescription || error;
            if (this.oauthReject) {
              this.oauthReject(new Error(errorMsg));
            }
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.errorHTML(errorMsg));
            this.cleanupServer();
            return;
          }

          if (!code) {
            const errorMsg = "Missing authorization code";
            if (this.oauthReject) {
              this.oauthReject(new Error(errorMsg));
            }
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.errorHTML(errorMsg));
            this.cleanupServer();
            return;
          }

          if (!this.pkce || state !== this.state) {
            const errorMsg = "Invalid state - potential CSRF attack";
            if (this.oauthReject) {
              this.oauthReject(new Error(errorMsg));
            }
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.errorHTML(errorMsg));
            this.cleanupServer();
            return;
          }

          // Mark as processed BEFORE responding (like OpenCode sets pendingOAuth = undefined at line 290)
          this.hasProcessedCallback = true;
          const currentPkce = this.pkce;
          const currentResolve = this.oauthResolve;
          const currentReject = this.oauthReject;
          this.pkce = null;
          this.oauthResolve = null;
          this.oauthReject = null;
          this.state = null;

          // Exchange tokens asynchronously (like OpenCode - don't stop server here)
          this.exchangeCodeForTokens(code, `http://localhost:${this.OAUTH_PORT}/auth/callback`, currentPkce!)
            .then((tokens) => {
              if (currentResolve) {
                currentResolve(tokens);
              }
            })
            .catch((err) => {
              if (currentReject) {
                currentReject(err);
              }
            });

          // Respond immediately with success (like OpenCode line 296-298)
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.successHTML());
          return;
        }

        if (url.pathname === "/cancel") {
          if (this.oauthReject) {
            this.oauthReject(new Error("Login cancelled"));
          }
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end("Login cancelled");
          this.cleanupServer();
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      this.httpServer.listen(this.OAUTH_PORT, () => {
        console.log(`[OpenAIOAuth] OAuth server started on port ${this.OAUTH_PORT}`);
        resolve({ port: this.OAUTH_PORT, redirectUri: `http://localhost:${this.OAUTH_PORT}/auth/callback` });
      });
    });
  }

  private cleanupServer() {
    if (this.oauthTimeout) {
      clearTimeout(this.oauthTimeout);
      this.oauthTimeout = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
      console.log('[OpenAIOAuth] OAuth server stopped');
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, redirectUri: string, pkce: { verifier: string; challenge: string }): Promise<any> {
    const response = await fetch(`${this.ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.CLIENT_ID,
        code_verifier: pkce.verifier,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Parse JWT claims to extract account ID
   */
  private parseJwtClaims(token: string): any {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    try {
      return JSON.parse(Buffer.from(parts[1], "base64url").toString());
    } catch {
      return undefined;
    }
  }

  private extractAccountIdFromClaims(claims: any): string | undefined {
    return (
      claims.chatgpt_account_id ||
      claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
      claims.organizations?.[0]?.id
    );
  }

  private extractAccountId(tokens: any): string | undefined {
    if (tokens.id_token) {
      const claims = this.parseJwtClaims(tokens.id_token);
      return claims && this.extractAccountIdFromClaims(claims);
    }
    if (tokens.access_token) {
      const claims = this.parseJwtClaims(tokens.access_token);
      return claims ? this.extractAccountIdFromClaims(claims) : undefined;
    }
    return undefined;
  }

  private successHTML(): string {
    return `<!doctype html>
<html>
  <head>
    <title>Cushion - OpenAI Authorization Successful</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #f1ecec;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to Cushion.</p>
    </div>
    <script>
      setTimeout(() => window.close(), 2000)
    </script>
  </body>
</html>`;
  }

  private errorHTML(error: string): string {
    return `<!doctype html>
<html>
  <head>
    <title>Cushion - OpenAI Authorization Failed</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #fc533a;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
      }
      .error {
        color: #ff917b;
        font-family: monospace;
        margin-top: 1rem;
        padding: 1rem;
        background: #3c140d;
        border-radius: 0.5rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>An error occurred during authorization.</p>
      <div class="error">${error}</div>
    </div>
  </body>
</html>`;
  }

  private pkce: { verifier: string; challenge: string } | null = null;
  private state: string | null = null;
  private oauthResolve: ((tokens: any) => void) | null = null;
  private oauthReject: ((error: Error) => void) | null = null;
  private hasProcessedCallback = false;
  private oauthTimeout: ReturnType<typeof setTimeout> | null = null;

  async authorize(inputs: Record<string, string> = {}): Promise<{
    url: string;
    instructions: string;
    method: 'auto' | 'code';
    callback: () => Promise<{
      success: boolean;
      type: 'api' | 'oauth';
      access?: string;
      refresh?: string;
      expires?: number;
      accountId?: string;
    }>;
  }> {
    // Reject any previous pending OAuth flow before starting a new one
    if (this.oauthReject) {
      this.oauthReject(new Error("OAuth flow superseded by new authorize() call"));
      this.oauthResolve = null;
      this.oauthReject = null;
    }
    if (this.oauthTimeout) {
      clearTimeout(this.oauthTimeout);
      this.oauthTimeout = null;
    }

    const { redirectUri } = await this.startOAuthServer();
    const pkce = await this.generatePKCE();
    const state = this.generateState();

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "openid profile email offline_access",
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      state,
      originator: "cushion",
    });

    const authUrl = `${this.ISSUER}/oauth/authorize?${params.toString()}`;

    // Store PKCE and state for callback
    this.pkce = pkce;
    this.state = state;
    this.hasProcessedCallback = false;

    // Wait for callback
    const callbackPromise = new Promise<any>((resolve, reject) => {
      this.oauthResolve = resolve;
      this.oauthReject = reject;

      // 5 minute timeout — always clean up server
      this.oauthTimeout = setTimeout(() => {
        if (this.oauthReject) {
          this.oauthReject(new Error("OAuth callback timeout - authorization took too long"));
        }
        this.oauthResolve = null;
        this.oauthReject = null;
        this.oauthTimeout = null;
        this.cleanupServer();
      }, 5 * 60 * 1000);
    });

    return {
      url: authUrl,
      instructions: "Complete authorization in your browser. This window will close automatically.",
      method: "auto",
      callback: async () => {
        const tokens = await callbackPromise;
        const accountId = this.extractAccountId(tokens);
        // Stop server after successful callback (like OpenCode line 481)
        this.cleanupServer();
        return {
          success: true,
          type: "oauth" as const,
          refresh: tokens.refresh_token,
          access: tokens.access_token,
          expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
          accountId,
        };
      },
    };
  }
}

/**
 * OAuth Handler Factory
 * Maps provider IDs to their OAuth implementations
 */
export class OAuthHandlerFactory {
  private handlers: Map<string, any> = new Map();

  constructor() {
    // Register built-in OAuth handlers (only OpenAI for now)
    this.handlers.set('openai', new OpenAIOAuth());
  }

  /**
   * Get OAuth handler for a provider
   */
  getHandler(providerID: string): any | undefined {
    return this.handlers.get(providerID);
  }

  /**
   * Check if a provider supports OAuth
   */
  hasOAuth(providerID: string): boolean {
    return this.handlers.has(providerID);
  }
}

let factoryInstance: OAuthHandlerFactory | null = null;

export function getOAuthHandlerFactory(): OAuthHandlerFactory {
  if (!factoryInstance) {
    factoryInstance = new OAuthHandlerFactory();
  }
  return factoryInstance;
}
