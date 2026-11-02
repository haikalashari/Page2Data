import type { Dataset } from '@/types/dataset';

export interface ColumnMissing {
  columnId: string;
  columnName: string;
  missing: number;
  rowIndexes: number[];
}

export interface MissingReport {
  totalCells: number;
  missingCells: number;
  rowsWithMissing: number;
  byColumn: ColumnMissing[];
}

export function isMissingValue(value: string | undefined | null): boolean {
  return value == null || value.trim() === '';
}

/** Counts blank cells per column, so users can see gaps before cleaning. */
export function findMissingValues(dataset: Dataset): MissingReport {
  const byColumn: ColumnMissing[] = dataset.columns.map((column) => ({
    columnId: column.id,
    columnName: column.name,
    missing: 0,
    rowIndexes: [],
  }));

  const rowsWithMissing = new Set<number>();

  dataset.rows.forEach((row, rowIndex) => {
    byColumn.forEach((entry, columnIndex) => {
      const column = dataset.columns[columnIndex]!;
      if (isMissingValue(row[column.id])) {
        entry.missing += 1;
        entry.rowIndexes.push(rowIndex);
        rowsWithMissing.add(rowIndex);
      }
    });
  });

  return {
    totalCells: dataset.rows.length * dataset.columns.length,
    missingCells: byColumn.reduce((sum, entry) => sum + entry.missing, 0),
    rowsWithMissing: rowsWithMissing.size,
    byColumn,
  };
}

/** Drops rows that contain at least one blank cell. */
export function removeRowsWithMissing(dataset: Dataset): { dataset: Dataset; changed: number; message: string } {
  const columnIds = dataset.columns.map((column) => column.id);
  const rows = dataset.rows.filter((row) => columnIds.every((id) => !isMissingValue(row[id])));
  const changed = dataset.rows.length - rows.length;
  return {
    dataset: changed > 0 ? { ...dataset, rows } : dataset,
    changed,
    message: changed === 0 ? 'No rows with missing values.' : `Removed ${changed.toLocaleString()} incomplete rows.`,
  };
}
