/** Column types Page2Data can infer from extracted values. */
export type DataType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'empty';

export interface DatasetColumn {
  /** Stable internal key used in row records. Renaming never changes it. */
  id: string;
  /** Current display name (editable). */
  name: string;
  /** Name as detected in the source table. */
  originalName: string;
  dataType: DataType;
}

export type DatasetRow = Record<string, string>;

export interface Dataset {
  id: string;
  name: string;
  sourceUrl: string;
  sourceTitle: string;
  /** ISO timestamp of extraction. */
  extractedAt: string;
  columns: DatasetColumn[];
  rows: DatasetRow[];
}

/** Lightweight dataset description used in saved-dataset lists. */
export interface DatasetSummary {
  id: string;
  name: string;
  sourceTitle: string;
  sourceUrl: string;
  extractedAt: string;
  rowCount: number;
  columnCount: number;
}
