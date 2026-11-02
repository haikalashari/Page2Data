import { describe, expect, it, vi } from 'vitest';
import { makeDataset } from './helpers';
import { applyAnalysis, applyCleaningSuggestion, applyInstructionPlan } from '@/services/ai/apply-suggestions';
import { buildAnalysisPrompt, buildSystemPrompt, formatDatasetForPrompt } from '@/services/ai/prompt-builder';
import { isAiReady, resolveSettings, validateAiSettings } from '@/services/ai/provider-manager';
import {
  GEMINI_DEFAULT_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  geminiAdapter,
  geminiGenerateContentUrl,
  geminiSupportsTemperature,
  geminiThinkingConfig,
  normalizeGeminiModel,
} from '@/services/ai/providers/gemini';
import {
  AiResponseError,
  extractJson,
  validateAnalysis,
  validateCleaningPlan,
  validateInstructionPlan,
} from '@/services/ai/response-validator';
import { DEFAULT_AI_SETTINGS, getAiSettings, saveAiSettings } from '@/storage/settings-storage';
import type { AiAnalysis, AiSettings } from '@/types/ai';

const SETTINGS: AiSettings = {
  enabled: true,
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  baseUrl: '',
  temperature: 0.2,
  maxTokens: 1200,
  systemInstructions: '',
};

const DATASET = makeDataset({
  columns: [
    { id: 'c1', name: 'Product Name', originalName: 'Product Name', dataType: 'string' },
    { id: 'c2', name: 'Unit Price', originalName: 'Unit Price', dataType: 'string' },
  ],
  rows: [
    { c1: 'Laptop', c2: '100' },
    { c1: 'Mouse', c2: '20' },
  ],
});

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"ok":true}')).toEqual({ ok: true });
  });

  it('strips markdown fences and surrounding prose', () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(extractJson('Here you go: {"ok":true} — done')).toEqual({ ok: true });
  });

  it('rejects responses without a JSON object', () => {
    expect(() => extractJson('Sorry, I cannot help.')).toThrow(AiResponseError);
    expect(() => extractJson('{broken')).toThrow(/JSON object/i);
  });
});

describe('validateAnalysis', () => {
  it('maps suggestions to real columns and falls back on invalid types', () => {
    const analysis = validateAnalysis(
      {
        summary: 'Schema looks good',
        columns: [
          { originalName: 'product name', suggestedName: 'product_name', dataType: 'string', reason: 'snake case' },
          { originalName: 'Unit Price', suggestedName: 'unit_price', dataType: 'money', reason: '' },
          { originalName: 'Ghost', suggestedName: 'ghost', dataType: 'string' },
        ],
        warnings: ['Mixed formats', 42],
      },
      DATASET,
    );

    expect(analysis.summary).toBe('Schema looks good');
    expect(analysis.columns).toEqual([
      { originalName: 'Product Name', suggestedName: 'product_name', dataType: 'string', reason: 'snake case' },
      { originalName: 'Unit Price', suggestedName: 'unit_price', dataType: 'string', reason: '' },
    ]);
    expect(analysis.warnings).toEqual(['Mixed formats']);
  });

  it('rejects responses with no matching columns', () => {
    expect(() => validateAnalysis({ columns: [] }, DATASET)).toThrow(AiResponseError);
  });
});

describe('validateCleaningPlan', () => {
  it('filters unknown operations and requires a real drop target', () => {
    const plan = validateCleaningPlan(
      {
        summary: 'Clean up',
        suggestions: [
          { operation: 'trim', description: 'Remove extra spaces' },
          { operation: 'hack', description: 'Unknown operation' },
          { operation: 'drop-column', target: 'Unit Price', description: 'Drop the price' },
          { operation: 'drop-column', target: 'Ghost', description: 'Drop a ghost' },
          { operation: 'trim' },
        ],
        warnings: [],
      },
      DATASET,
    );

    expect(plan.suggestions.map((suggestion) => suggestion.operation)).toEqual([
      'trim',
      'manual-review',
      'drop-column',
    ]);
    expect(plan.suggestions[2]?.target).toBe('Unit Price');
  });
});

describe('validateInstructionPlan', () => {
  it('keeps only existing columns and renames', () => {
    const plan = validateInstructionPlan(
      {
        summary: 'Keep the product name',
        keepColumns: ['product name', 'Ghost'],
        columnRenames: [
          { from: 'Unit Price', to: 'price' },
          { from: 'Ghost', to: 'ghost' },
        ],
        notes: ['No rating column exists'],
      },
      DATASET,
    );

    expect(plan.keepColumns).toEqual(['Product Name']);
    expect(plan.columnRenames).toEqual([{ from: 'Unit Price', to: 'price' }]);
    expect(plan.notes).toEqual(['No rating column exists']);
  });

  it('rejects a plan with no usable content', () => {
    expect(() => validateInstructionPlan({ keepColumns: [], columnRenames: [] }, DATASET)).toThrow(
      AiResponseError,
    );
  });
});

describe('applying suggestions', () => {
  it('applies only selected column renames and types', () => {
    const analysis: AiAnalysis = {
      summary: '',
      columns: [
        { originalName: 'Product Name', suggestedName: 'product_name', dataType: 'integer', reason: '' },
        { originalName: 'Unit Price', suggestedName: 'unit_price', dataType: 'number', reason: '' },
      ],
      warnings: [],
    };

    const applied = applyAnalysis(DATASET, analysis, ['Product Name']);

    expect(applied.changed).toBe(true);
    expect(applied.dataset.columns.map((column) => column.name)).toEqual(['product_name', 'Unit Price']);
    expect(applied.dataset.columns.map((column) => column.dataType)).toEqual(['integer', 'string']);
    expect(applied.message).toBe('Applied 1 rename and 1 type.');
  });

  it('applies a cleaning suggestion locally', () => {
    const trimmed = makeDataset({ rows: [{ c1: ' A ', c2: ' 1 ' }] });
    const result = applyCleaningSuggestion(trimmed, {
      operation: 'trim',
      target: null,
      description: 'Trim',
    });

    expect(result.changed).toBe(true);
    expect(result.dataset.rows[0]).toEqual({ c1: 'A', c2: '1' });

    const manual = applyCleaningSuggestion(trimmed, {
      operation: 'manual-review',
      target: null,
      description: 'Check dates',
    });
    expect(manual.changed).toBe(false);
    expect(manual.dataset).toBe(trimmed);
  });

  it('applies an instruction plan: keep + rename', () => {
    const plan = {
      summary: '',
      keepColumns: ['Product Name'],
      columnRenames: [{ from: 'Product Name', to: 'product' }],
      notes: [],
    };

    const applied = applyInstructionPlan(DATASET, plan);

    expect(applied.changed).toBe(true);
    expect(applied.dataset.columns.map((column) => column.name)).toEqual(['product']);
    expect(applied.dataset.rows).toEqual([{ c1: 'Laptop' }, { c1: 'Mouse' }]);
  });

  it('does nothing when the plan matches the dataset', () => {
    const plan = {
      summary: '',
      keepColumns: ['Product Name', 'Unit Price'],
      columnRenames: [],
      notes: [],
    };

    const applied = applyInstructionPlan(DATASET, plan);
    expect(applied.changed).toBe(false);
    expect(applied.dataset).toBe(DATASET);
  });
});

describe('prompt building', () => {
  it('caps sample rows and never sends the full dataset', () => {
    const dataset = makeDataset({
      rows: Array.from({ length: 30 }, (_, index) => ({ c1: `row-${index}`, c2: String(index) })),
    });

    const text = formatDatasetForPrompt(dataset);

    expect(text).toContain('30 total');
    expect(text).toContain('row-19');
    expect(text).not.toContain('row-20');
  });

  it('adds the JSON contract and custom instructions', () => {
    const prompt = buildAnalysisPrompt(SETTINGS, DATASET);
    expect(prompt.system).toContain('single JSON object');
    expect(prompt.user).toContain('"columns"');
    expect(prompt.user).toContain('Product Name');

    const custom = buildSystemPrompt({ ...SETTINGS, systemInstructions: 'Prefer snake_case names.' });
    expect(custom).toContain('Prefer snake_case names.');
    expect(custom).toContain('Never invent');
  });

  it('escapes pipe characters inside cell values', () => {
    const dataset = makeDataset({ rows: [{ c1: 'A | B', c2: '1' }] });
    expect(formatDatasetForPrompt(dataset)).toContain('A \\| B');
  });
});

describe('settings validation', () => {
  it('requires an API key and a base URL for compatible providers', () => {
    expect(validateAiSettings({ ...SETTINGS, apiKey: '' })).toMatch(/API key/i);
    expect(validateAiSettings({ ...SETTINGS, provider: 'compatible', baseUrl: '' })).toMatch(/base URL/i);
    expect(validateAiSettings({ ...SETTINGS, provider: 'compatible', baseUrl: 'http://localhost:11434/v1' })).toBeNull();
    expect(validateAiSettings({ ...SETTINGS, enabled: false })).toBeNull();
  });

  it('fills provider defaults', () => {
    const resolved = resolveSettings({ ...SETTINGS, model: '  ', baseUrl: '' });
    expect(resolved.model).toBe('gpt-4o-mini');
    expect(resolved.baseUrl).toBe('https://api.openai.com/v1');

    const gemini = resolveSettings({ ...SETTINGS, provider: 'gemini', model: '  ', baseUrl: '' });
    expect(gemini.model).toBe(GEMINI_DEFAULT_MODEL);
    expect(gemini.baseUrl).toBe(GEMINI_DEFAULT_BASE_URL);
  });

  it('reports readiness only for enabled, complete settings', () => {
    expect(isAiReady(null)).toBe(false);
    expect(isAiReady({ ...SETTINGS, enabled: false })).toBe(false);
    expect(isAiReady({ ...SETTINGS, apiKey: '' })).toBe(false);
    expect(isAiReady(SETTINGS)).toBe(true);
  });
});

describe('Gemini models', () => {
  const GEMINI_SETTINGS: AiSettings = {
    ...SETTINGS,
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    baseUrl: '',
  };

  it('uses the current default and accepts an optional models/ prefix', () => {
    expect(GEMINI_DEFAULT_MODEL).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('models/gemini-3.6-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('  models/gemini-3.6-flash  ')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('   ')).toBe(GEMINI_DEFAULT_MODEL);
  });

  it('builds a generateContent URL with exactly one models/ segment', () => {
    expect(geminiGenerateContentUrl(GEMINI_SETTINGS)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    );
    expect(geminiGenerateContentUrl({ ...GEMINI_SETTINGS, model: 'models/gemini-3.6-flash' })).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    );
  });

  it('omits temperature for Gemini 3.6+ models only', () => {
    expect(geminiSupportsTemperature('gemini-3.8-flash')).toBe(false);
    expect(geminiSupportsTemperature('models/gemini-3.8-flash')).toBe(false);
    expect(geminiSupportsTemperature('gemini-3.6-flash')).toBe(false);
    expect(geminiSupportsTemperature('gemini-4-argon')).toBe(false);
    expect(geminiSupportsTemperature('gemini-3.5-flash-lite')).toBe(true);
    expect(geminiSupportsTemperature('gemini-3.1-pro-preview')).toBe(true);
    expect(geminiSupportsTemperature('gemini-2.5-flash')).toBe(true);
  });

  it('uses low thinking only on models that support it', () => {
    expect(geminiThinkingConfig('gemini-3.6-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('models/gemini-3.8-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('gemini-4-argon')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('gemini-3.5-flash-lite')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('gemini-3.1-flash-lite-preview')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('gemini-3-flash-preview')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiThinkingConfig('gemini-3.1-pro-preview')).toBeUndefined();
    expect(geminiThinkingConfig('gemini-3.8-flash-tts')).toBeUndefined();
    expect(geminiThinkingConfig('gemini-2.5-flash')).toBeUndefined();
    expect(geminiThinkingConfig('gemma-4-31b-it')).toBeUndefined();
  });

  it('nests thinking settings under generationConfig.thinkingConfig', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await geminiAdapter.complete({
        settings: { ...GEMINI_SETTINGS, model: 'gemini-3.6-flash' },
        system: 'system',
        user: 'user',
        json: true,
      });

      const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(request.body)) as {
        generationConfig: Record<string, unknown>;
      };
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
      expect(body.generationConfig).not.toHaveProperty('thinkingLevel');
      expect(body.generationConfig).not.toHaveProperty('temperature');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('migrates retired Gemini models saved in local settings', async () => {
    localStorage.clear();

    const saved = await saveAiSettings({
      ...DEFAULT_AI_SETTINGS,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    });
    expect(saved.model).toBe(GEMINI_DEFAULT_MODEL);
    expect((await getAiSettings()).model).toBe(GEMINI_DEFAULT_MODEL);

    const prefixed = await saveAiSettings({
      ...DEFAULT_AI_SETTINGS,
      provider: 'gemini',
      model: 'models/gemini-2.0-flash',
    });
    expect(prefixed.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it('moves the old Gemini 3.8 default to 3.6 once, then keeps an explicit choice', async () => {
    localStorage.clear();
    localStorage.setItem(
      'p2d:ai-settings',
      JSON.stringify({ ...DEFAULT_AI_SETTINGS, provider: 'gemini', model: 'models/gemini-3.8-flash' }),
    );

    expect((await getAiSettings()).model).toBe(GEMINI_DEFAULT_MODEL);
    expect(JSON.parse(localStorage.getItem('p2d:ai-settings') ?? '{}').model).toBe(GEMINI_DEFAULT_MODEL);

    await saveAiSettings({ ...DEFAULT_AI_SETTINGS, provider: 'gemini', model: 'gemini-3.8-flash' });
    expect((await getAiSettings()).model).toBe('gemini-3.8-flash');
  });
});
