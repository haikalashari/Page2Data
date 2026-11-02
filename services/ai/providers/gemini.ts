import type { AiSettings } from '@/types/ai';
import { AiError, postJson, type AiProviderAdapter } from '../provider';

export const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

function geminiBaseUrl(settings: AiSettings): string {
  return (settings.baseUrl || GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Accepts both "gemini-3.6-flash" and "models/gemini-3.6-flash". */
export function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//, '') || GEMINI_DEFAULT_MODEL;
}

/**
 * Gemini 3.6+ ignores temperature and will reject it in a future release.
 * Keep sending it only for older models that still use sampling controls.
 */
export function geminiSupportsTemperature(model: string): boolean {
  const match = /^gemini-(\d+)(?:\.(\d+))?/i.exec(normalizeGeminiModel(model));
  if (!match) return true;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major < 3 || (major === 3 && minor < 6);
}

/** Low thinking keeps structured extraction fast on models that support it. */
export function geminiThinkingConfig(
  model: string,
): { thinkingConfig: { thinkingLevel: 'low' } } | undefined {
  const name = normalizeGeminiModel(model);
  const supportsLow = [
    /^gemini-4(?:[.-]|$)/i,
    /^gemini-3\.8-flash(?:-\d+)?$/i,
    /^gemini-3\.6-flash(?:-\d+)?$/i,
    /^gemini-3\.5-flash-lite(?:-preview)?(?:-\d+)?$/i,
    /^gemini-3\.1-flash-lite(?:-preview)?(?:-\d+)?$/i,
    /^gemini-3-flash(?:-preview)?(?:-\d+)?$/i,
    /^gemini-robotics-er-2(?:[.-]|$)/i,
  ].some((pattern) => pattern.test(name));
  return supportsLow ? { thinkingConfig: { thinkingLevel: 'low' } } : undefined;
}

export function geminiGenerateContentUrl(settings: AiSettings): string {
  const model = normalizeGeminiModel(settings.model);
  return `${geminiBaseUrl(settings)}/models/${encodeURIComponent(model)}:generateContent`;
}

export const geminiAdapter: AiProviderAdapter = {
  id: 'gemini',
  label: 'Google Gemini',
  requiresBaseUrl: false,
  defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
  defaultModel: GEMINI_DEFAULT_MODEL,

  async complete({ settings, system, user, signal, json }) {
    const model = normalizeGeminiModel(settings.model);
    const url = geminiGenerateContentUrl(settings);

    const response = await postJson<GeminiResponse>({
      url,
      headers: { 'x-goog-api-key': settings.apiKey.trim() },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          ...(geminiSupportsTemperature(model) ? { temperature: settings.temperature } : {}),
          ...(geminiThinkingConfig(model) ?? {}),
          maxOutputTokens: settings.maxTokens,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      signal,
    });

    if (response.error?.message) throw new AiError(response.error.message);
    if (response.promptFeedback?.blockReason) {
      throw new AiError(`The provider blocked this request (${response.promptFeedback.blockReason}).`);
    }

    const text = (response.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      const reason = response.candidates?.[0]?.finishReason;
      throw new AiError(
        reason && reason !== 'STOP'
          ? `The AI provider stopped before answering (${reason}).`
          : 'The AI provider returned an empty response. Try a different model.',
      );
    }
    return text;
  },

  async listModels(settings, signal) {
    const base = geminiBaseUrl(settings);
    const response = await fetch(`${base}/models?pageSize=100`, {
      headers: { 'x-goog-api-key': settings.apiKey.trim() },
      signal,
    });
    if (!response.ok) {
      throw new AiError('Could not load Gemini models. Check your API key.', response.status);
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    return (payload.models ?? [])
      .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
      .map((model) => (model.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
  },
};
