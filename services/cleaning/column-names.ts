import type { Dataset, DatasetColumn } from '@/types/dataset';
import { normalizeWhitespace } from '@/utils/helpers';

export type NameStyle = 'snake' | 'camel' | 'title';

export const NAME_STYLE_LABELS: Record<NameStyle, string> = {
  snake: 'snake_case',
  camel: 'camelCase',
  title: 'Title Case',
};

function words(value: string): string[] {
  return normalizeWhitespace(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Converts a raw column label into a consistent identifier-like name. */
export function standardizeName(name: string, style: NameStyle): string {
  const parts = words(name);
  if (parts.length === 0) return 'column';

  let result: string;
  switch (style) {
    case 'snake':
      result = parts.map((part) => part.toLowerCase()).join('_');
      break;
    case 'camel':
      result = parts
        .map((part, index) => (index === 0 ? part.toLowerCase() : capitalize(part)))
        .join('');
      break;
    case 'title':
      result = parts.map(capitalize).join(' ');
      break;
  }

  // A leading digit is awkward for downstream tools (SQL, JS objects).
  if (/^\d/.test(result)) result = `col_${result}`;
  return result;
}

function uniqueName(candidate: string, used: Set<string>): string {
  let name = candidate;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    name = `${candidate}_${counter}`;
    counter += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Applies a naming style to every column and resolves collisions. */
export function standardizeColumnNames(
  dataset: Dataset,
  style: NameStyle,
): { dataset: Dataset; changes: Array<{ from: string; to: string }> } {
  const used = new Set<string>();
  const changes: Array<{ from: string; to: string }> = [];

  const columns = dataset.columns.map((column) => {
    const candidate = uniqueName(standardizeName(column.name, style), used);
    if (candidate !== column.name) changes.push({ from: column.name, to: candidate });
    return { ...column, name: candidate } satisfies DatasetColumn;
  });

  return { dataset: { ...dataset, columns }, changes };
}

/** Renames a column, keeping names unique and non-empty. */
export function renameColumn(dataset: Dataset, columnId: string, name: string): Dataset {
  const clean = normalizeWhitespace(name).slice(0, 80);
  if (!clean) return dataset;

  const used = new Set(
    dataset.columns.filter((column) => column.id !== columnId).map((column) => column.name.toLowerCase()),
  );
  const finalName = uniqueName(clean, used);

  return {
    ...dataset,
    columns: dataset.columns.map((column) =>
      column.id === columnId ? { ...column, name: finalName } : column,
    ),
  };
}

/** Removes a column and its values. The last remaining column is protected. */
export function removeColumn(dataset: Dataset, columnId: string): Dataset {
  if (dataset.columns.length <= 1) return dataset;
  return {
    ...dataset,
    columns: dataset.columns.filter((column) => column.id !== columnId),
    rows: dataset.rows.map((row) => {
      const { [columnId]: _removed, ...rest } = row;
      return rest;
    }),
  };
}

export function setColumnType(dataset: Dataset, columnId: string, dataType: DatasetColumn['dataType']): Dataset {
  return {
    ...dataset,
    columns: dataset.columns.map((column) => (column.id === columnId ? { ...column, dataType } : column)),
  };
}
