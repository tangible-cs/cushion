/**
 * OAuth Handler
 *
 * Manages OAuth2 authorization flow for providers using provider-specific implementations
 * Adapted from OpenCode's plugin OAuth handlers
 */

import { getOAuthHandlerFactory } from './provider-oauth.js';

interface PendingOAuthCallback {
  providerID: string;
  method: number;
  callback: () => Promise<{
    success: boolean;
    type: 'api' | 'oauth';
    access?: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
  }>;
  createdAt: number;
}

class OAuthHandlerInstance {
  private pendingCallbacks = new Map<string, PendingOAuthCallback>();
  private callbackExpiry = 5 * 60 * 1000; // 5 minutes
  private factory = getOAuthHandlerFactory();

  /**
   * Start OAuth authorization flow
   */
  async authorize(providerID: string, method: number, inputs: Record<string, string> = {}): Promise<{
    url: string;
    method: 'auto' | 'code';
    instructions: string;
    callback: () => Promise<{
      success: boolean;
      type: 'api' | 'oauth';
      access?: string;
      refresh?: string;
      expires?: number;
      accountId?: string;
    }>;
  }> {
    const handler = this.factory.getHandler(providerID);

    if (!handler) {
      throw new Error(`OAuth not supported for provider: ${providerID}`);
    }

    const result = await handler.authorize(inputs);

    // Store callback for later
    const callbackKey = `${providerID}:${method}`;
    this.pendingCallbacks.set(callbackKey, {
      providerID,
      method,
      callback: result.callback,
      createdAt: Date.now(),
    });

    // Return URL and instructions (without callback)
    return {
      url: result.url,
      method: result.method,
      instructions: result.instructions,
      callback: result.callback,
    };
  }

  /**
   * Complete OAuth flow (trigger stored callback)
   */
  async callback(providerID: string, method: number, code?: string): Promise<{
    success: boolean;
    type: 'api' | 'oauth';
    key?: string;
    access?: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
  }> {
    const callbackKey = `${providerID}:${method}`;
    const pendingCallback = this.pendingCallbacks.get(callbackKey);

    if (!pendingCallback) {
      throw new Error(`No pending OAuth authorization for provider: ${providerID}`);
    }

    // Check if callback has expired
    if (Date.now() - pendingCallback.createdAt > this.callbackExpiry) {
      this.pendingCallbacks.delete(callbackKey);
      throw new Error('OAuth authorization has expired');
    }

    try {
      // Trigger provider-specific callback
      const result = await pendingCallback.callback();

      // Clean up pending callback
      this.pendingCallbacks.delete(callbackKey);

      if (!result.success) {
        throw new Error('OAuth callback failed');
      }

      return result;
    } catch (error) {
      // Clean up pending callback on error
      this.pendingCallbacks.delete(callbackKey);
      throw error;
    }
  }

  /**
   * Clean up expired pending callbacks
   */
  cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [key, pendingCallback] of this.pendingCallbacks.entries()) {
      if (now - pendingCallback.createdAt > this.callbackExpiry) {
        this.pendingCallbacks.delete(key);
      }
    }
  }
}

let oauthInstance: OAuthHandlerInstance | null = null;

export function getOAuthHandler(): OAuthHandlerInstance {
  if (!oauthInstance) {
    oauthInstance = new OAuthHandlerInstance();
  }
  return oauthInstance;
}
