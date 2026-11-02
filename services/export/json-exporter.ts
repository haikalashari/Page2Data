import type { Dataset } from '@/types/dataset';

export interface JsonOptions {
  pretty?: boolean;
  /** Include dataset metadata around the records. */
  includeMetadata?: boolean;
}

export type JsonRecord = Record<string, string>;

/** Records keyed by current column names, matching the preview. */
export function datasetToRecords(dataset: Dataset): JsonRecord[] {
  return dataset.rows.map((row) => {
    const record: JsonRecord = {};
    for (const column of dataset.columns) {
      record[column.name] = row[column.id] ?? '';
    }
    return record;
  });
}

export function datasetToJson(dataset: Dataset, options: JsonOptions = {}): string {
  const pretty = options.pretty ?? true;
  const payload = options.includeMetadata
    ? {
        name: dataset.name,
        sourceUrl: dataset.sourceUrl,
        sourceTitle: dataset.sourceTitle,
        extractedAt: dataset.extractedAt,
        columns: dataset.columns.map((column) => ({
          name: column.name,
          originalName: column.originalName,
          dataType: column.dataType,
        })),
        records: datasetToRecords(dataset),
      }
    : datasetToRecords(dataset);

  return JSON.stringify(payload, null, pretty ? 2 : 0);
}
