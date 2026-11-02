import type { Dataset, DatasetColumn, DatasetRow } from '@/types/dataset';
import { createId, normalizeWhitespace, truncate } from '@/utils/helpers';
import { collectTables, describeTable } from './table-detector';
import { isBlankRow, tableToGrid } from './table-grid';

const MAX_COLUMN_NAME_LENGTH = 80;

export interface ExtractTableOptions {
  /** Table position in `collectTables()` order. */
  index: number;
  /** Override the detected number of header rows (0 = treat row 1 as data). */
  headerRowCount?: number;
  name?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  /** Defaults to now. */
  extractedAt?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Removes repeated names, empty labels, and unsafe whitespace. */
function uniqueColumnName(base: string, used: Set<string>): string {
  const clean = truncate(normalizeWhitespace(base).replace(/[:;]+$/, ''), MAX_COLUMN_NAME_LENGTH) || 'Column';
  let candidate = clean;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${clean} (${counter})`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildColumns(
  rows: ReturnType<typeof tableToGrid>['rows'],
  headerRowCount: number,
  keepIndexes: number[],
): DatasetColumn[] {
  const used = new Set<string>();
  const headerRows = rows.slice(0, headerRowCount);

  return keepIndexes.map((sourceIndex, position) => {
    const parts: string[] = [];
    for (const row of headerRows) {
      const text = normalizeWhitespace(row[sourceIndex]?.text ?? '');
      if (text && parts[parts.length - 1] !== text) parts.push(text);
    }
    const originalName = parts.join(' / ') || `Column ${position + 1}`;
    return {
      id: `col_${position + 1}`,
      name: uniqueColumnName(originalName, used),
      originalName: uniqueColumnName(originalName, new Set()),
      dataType: 'string',
    } satisfies DatasetColumn;
  });
}

/**
 * Converts one HTML table into the canonical Dataset shape. Keeps values as
 * text (no parsing, no invention) and drops columns that never contain data.
 */
export function datasetFromTable(
  table: HTMLTableElement,
  options: Omit<ExtractTableOptions, 'index'> & { index?: number } = {},
): Dataset {
  const grid = tableToGrid(table);
  if (grid.columnCount === 0) {
    throw new Error('This table has no cells to extract.');
  }

  const headerRowCount = clamp(
    options.headerRowCount ?? grid.headerRowCount,
    0,
    Math.max(0, grid.rows.length - 1),
  );
  const dataRows = grid.rows.slice(headerRowCount).filter((row) => !isBlankRow(row));

  // Drop columns that are empty in every header and data row (layout padding).
  const keepIndexes: number[] = [];
  for (let c = 0; c < grid.columnCount; c += 1) {
    const hasHeaderText = grid.rows
      .slice(0, headerRowCount)
      .some((row) => (row[c]?.text ?? '') !== '');
    const hasDataText = dataRows.some((row) => (row[c]?.text ?? '') !== '');
    if (hasHeaderText || hasDataText) keepIndexes.push(c);
  }
  if (keepIndexes.length === 0) {
    throw new Error('This table only contains empty cells.');
  }

  const columns = buildColumns(grid.rows, headerRowCount, keepIndexes);
  const rows: DatasetRow[] = dataRows.map((row) => {
    const record: DatasetRow = {};
    columns.forEach((column, position) => {
      const sourceIndex = keepIndexes[position]!;
      record[column.id] = normalizeWhitespace(row[sourceIndex]?.text ?? '');
    });
    return record;
  });

  const index = options.index ?? 0;
  const title =
    options.name?.trim() ||
    (table.caption ? normalizeWhitespace(table.caption.textContent ?? '') : '') ||
    describeTable(table, index);

  return {
    id: createId('ds'),
    name: truncate(title || `Table ${index + 1}`, 90),
    sourceUrl: options.sourceUrl ?? '',
    sourceTitle: options.sourceTitle ?? '',
    extractedAt: options.extractedAt ?? new Date().toISOString(),
    columns,
    rows,
  };
}

/** Extracts a table by its document-order index on the given page. */
export function extractTableByIndex(doc: Document, options: ExtractTableOptions): Dataset {
  const tables = collectTables(doc);
  const table = tables[options.index];
  if (!table) {
    throw new Error('That table is no longer on the page. Scan the page again.');
  }
  return datasetFromTable(table, {
    ...options,
    sourceUrl: options.sourceUrl ?? doc.location?.href ?? '',
    sourceTitle: options.sourceTitle ?? doc.title ?? '',
  });
}
