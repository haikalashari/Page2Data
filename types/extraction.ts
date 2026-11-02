import type { Dataset } from './dataset';

/** Summary of an HTML table found on the page. */
export interface TableInfo {
  index: number;
  caption: string;
  rowCount: number;
  columnCount: number;
  hasHeader: boolean;
  /** Detected header rows (0 when none). */
  headerRowCount: number;
  /** Small layout tables (1 column, or a single row without headers). */
  likelyLayout: boolean;
  /** Whether the table lives inside another table. */
  nested: boolean;
  headers: string[];
  /** First rows, for a compact preview. */
  preview: string[][];
}

export interface ExtractTableRequest {
  type: 'p2d:extract-table';
  index: number;
  datasetName?: string;
  /** Override automatic header detection (0 = treat the first row as data). */
  headerRowCount?: number;
}

export interface DetectTablesRequest {
  type: 'p2d:detect-tables';
}

export interface PingRequest {
  type: 'p2d:ping';
}

export type ContentRequest = ExtractTableRequest | DetectTablesRequest | PingRequest;

export type ContentResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type ExtractTablePayload = Dataset;
export type DetectTablesPayload = TableInfo[];
