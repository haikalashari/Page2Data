import type { Dataset, DatasetColumn } from '@/types/dataset';

const DEFAULT_COLUMNS: DatasetColumn[] = [
  { id: 'c1', name: 'Product', originalName: 'Product', dataType: 'string' },
  { id: 'c2', name: 'Price', originalName: 'Price', dataType: 'string' },
];

export function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  const columns = overrides.columns ?? DEFAULT_COLUMNS;
  const rows =
    overrides.rows ??
    [
      { c1: 'Laptop A', c2: '8500000' },
      { c1: 'Mouse A', c2: '150000' },
    ];

  return {
    id: 'ds_test',
    name: 'Test dataset',
    sourceUrl: 'https://example.com/table',
    sourceTitle: 'Example page',
    extractedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    columns,
    rows,
  };
}
