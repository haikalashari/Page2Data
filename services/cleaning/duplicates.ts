import type { Dataset } from '@/types/dataset';
import type { CleaningResult } from './whitespace';

const SEPARATOR = '\u001f';

export interface DuplicateGroup {
  signature: string;
  /** Zero-based row indexes sharing this signature. */
  indexes: number[];
}

export function rowSignature(row: Record<string, string>, columnIds: string[]): string {
  return columnIds.map((id) => (row[id] ?? '').trim()).join(SEPARATOR);
}

/**
 * Finds rows with identical values across all columns. The first occurrence is
 * kept; every later occurrence is listed as a duplicate.
 */
export function findDuplicates(dataset: Dataset): { groups: DuplicateGroup[]; duplicateIndexes: number[] } {
  const columnIds = dataset.columns.map((column) => column.id);
  const buckets = new Map<string, number[]>();

  dataset.rows.forEach((row, index) => {
    const signature = rowSignature(row, columnIds);
    const bucket = buckets.get(signature);
    if (bucket) bucket.push(index);
    else buckets.set(signature, [index]);
  });

  const groups: DuplicateGroup[] = [];
  const duplicateIndexes: number[] = [];
  for (const [signature, indexes] of buckets) {
    if (indexes.length > 1) {
      groups.push({ signature, indexes });
      duplicateIndexes.push(...indexes.slice(1));
    }
  }

  return { groups, duplicateIndexes };
}

export interface RemoveDuplicatesOptions {
  /** Keep the first or the last occurrence of each duplicate group. */
  keep?: 'first' | 'last';
}

/** Removes duplicate rows, keeping the first occurrence by default. */
export function removeDuplicates(dataset: Dataset, options: RemoveDuplicatesOptions = {}): CleaningResult {
  const keep = options.keep ?? 'first';
  const columnIds = dataset.columns.map((column) => column.id);
  const seen = new Set<string>();
  const rows = [];

  const source = keep === 'first' ? dataset.rows : [...dataset.rows].reverse();
  for (const row of source) {
    const signature = rowSignature(row, columnIds);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    rows.push(row);
  }

  const kept = keep === 'first' ? rows : rows.reverse();
  const changed = dataset.rows.length - kept.length;

  return {
    dataset: changed > 0 ? { ...dataset, rows: kept } : dataset,
    changed,
    message: changed === 0 ? 'No duplicate rows found.' : `Removed ${changed.toLocaleString()} duplicate rows.`,
  };
}
