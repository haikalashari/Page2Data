import type {
  AiAnalysis,
  AiCleaningPlan,
  AiConnectionResult,
  AiInstructionPlan,
  AiProviderId,
  AiResult,
  AiSettings,
} from '@/types/ai';
import type { Dataset } from '@/types/dataset';
import { AiError, type AiProviderAdapter } from './provider';
import { compatibleAdapter } from './providers/compatible';
import { geminiAdapter } from './providers/gemini';
import { openaiAdapter } from './providers/openai';
import { buildAnalysisPrompt, buildCleaningPrompt, buildInstructionPrompt } from './prompt-builder';
import {
  extractJson,
  validateAnalysis,
  validateCleaningPlan,
  validateInstructionPlan,
} from './response-validator';

const ADAPTERS: Record<AiProviderId, AiProviderAdapter> = {
  openai: openaiAdapter,
  gemini: geminiAdapter,
  compatible: compatibleAdapter,
};

export function getAdapter(provider: AiProviderId): AiProviderAdapter {
  return ADAPTERS[provider] ?? openaiAdapter;
}

/** Fills in provider defaults so requests are always complete. */
export function resolveSettings(settings: AiSettings): AiSettings {
  const adapter = getAdapter(settings.provider);
  const baseUrl = settings.baseUrl.trim() || (adapter.requiresBaseUrl ? '' : adapter.defaultBaseUrl);
  return {
    ...settings,
    model: settings.model.trim() || adapter.defaultModel,
    baseUrl,
  };
}

/** Returns a user-facing problem description, or null when settings are usable. */
export function validateAiSettings(
  settings: AiSettings,
  options: { requireKey?: boolean } = {},
): string | null {
  const resolved = resolveSettings(settings);
  if (options.requireKey !== false && !resolved.apiKey.trim()) {
    return 'Add your API key in Settings.';
  }
  if (!resolved.model) return 'Choose a model in Settings.';
  if (getAdapter(resolved.provider).requiresBaseUrl && !resolved.baseUrl) {
    return 'Add the base URL for this provider.';
  }
  return null;
}

export function isAiReady(settings: AiSettings | null): boolean {
  if (!settings || !settings.enabled) return false;
  return validateAiSettings(settings) === null;
}

async function runPrompt<T>(
  settings: AiSettings,
  dataset: Dataset,
  build: (settings: AiSettings, dataset: Dataset) => { system: string; user: string },
  validate: (raw: unknown, dataset: Dataset) => T,
  signal?: AbortSignal,
): Promise<AiResult<T>> {
  const resolved = resolveSettings(settings);
  const issue = validateAiSettings(resolved);
  if (issue) throw new AiError(issue);

  const started = performance.now();
  const prompt = build(resolved, dataset);
  const text = await getAdapter(resolved.provider).complete({
    settings: resolved,
    system: prompt.system,
    user: prompt.user,
    signal,
    json: true,
  });
  const data = validate(extractJson(text), dataset);

  return {
    data,
    latencyMs: Math.round(performance.now() - started),
    model: resolved.model,
  };
}

export function analyzeColumns(
  settings: AiSettings,
  dataset: Dataset,
  signal?: AbortSignal,
): Promise<AiResult<AiAnalysis>> {
  return runPrompt(settings, dataset, buildAnalysisPrompt, validateAnalysis, signal);
}

export function suggestCleaning(
  settings: AiSettings,
  dataset: Dataset,
  signal?: AbortSignal,
): Promise<AiResult<AiCleaningPlan>> {
  return runPrompt(settings, dataset, buildCleaningPrompt, validateCleaningPlan, signal);
}

export function interpretInstruction(
  settings: AiSettings,
  dataset: Dataset,
  instruction: string,
  signal?: AbortSignal,
): Promise<AiResult<AiInstructionPlan>> {
  const trimmed = instruction.trim();
  if (!trimmed) throw new AiError('Write an instruction first.');
  return runPrompt(
    settings,
    dataset,
    (resolved, current) => buildInstructionPrompt(resolved, current, trimmed),
    validateInstructionPlan,
    signal,
  );
}

/** Sends a minimal request to verify key, endpoint, and model. */
export async function testConnection(
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<AiConnectionResult> {
  const resolved = resolveSettings(settings);
  const issue = validateAiSettings(resolved);
  if (issue) {
    return { ok: false, message: issue, latencyMs: 0, model: resolved.model };
  }

  const started = performance.now();
  try {
    await getAdapter(resolved.provider).complete({
      settings: resolved,
      system: 'You are a connectivity check. Reply with JSON only.',
      user: 'Return exactly {"ok":true}',
      signal,
    });
    return {
      ok: true,
      message: `Connected to ${getAdapter(resolved.provider).label}.`,
      latencyMs: Math.round(performance.now() - started),
      model: resolved.model,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Connection failed.',
      latencyMs: Math.round(performance.now() - started),
      model: resolved.model,
    };
  }
}

export async function listModels(settings: AiSettings): Promise<string[]> {
  const resolved = resolveSettings(settings);
  const adapter = getAdapter(resolved.provider);
  if (!adapter.listModels) throw new AiError('This provider does not expose a model list.');
  if (!resolved.apiKey.trim()) throw new AiError('Add your API key first.');
  return adapter.listModels(resolved);
}
