const log = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log('[ollama-discover]', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn('[ollama-discover]', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error('[ollama-discover]', msg, meta),
};

export interface OllamaModelInfo {
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

export interface DiscoveredModel {
  id: string;
  name: string;
  family: string;
  parameterSize: string;
  size: number;
}

export interface OllamaDiscoveryResult {
  running: boolean;
  models: DiscoveredModel[];
}

export interface DiscoveredModelSimple {
  id: string;
  name: string;
  family: string;
}

export async function discoverModels(baseUrl: string = 'http://localhost:11434'): Promise<OllamaDiscoveryResult> {
  const apiUrl = baseUrl.replace(/\/$/, '');

  try {
    const response = await fetch(`${apiUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log.warn('Failed to fetch models from Ollama', {
        status: response.status,
        url: `${apiUrl}/api/tags`,
      });
      return { running: false, models: [] };
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.models)) {
      log.warn('Invalid response from Ollama', { data });
      return { running: false, models: [] };
    }

    const models: OllamaModelInfo[] = data.models;

    const discovered: DiscoveredModel[] = models.map((model) => ({
      id: model.name,
      name: formatModelName(model.name),
      family: model.details.family || model.details.families?.[0] || 'unknown',
      parameterSize: model.details.parameter_size || 'unknown',
      size: model.size,
    }));

    log.info('Discovered models from Ollama', {
      count: discovered.length,
      baseUrl,
    });

    return { running: true, models: discovered };
  } catch (error) {
    log.error('Error discovering Ollama models', { error });
    return { running: false, models: [] };
  }
}

function formatModelName(name: string): string {
  return name
    .split(':')[0]
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function estimateContextWindow(model: DiscoveredModel): number {
  const { family, parameterSize } = model;

  const baseContextMap: Record<string, number> = {
    'llama': 8192,
    'llama2': 8192,
    'llama3': 8192,
    'mistral': 8192,
    'mixtral': 32768,
    'qwen': 32768,
    'qwen2': 32768,
    'qwen3': 32768,
    'gemma': 8192,
    'gemma2': 8192,
    'phi': 4096,
    'phi3': 8192,
    'deepseek': 16384,
    'command-r': 128000,
    'internlm': 8192,
  };

  const sizeMultiplier: Record<string, number> = {
    '7b': 1,
    '8b': 1.5,
    '13b': 2,
    '14b': 2,
    '32b': 4,
    '34b': 4,
    '70b': 8,
  };

  let baseContext = baseContextMap[family.toLowerCase()] || 8192;

  const paramSizeLower = parameterSize.toLowerCase();
  for (const [size, multiplier] of Object.entries(sizeMultiplier)) {
    if (paramSizeLower.includes(size)) {
      baseContext = baseContext * multiplier;
      break;
    }
  }

  return Math.min(Math.round(baseContext), 128000);
}
