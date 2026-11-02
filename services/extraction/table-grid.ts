/**
 * Turns a DOM table into a rectangular grid, honouring rowspan/colspan.
 * Covered cells repeat the originating cell's text so downstream code never
 * has to deal with holes.
 */
export interface GridCell {
  text: string;
  isHeader: boolean;
  rowSpan: number;
  colSpan: number;
}

export interface TableGrid {
  /** rows[r][c] is always defined for c < columnCount. */
  rows: GridCell[][];
  columnCount: number;
  headerRowCount: number;
}

const HIDDEN_SELECTOR = 'script, style, template, [aria-hidden="true"], .sr-only, .visually-hidden';

/** Reads a cell's visible-ish text without script/style/icon noise. */
export function readCellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll(HIDDEN_SELECTOR).forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function span(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : 1;
}

/**
 * Builds the grid for a single table. `table.rows` excludes rows of nested
 * tables, so nested content is naturally ignored.
 */
export function tableToGrid(table: HTMLTableElement): TableGrid {
  const sourceRows = Array.from(table.rows);
  const grid: Array<Array<GridCell | undefined>> = [];
  const occupied: boolean[][] = [];

  sourceRows.forEach((row, rowIndex) => {
    if (!grid[rowIndex]) grid[rowIndex] = [];
    if (!occupied[rowIndex]) occupied[rowIndex] = [];
    let columnIndex = 0;

    for (const cell of Array.from(row.cells)) {
      while (occupied[rowIndex]![columnIndex]) columnIndex += 1;

      const rowSpan = span(cell.rowSpan);
      const colSpan = span(cell.colSpan);
      const gridCell: GridCell = {
        text: readCellText(cell),
        isHeader: cell.tagName === 'TH',
        rowSpan,
        colSpan,
      };

      for (let dr = 0; dr < rowSpan; dr += 1) {
        const targetRow = rowIndex + dr;
        if (!grid[targetRow]) grid[targetRow] = [];
        if (!occupied[targetRow]) occupied[targetRow] = [];
        for (let dc = 0; dc < colSpan; dc += 1) {
          const targetColumn = columnIndex + dc;
          occupied[targetRow]![targetColumn] = true;
          // Spanning cells are repeated across their covered slots.
          grid[targetRow]![targetColumn] = gridCell;
        }
      }

      columnIndex += colSpan;
    }
  });

  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const rows = grid.map((row) => {
    const normalized: GridCell[] = [];
    for (let c = 0; c < columnCount; c += 1) {
      normalized.push(row[c] ?? { text: '', isHeader: false, rowSpan: 1, colSpan: 1 });
    }
    return normalized;
  });

  return { rows, columnCount, headerRowCount: detectHeaderRowCount(table, rows) };
}

/** Detects how many leading rows are headers. */
export function detectHeaderRowCount(table: HTMLTableElement, rows: GridCell[][]): number {
  const thead = table.tHead;
  if (thead && thead.rows.length > 0) {
    return Math.min(thead.rows.length, rows.length);
  }

  const firstRow = rows[0];
  if (!firstRow || firstRow.length === 0) return 0;

  const filled = firstRow.filter((cell) => cell.text !== '');
  if (filled.length === 0) return 0;

  const headerCells = filled.filter((cell) => cell.isHeader).length;
  // Treat the first row as a header when it is a header row, or when it is
  // clearly labelled (short text, no numbers) and the table has more rows.
  const looksLikeLabels =
    rows.length > 1 && filled.every((cell) => cell.text.length <= 60 && !/^[-+]?\d[\d.,\s]*$/.test(cell.text));

  return headerCells / filled.length >= 0.6 || (headerCells > 0 && looksLikeLabels) ? 1 : 0;
}

/** True when every cell in the row is blank. */
export function isBlankRow(row: GridCell[]): boolean {
  return row.every((cell) => cell.text === '');
}
