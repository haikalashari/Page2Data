import { describe, expect, it } from 'vitest';
import { makeDataset } from './helpers';
import { csvEscape, datasetToCsv, exportFileName } from '@/services/export/csv-exporter';
import { datasetToJson, datasetToRecords } from '@/services/export/json-exporter';

describe('csvEscape', () => {
  it('leaves simple values untouched', () => {
    expect(csvEscape('Laptop')).toBe('Laptop');
    expect(csvEscape('8500000')).toBe('8500000');
  });

  it('quotes delimiters, quotes, and line breaks', () => {
    expect(csvEscape('Laptop, 14"')).toBe('"Laptop, 14"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
    expect(csvEscape(' padded ')).toBe('" padded "');
    expect(csvEscape('a;b', ';')).toBe('"a;b"');
  });

  it('optionally neutralizes spreadsheet formulas', () => {
    expect(csvEscape('=1+1', ',', true)).toBe("'=1+1");
    expect(csvEscape('-5', ',', true)).toBe("'-5");
    expect(csvEscape('normal', ',', true)).toBe('normal');
  });
});

describe('datasetToCsv', () => {
  it('writes a BOM, column names, CRLF rows, and escaped values', () => {
    const dataset = makeDataset({
      columns: [{ id: 'c1', name: 'Product, name', originalName: 'Product, name', dataType: 'string' }],
      rows: [{ c1: 'Laptop "A"' }, { c1: 'Mouse' }],
    });

    const csv = datasetToCsv(dataset);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFF"Product, name"\r\n"Laptop ""A"""\r\nMouse');
  });

  it('uses current column names and keeps missing cells empty', () => {
    const dataset = makeDataset({
      columns: [
        { id: 'c1', name: 'product', originalName: 'Product', dataType: 'string' },
        { id: 'c2', name: 'price', originalName: 'Price', dataType: 'number' },
      ],
      rows: [
        { c1: 'Laptop', c2: '' },
        { c1: 'Mouse', c2: '150000' },
      ],
    });

    const csv = datasetToCsv(dataset, { includeBom: false });

    expect(csv).toBe('product,price\r\nLaptop,\r\nMouse,150000');
  });

  it('supports custom delimiters and a final newline-free body', () => {
    const csv = datasetToCsv(makeDataset(), { delimiter: ';', includeBom: false, lineEnding: '\n' });
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv.startsWith('Product;Price')).toBe(true);
  });

  it('builds a safe, dated file name', () => {
    expect(exportFileName('Product List / 2026', 'csv', new Date('2026-11-02T10:00:00Z'))).toBe(
      'page2data-product-list-2026-2026-11-02.csv',
    );
    expect(exportFileName('   ', 'json', new Date('2026-11-02T10:00:00Z'))).toBe(
      'page2data-dataset-2026-11-02.json',
    );
  });
});

describe('json export', () => {
  it('exports records keyed by current column names', () => {
    const dataset = makeDataset({
      columns: [
        { id: 'c1', name: 'product', originalName: 'Product', dataType: 'string' },
        { id: 'c2', name: 'price', originalName: 'Price', dataType: 'number' },
      ],
    });

    expect(datasetToRecords(dataset)).toEqual([
      { product: 'Laptop A', price: '8500000' },
      { product: 'Mouse A', price: '150000' },
    ]);

    const parsed = JSON.parse(datasetToJson(dataset, { pretty: false })) as unknown;
    expect(parsed).toEqual([
      { product: 'Laptop A', price: '8500000' },
      { product: 'Mouse A', price: '150000' },
    ]);
  });

  it('can include dataset metadata', () => {
    const parsed = JSON.parse(datasetToJson(makeDataset(), { includeMetadata: true })) as {
      name: string;
      records: unknown[];
      columns: Array<{ name: string }>;
    };

    expect(parsed.name).toBe('Test dataset');
    expect(parsed.records).toHaveLength(2);
    expect(parsed.columns.map((column) => column.name)).toEqual(['Product', 'Price']);
  });

  it('pretty prints by default', () => {
    expect(datasetToJson(makeDataset())).toContain('\n  ');
  });
});
