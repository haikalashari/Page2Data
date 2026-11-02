import type { Dataset } from '@/types/dataset';

export interface CsvOptions {
  delimiter?: string;
  /** UTF-8 BOM so Excel detects the encoding. */
  includeBom?: boolean;
  /** Prefix cells starting with =, +, -, @ so spreadsheets don't run them. */
  protectFormulas?: boolean;
  lineEnding?: '\n' | '\r\n';
}

/** Quotes a field when required by RFC 4180. */
export function csvEscape(value: string, delimiter = ',', protectFormulas = false): string {
  let text = value ?? '';
  if (protectFormulas && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    /^\s|\s$/.test(text);

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializes a dataset as RFC 4180 CSV using current column names. */
export function datasetToCsv(dataset: Dataset, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const lineEnding = options.lineEnding ?? '\r\n';
  const protectFormulas = options.protectFormulas ?? false;

  const header = dataset.columns.map((column) => csvEscape(column.name, delimiter, protectFormulas)).join(delimiter);
  const lines = dataset.rows.map((row) =>
    dataset.columns
      .map((column) => csvEscape(row[column.id] ?? '', delimiter, protectFormulas))
      .join(delimiter),
  );

  const body = [header, ...lines].join(lineEnding);
  return options.includeBom === false ? body : `\uFEFF${body}`;
}

export function slugifyFileName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'dataset'
  );
}

export function exportFileName(name: string, extension: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `page2data-${slugifyFileName(name)}-${stamp}.${extension}`;
}
