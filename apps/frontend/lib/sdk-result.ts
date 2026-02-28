// ---------------------------------------------------------------------------
// SDK Result wrapper — consolidates error handling for OpenCode SDK calls
// ---------------------------------------------------------------------------

export type SdkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SdkError };

export type SdkError = {
  message: string;
  code?: string;
  providerID?: string;
  isAuthError: boolean;
};

/**
 * Wraps an async SDK call, catching any thrown error and returning a
 * discriminated union instead. Callers can branch on `result.ok` without
 * try/catch boilerplate.
 */
export async function wrapSdk<T>(
  fn: () => Promise<T>,
): Promise<SdkResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapSdkError(error) };
  }
}

/**
 * Converts an unknown thrown value into a structured `SdkError`.
 *
 * Consolidates the logic previously split across `getSessionErrorMessage`
 * and `getProviderAuthError` in chat-helpers.ts.
 *
 * Handles the same shapes:
 * - `ProviderAuthError` (SDK type with `name`, `data.providerID`, `data.message`)
 * - `Error` instances
 * - Plain objects with `message` or `type` string fields
 * - Raw strings
 * - Anything else → "Unknown error"
 */
export function mapSdkError(error: unknown): SdkError {
  // ProviderAuthError from the OpenCode SDK
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: string }).name === 'ProviderAuthError'
  ) {
    const data = (error as { data?: { providerID?: string; message?: string } }).data;
    return {
      message: data?.message ?? 'Provider authentication required',
      providerID: data?.providerID,
      isAuthError: true,
    };
  }

  // Standard Error
  if (error instanceof Error) {
    return { message: error.message, isAuthError: false };
  }

  // Raw string
  if (typeof error === 'string') {
    return { message: error, isAuthError: false };
  }

  // Object with a `message` field
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return { message, isAuthError: false };
    }
  }

  // Object with a `type` field (some SDK errors use this)
  if (error && typeof error === 'object' && 'type' in error) {
    const typeValue = (error as { type?: unknown }).type;
    if (typeof typeValue === 'string') {
      return { message: typeValue, isAuthError: false };
    }
  }

  return { message: 'Unknown error', isAuthError: false };
}
