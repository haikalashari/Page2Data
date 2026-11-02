import type { DataType, Dataset } from './dataset';

export type AiProviderId = 'openai' | 'gemini' | 'compatible';

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  apiKey: string;
  model: string;
  /** Custom endpoint for OpenAI-compatible providers. Empty = provider default. */
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  /** Extra system instructions supplied by the user. */
  systemInstructions: string;
}

export interface AiColumnSuggestion {
  originalName: string;
  suggestedName: string;
  dataType: DataType;
  reason: string;
}

export interface AiAnalysis {
  summary: string;
  columns: AiColumnSuggestion[];
  warnings: string[];
}

export type AiOperation =
  | 'trim'
  | 'remove-duplicates'
  | 'standardize-names'
  | 'infer-types'
  | 'drop-column'
  | 'manual-review';

export interface AiCleaningSuggestion {
  operation: AiOperation;
  target: string | null;
  description: string;
}

export interface AiCleaningPlan {
  summary: string;
  suggestions: AiCleaningSuggestion[];
  warnings: string[];
}

/** Result of interpreting a free-form extraction instruction. */
export interface AiInstructionPlan {
  summary: string;
  keepColumns: string[];
  columnRenames: Array<{ from: string; to: string }>;
  notes: string[];
}

export interface AiResult<T> {
  data: T;
  latencyMs: number;
  model: string;
}

export interface AiConnectionResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  model: string;
}

export interface AiDatasetContext {
  dataset: Dataset;
  /** Only the columns that will be included in the prompt. */
  columns: string[];
  /** Rows included in the prompt (capped). */
  sampleRows: number;
  /** Approximate characters sent. */
  approximateChars: number;
}
