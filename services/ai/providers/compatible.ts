import type { AiSettings } from '@/types/ai';
import { AiError, type AiProviderAdapter } from '../provider';
import { requestChatCompletion } from './openai';

export const COMPATIBLE_DEFAULT_MODEL = 'llama-3.1-8b-instruct';

export const compatibleAdapter: AiProviderAdapter = {
  id: 'compatible',
  label: 'OpenAI-compatible',
  requiresBaseUrl: true,
  defaultBaseUrl: '',
  defaultModel: COMPATIBLE_DEFAULT_MODEL,

  complete({ settings, system, user, signal, json }) {
    if (!settings.baseUrl?.trim()) {
      throw new AiError('Add the base URL of your OpenAI-compatible endpoint in Settings.');
    }
    return requestChatCompletion({
      settings,
      system,
      user,
      signal,
      json,
      baseUrl: settings.baseUrl,
      supportsJsonMode: false,
    });
  },

  async listModels(settings: AiSettings, signal?: AbortSignal) {
    if (!settings.baseUrl?.trim()) {
      throw new AiError('Add the base URL first.');
    }
    const base = settings.baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = settings.apiKey
      ? { authorization: `Bearer ${settings.apiKey}` }
      : {};
    const response = await fetch(`${base}/models`, { headers, signal });
    if (!response.ok) {
      throw new AiError('Could not load models from this endpoint.', response.status);
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return (payload.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  },
};
