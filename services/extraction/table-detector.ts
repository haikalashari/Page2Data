import type { TableInfo } from '@/types/extraction';
import { normalizeWhitespace, truncate } from '@/utils/helpers';
import { isBlankRow, tableToGrid, type TableGrid } from './table-grid';

const PREVIEW_ROWS = 3;
const PREVIEW_COLUMNS = 5;
const PREVIEW_CHARS = 48;

/**
 * Collects extractable tables in document order. Every consumer (detection and
 * extraction) must use this function so table indexes stay in sync.
 */
export function collectTables(doc: Document = document): HTMLTableElement[] {
  return Array.from(doc.querySelectorAll('table')).filter((table) => {
    if (table.getAttribute('role') === 'presentation') return false;
    if (table.closest('[aria-hidden="true"]')) return false;

    const checkVisibility = (table as HTMLTableElement & { checkVisibility?: (opts?: object) => boolean })
      .checkVisibility;
    if (typeof checkVisibility === 'function' && !checkVisibility.call(table, { checkVisibilityCSS: true })) {
      return false;
    }

    return true;
  });
}

/** Best-effort human label for a table (caption, aria-label, figure caption, heading). */
export function describeTable(table: HTMLTableElement, index: number): string {
  const caption = normalizeWhitespace(table.caption?.textContent ?? '');
  if (caption) return truncate(caption, 90);

  const aria = normalizeWhitespace(table.getAttribute('aria-label') ?? '');
  if (aria) return truncate(aria, 90);

  const figureCaption = table.closest('figure')?.querySelector('figcaption');
  if (figureCaption) {
    const text = normalizeWhitespace(figureCaption.textContent ?? '');
    if (text) return truncate(text, 90);
  }

  const heading = findNearbyHeading(table);
  if (heading) return truncate(heading, 90);

  return `Table ${index + 1}`;
}

function findNearbyHeading(table: HTMLTableElement): string | null {
  let node: Element | null = table;
  for (let depth = 0; depth < 3 && node; depth += 1) {
    const previous = node.previousElementSibling;
    if (previous) {
      const heading = previous.matches('h1,h2,h3,h4,h5,h6')
        ? previous
        : previous.querySelector('h1,h2,h3,h4,h5,h6');
      const text = normalizeWhitespace(heading?.textContent ?? '');
      if (text) return text;
    }
    node = node.parentElement;
  }
  return null;
}

function buildPreview(grid: TableGrid): string[][] {
  return grid.rows
    .slice(grid.headerRowCount, grid.headerRowCount + PREVIEW_ROWS)
    .filter((row) => !isBlankRow(row))
    .map((row) =>
      row.slice(0, PREVIEW_COLUMNS).map((cell) => truncate(cell.text, PREVIEW_CHARS)),
    );
}

function buildHeaders(grid: TableGrid): string[] {
  if (grid.headerRowCount === 0 || grid.columnCount === 0) return [];
  const headerRows = grid.rows.slice(0, grid.headerRowCount);
  const headers: string[] = [];
  for (let c = 0; c < grid.columnCount; c += 1) {
    const parts: string[] = [];
    for (const row of headerRows) {
      const text = row[c]?.text ?? '';
      if (text && parts[parts.length - 1] !== text) parts.push(text);
    }
    headers.push(parts.join(' / '));
  }
  return headers;
}

/** Detects all tables on the page and returns preview-friendly metadata. */
export function detectTables(doc: Document = document): TableInfo[] {
  return collectTables(doc).map((table, index) => {
    const grid = tableToGrid(table);
    const dataRowCount = Math.max(0, grid.rows.length - grid.headerRowCount);
    const nested = Boolean(table.parentElement?.closest('table'));
    const hasHeader = grid.headerRowCount > 0 && buildHeaders(grid).some((header) => header !== '');
    const likelyLayout =
      grid.columnCount < 2 || (dataRowCount < 1 && !hasHeader) || (dataRowCount === 0 && grid.columnCount <= 2);

    return {
      index,
      caption: describeTable(table, index),
      rowCount: dataRowCount,
      columnCount: grid.columnCount,
      hasHeader,
      headerRowCount: grid.headerRowCount,
      likelyLayout,
      nested,
      headers: buildHeaders(grid),
      preview: buildPreview(grid),
    } satisfies TableInfo;
  });
}

/** Tables that look like real data, best first. */
export function rankTables(tables: TableInfo[]): TableInfo[] {
  return [...tables].sort((a, b) => {
    if (a.likelyLayout !== b.likelyLayout) return a.likelyLayout ? 1 : -1;
    if (a.nested !== b.nested) return a.nested ? 1 : -1;
    if (b.rowCount !== a.rowCount) return b.rowCount - a.rowCount;
    return b.columnCount - a.columnCount;
  });
}
