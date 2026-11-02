import type { AiProviderId, AiSettings } from '@/types/ai';

const STORAGE_KEY = 'p2d:ai-settings';
/** One-time migration marker for the slow Gemini 3.8 default. */
const GEMINI_36_MIGRATION_KEY = 'p2d:gemini-3.6-migration';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: '',
  temperature: 0.2,
  maxTokens: 1200,
  systemInstructions: '',
};

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  compatible: 'OpenAI-compatible',
};

export const PROVIDER_DEFAULT_MODELS: Record<AiProviderId, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.6-flash',
  compatible: 'llama-3.1-8b-instruct',
};

/** Retired Gemini models that may still be cached in users' saved settings. */
const RETIRED_GEMINI_MODELS = new Set(['gemini-2.0-flash', 'models/gemini-2.0-flash']);

function resolveStoredModel(provider: AiProviderId, raw: unknown): string {
  const model = typeof raw === 'string' ? raw.trim() : '';
  if (!model) return PROVIDER_DEFAULT_MODELS[provider];
  if (provider === 'gemini' && RETIRED_GEMINI_MODELS.has(model)) {
    return PROVIDER_DEFAULT_MODELS.gemini;
  }
  return model;
}

type StorageArea = {
  get: (keys: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function getArea(): StorageArea | null {
  const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
  const local = chromeApi?.storage?.local as unknown as StorageArea | undefined;
  if (local) return local;

  if (typeof localStorage !== 'undefined') {
    return {
      async get(keys) {
        const list = keys === null ? Object.keys(localStorage) : Array.isArray(keys) ? keys : [keys];
        const values: Record<string, unknown> = {};
        for (const key of list) {
          const raw = localStorage.getItem(key);
          if (raw !== null) values[key] = JSON.parse(raw) as unknown;
        }
        return values;
      },
      async set(items) {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((key) => localStorage.removeItem(key));
      },
    };
  }

  return null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitize(raw: unknown): AiSettings {
  const value = (raw ?? {}) as Partial<AiSettings>;
  const provider = (['openai', 'gemini', 'compatible'] as const).includes(value.provider as AiProviderId)
    ? (value.provider as AiProviderId)
    : DEFAULT_AI_SETTINGS.provider;

  return {
    enabled: Boolean(value.enabled),
    provider,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    model: resolveStoredModel(provider, value.model),
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '',
    temperature: clampNumber(value.temperature, 0, 2, DEFAULT_AI_SETTINGS.temperature),
    maxTokens: Math.round(clampNumber(value.maxTokens, 128, 32_000, DEFAULT_AI_SETTINGS.maxTokens)),
    systemInstructions: typeof value.systemInstructions === 'string' ? value.systemInstructions.slice(0, 4000) : '',
  };
}

export async function getAiSettings(): Promise<AiSettings> {
  const area = getArea();
  if (!area) return { ...DEFAULT_AI_SETTINGS };

  let stored: Record<string, unknown>;
  try {
    stored = await area.get([STORAGE_KEY, GEMINI_36_MIGRATION_KEY]);
  } catch (error) {
    console.warn('[Page2Data] could not read AI settings', error);
    return { ...DEFAULT_AI_SETTINGS };
  }

  let settings = sanitize(stored[STORAGE_KEY]);
  if (stored[GEMINI_36_MIGRATION_KEY]) return settings;

  // Gemini 3.8 Flash can hang indefinitely on free-tier keys. Move the old
  // default to the compatible model once; a later explicit save is preserved.
  if (
    settings.provider === 'gemini' &&
    (settings.model === 'gemini-3.8-flash' || settings.model === 'models/gemini-3.8-flash')
  ) {
    settings = { ...settings, model: PROVIDER_DEFAULT_MODELS.gemini };
  }

  try {
    await area.set({ [STORAGE_KEY]: settings, [GEMINI_36_MIGRATION_KEY]: true });
  } catch (error) {
    console.warn('[Page2Data] could not store AI settings migration', error);
  }
  return settings;
}

export async function saveAiSettings(settings: AiSettings): Promise<AiSettings> {
  const clean = sanitize(settings);
  const area = getArea();
  if (area) await area.set({ [STORAGE_KEY]: clean, [GEMINI_36_MIGRATION_KEY]: true });
  return clean;
}

export async function clearApiKey(): Promise<AiSettings> {
  const settings = await getAiSettings();
  return saveAiSettings({ ...settings, apiKey: '', enabled: false });
}

/** Safe display form: never expose a full key in logs or UI text. */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
