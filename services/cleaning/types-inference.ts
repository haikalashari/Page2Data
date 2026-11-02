import type { DataType, Dataset } from '@/types/dataset';

const INTEGER = /^[-+]?\d+$/;
const DECIMAL = /^[-+]?(?:\d+\.\d*|\.\d+|\d+)$/;
const EN_THOUSANDS = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const ID_THOUSANDS = /^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/;
const DECIMAL_COMMA = /^[-+]?\d+,\d{1,2}$/;
const CURRENCY_PREFIX = /^(?:us\$|rp|idr|usd|eur|gbp|\$|€|£|¥)\s*/i;
const DATE_ISO = /^\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/;
const DATE_LOCAL = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const BOOLEAN = /^(?:true|false|yes|no)$/i;

/**
 * Normalizes numbers with thousands separators, currency prefixes, and
 * percent signs. Returns null when the value is not numeric.
 * Note: "1.234" is treated as 1234 (thousands), a deliberate data-table default.
 */
function normalizeNumeric(value: string): string | null {
  let text = value
    .trim()
    .replace(CURRENCY_PREFIX, '')
    .replace(/[%\s_\u00a0]/g, '');

  if (!text) return null;

  if (EN_THOUSANDS.test(text)) {
    text = text.replace(/,/g, '');
  } else if (ID_THOUSANDS.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (DECIMAL_COMMA.test(text)) {
    text = text.replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }

  return DECIMAL.test(text) ? text : null;
}

/** Guesses the most specific type for one cell value. */
export function inferValueType(value: string): DataType {
  const text = value.trim();
  if (!text) return 'empty';

  if (BOOLEAN.test(text)) return 'boolean';

  if (INTEGER.test(text)) {
    // Keep identifiers such as "007" or long phone numbers as text.
    const digits = text.replace(/^[-+]/, '');
    if (digits.length > 1 && digits.startsWith('0')) return 'string';
    if (digits.length > 15) return 'string';
    return 'integer';
  }

  if (normalizeNumeric(text) !== null) return 'number';

  if (DATE_ISO.test(text) || DATE_LOCAL.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) return 'date';
  }

  return 'string';
}

/**
 * Aggregates cell types into one type per column. Empty cells are ignored so
 * a few blanks don't force a numeric column to be text.
 */
export function inferColumnTypes(dataset: Dataset): Record<string, DataType> {
  const result: Record<string, DataType> = {};

  for (const column of dataset.columns) {
    const counts = new Map<DataType, number>();
    let sawNumber = false;
    let sawInteger = false;
    let sawDate = false;
    let sawBoolean = false;

    for (const row of dataset.rows) {
      const type = inferValueType(row[column.id] ?? '');
      if (type === 'empty') continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
      if (type === 'number') sawNumber = true;
      if (type === 'integer') sawInteger = true;
      if (type === 'date') sawDate = true;
      if (type === 'boolean') sawBoolean = true;
    }

    if (counts.size === 0) {
      result[column.id] = 'empty';
      continue;
    }
    if (counts.has('string')) {
      result[column.id] = 'string';
      continue;
    }
    if (sawNumber && sawInteger) {
      result[column.id] = 'number';
      continue;
    }
    if (sawInteger) {
      result[column.id] = 'integer';
      continue;
    }
    if (sawNumber) {
      result[column.id] = 'number';
      continue;
    }
    if (sawDate) {
      result[column.id] = 'date';
      continue;
    }
    result[column.id] = sawBoolean ? 'boolean' : 'string';
  }

  return result;
}

/** Writes inferred types back onto the dataset. */
export function applyInferredTypes(dataset: Dataset): {
  dataset: Dataset;
  changes: Array<{ column: string; from: DataType; to: DataType }>;
} {
  const types = inferColumnTypes(dataset);
  const changes: Array<{ column: string; from: DataType; to: DataType }> = [];

  const columns = dataset.columns.map((column) => {
    const nextType = types[column.id] ?? column.dataType;
    if (nextType !== column.dataType) {
      changes.push({ column: column.name, from: column.dataType, to: nextType });
    }
    return { ...column, dataType: nextType };
  });

  return { dataset: { ...dataset, columns }, changes };
}

export const DATA_TYPE_LABELS: Record<DataType, string> = {
  string: 'Text',
  integer: 'Integer',
  number: 'Number',
  boolean: 'Boolean',
  date: 'Date',
  empty: 'Empty',
};
