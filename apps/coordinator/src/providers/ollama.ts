/**
 * Ollama Provider Integration
 *
 * Local AI backend provider support - no API keys, runs on localhost:11434
 */

import type { Model } from '@cushion/types';

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
export const OLLAMA_PROVIDER_ID = 'ollama';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export interface OllamaVersionResponse {
  version: string;
}

/**
 * Check if Ollama server is running and accessible
 */
export async function checkOllamaHealth(baseUrl: string = OLLAMA_DEFAULT_URL): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get Ollama version
 */
export async function getOllamaVersion(baseUrl: string = OLLAMA_DEFAULT_URL): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/api/version`);
    const data = await response.json() as OllamaVersionResponse;
    return data.version;
  } catch {
    return null;
  }
}

/**
 * Check if a model is a vision model (supports images)
 */
function isVisionModel(modelName: string): boolean {
  const visionPrefixes = ['llava', 'bakllava', 'minicpm-v', 'moondream', 'cogvlm'];
  return visionPrefixes.some(prefix => modelName.toLowerCase().includes(prefix));
}

/**
 * Infer context window size based on model parameters
 */
function inferContextWindow(details: OllamaModel['details']): number {
  const size = details.parameter_size;
  const family = details.family.toLowerCase();
  
  // Common context windows by parameter size
  if (size.includes('7B') || size.includes('8B')) {
    if (family.includes('llama3')) return 8192;
    if (family.includes('mistral') || family.includes('mixtral')) return 32768;
    return 4096;
  }
  
  if (size.includes('13B') || size.includes('14B')) {
    if (family.includes('llama3')) return 8192;
    if (family.includes('mistral') || family.includes('mixtral')) return 32768;
    return 8192;
  }
  
  if (size.includes('34B') || size.includes('70B')) {
    if (family.includes('llama3')) return 8192;
    if (family.includes('mixtral')) return 32768;
    return 16384;
  }
  
  // Default to reasonable value
  return 4096;
}

/**
 * Infer max tokens based on model parameters
 */
function inferMaxTokens(details: OllamaModel['details']): number {
  const contextWindow = inferContextWindow(details);
  // Max tokens typically 75-90% of context window
  return Math.floor(contextWindow * 0.85);
}

/**
 * Get all installed Ollama models and convert to Cushion Model format
 */
export async function getOllamaModels(baseUrl: string = OLLAMA_DEFAULT_URL): Promise<Record<string, Model>> {
  const response = await fetch(`${baseUrl}/api/tags`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.status}`);
  }
  
  const data = await response.json() as OllamaTagsResponse;
  const models: Record<string, Model> = {};
  
  for (const ollamaModel of data.models) {
    const id = ollamaModel.name; // e.g., "llama3.2:latest"
    const baseName = id.split(':')[0]; // e.g., "llama3.2"
    
    models[id] = {
      id,
      providerID: OLLAMA_PROVIDER_ID,
      name: baseName,
      capabilities: {
        text: true,
        images: isVisionModel(baseName),
        audio: false,
      },
      cost: {
        input: 0,
        output: 0,
      },
      limit: {
        context: inferContextWindow(ollamaModel.details),
        maxTokens: inferMaxTokens(ollamaModel.details),
      },
    };
  }
  
  return models;
}

/**
 * Pull a model from Ollama library
 */
export async function pullOllamaModel(
  model: string,
  baseUrl: string = OLLAMA_DEFAULT_URL
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to pull model: ${response.status} ${response.statusText}`,
      };
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a model from Ollama
 */
export async function deleteOllamaModel(
  model: string,
  baseUrl: string = OLLAMA_DEFAULT_URL
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to delete model: ${response.status} ${response.statusText}`,
      };
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
