import type { Dataset } from '@/types/dataset';

export interface CleaningResult {
  dataset: Dataset;
  /** Number of cells/rows affected. */
  changed: number;
  message: string;
}

/** Counts cells that would change if `trimValues` ran. */
export function countUntrimmedCells(dataset: Dataset): number {
  let count = 0;
  for (const row of dataset.rows) {
    for (const column of dataset.columns) {
      const value = row[column.id] ?? '';
      if (value.trim() !== value) count += 1;
    }
  }
  return count;
}

/** Trims leading and trailing whitespace in every cell. */
export function trimValues(dataset: Dataset): CleaningResult {
  let changed = 0;
  const rows = dataset.rows.map((row) => {
    const next: Record<string, string> = {};
    for (const column of dataset.columns) {
      const value = row[column.id] ?? '';
      const trimmed = value.trim();
      if (trimmed !== value) changed += 1;
      next[column.id] = trimmed;
    }
    return next;
  });

  return {
    dataset: { ...dataset, rows },
    changed,
    message: changed === 0 ? 'All values were already trimmed.' : `Trimmed ${changed.toLocaleString()} cells.`,
  };
}

/** Removes rows whose cells are all blank. */
export function removeEmptyRows(dataset: Dataset): CleaningResult {
  const rows = dataset.rows.filter((row) => dataset.columns.some((column) => (row[column.id] ?? '').trim() !== ''));
  const changed = dataset.rows.length - rows.length;
  return {
    dataset: changed > 0 ? { ...dataset, rows } : dataset,
    changed,
    message: changed === 0 ? 'No empty rows found.' : `Removed ${changed.toLocaleString()} empty rows.`,
  };
}
