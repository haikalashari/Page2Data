import type {
  AiAnalysis,
  AiCleaningPlan,
  AiCleaningSuggestion,
  AiColumnSuggestion,
  AiInstructionPlan,
  AiOperation,
} from '@/types/ai';
import type { DataType, Dataset } from '@/types/dataset';
import { normalizeWhitespace, truncate } from '@/utils/helpers';

const DATA_TYPES: DataType[] = ['string', 'integer', 'number', 'boolean', 'date', 'empty'];
const OPERATIONS: AiOperation[] = [
  'trim',
  'remove-duplicates',
  'standardize-names',
  'infer-types',
  'drop-column',
  'manual-review',
];

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseError';
  }
}

/** Pulls the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(text: string): unknown {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new AiResponseError('The AI response did not contain a JSON object.');
  }

  try {
    return JSON.parse(clean.slice(start, end + 1)) as unknown;
  } catch {
    throw new AiResponseError('The AI response was not valid JSON. Try again.');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown, max: number): string {
  return typeof value === 'string' ? truncate(normalizeWhitespace(value), max) : '';
}

function asTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asDataType(value: unknown, fallback: DataType): DataType {
  return DATA_TYPES.includes(value as DataType) ? (value as DataType) : fallback;
}

interface ColumnLookup {
  id: string;
  name: string;
  originalName: string;
  dataType: DataType;
}

function findColumn(dataset: Dataset, rawName: string): ColumnLookup | null {
  const needle = normalizeWhitespace(rawName).toLowerCase();
  if (!needle) return null;
  return (
    dataset.columns.find((column) => column.name.toLowerCase() === needle) ??
    dataset.columns.find((column) => column.originalName.toLowerCase() === needle) ??
    null
  );
}

/** Validates an AI schema analysis against the actual dataset. */
export function validateAnalysis(raw: unknown, dataset: Dataset): AiAnalysis {
  const record = asRecord(raw);
  if (!record) throw new AiResponseError('The AI response was not a JSON object.');

  const summary = asText(record.summary, 400);
  const warnings = asTextArray(record.warnings, 6, 240);
  const rawColumns = Array.isArray(record.columns) ? record.columns : [];

  const columns: AiColumnSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of rawColumns.slice(0, dataset.columns.length + 5)) {
    const entry = asRecord(item);
    if (!entry) continue;

    const match = findColumn(dataset, asText(entry.originalName, 120));
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);

    columns.push({
      originalName: match.name,
      suggestedName: asText(entry.suggestedName, 80) || match.name,
      dataType: asDataType(entry.dataType, match.dataType),
      reason: asText(entry.reason, 200),
    });
  }

  if (columns.length === 0) {
    throw new AiResponseError('The AI did not return any suggestions that match this dataset.');
  }

  return { summary: summary || 'Schema review complete.', columns, warnings };
}

/** Validates a cleaning plan and drops unknown operations. */
export function validateCleaningPlan(raw: unknown, dataset: Dataset): AiCleaningPlan {
  const record = asRecord(raw);
  if (!record) throw new AiResponseError('The AI response was not a JSON object.');

  const summary = asText(record.summary, 400);
  const warnings = asTextArray(record.warnings, 6, 240);
  const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : [];

  const suggestions: AiCleaningSuggestion[] = [];
  for (const item of rawSuggestions.slice(0, 15)) {
    const entry = asRecord(item);
    if (!entry) continue;

    const operation = OPERATIONS.includes(entry.operation as AiOperation)
      ? (entry.operation as AiOperation)
      : 'manual-review';
    const description = asText(entry.description, 240);
    if (!description) continue;

    const targetText = asText(entry.target, 120);
    const target = targetText ? (findColumn(dataset, targetText)?.name ?? null) : null;

    if (operation === 'drop-column' && !target) continue;

    suggestions.push({ operation, target, description });
  }

  if (suggestions.length === 0) {
    throw new AiResponseError('The AI did not return any usable cleaning suggestions.');
  }

  return { summary: summary || 'Cleaning review complete.', suggestions, warnings };
}

/** Validates a free-form instruction plan against the dataset schema. */
export function validateInstructionPlan(raw: unknown, dataset: Dataset): AiInstructionPlan {
  const record = asRecord(raw);
  if (!record) throw new AiResponseError('The AI response was not a JSON object.');

  const summary = asText(record.summary, 400);
  const notes = asTextArray(record.notes, 6, 240);

  const keepColumns: string[] = [];
  if (Array.isArray(record.keepColumns)) {
    for (const item of record.keepColumns.slice(0, dataset.columns.length + 5)) {
      const match = findColumn(dataset, asText(item, 120));
      if (match && !keepColumns.includes(match.name)) keepColumns.push(match.name);
    }
  }

  const columnRenames: Array<{ from: string; to: string }> = [];
  if (Array.isArray(record.columnRenames)) {
    for (const item of record.columnRenames.slice(0, dataset.columns.length + 5)) {
      const entry = asRecord(item);
      if (!entry) continue;
      const match = findColumn(dataset, asText(entry.from, 120));
      const to = asText(entry.to, 80);
      if (match && to) columnRenames.push({ from: match.name, to });
    }
  }

  if (keepColumns.length === 0 && columnRenames.length === 0 && notes.length === 0) {
    throw new AiResponseError('The AI did not return a usable plan for this instruction.');
  }

  return { summary: summary || 'Instruction interpreted.', keepColumns, columnRenames, notes };
}
