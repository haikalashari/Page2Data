import { describe, expect, it } from 'vitest';
import { makeDataset } from './helpers';
import { removeColumn, renameColumn, standardizeColumnNames, standardizeName } from '@/services/cleaning/column-names';
import { findDuplicates, removeDuplicates } from '@/services/cleaning/duplicates';
import { findMissingValues, removeRowsWithMissing } from '@/services/cleaning/missing-values';
import { applyInferredTypes, inferColumnTypes, inferValueType } from '@/services/cleaning/types-inference';
import { countUntrimmedCells, trimValues } from '@/services/cleaning/whitespace';

describe('whitespace', () => {
  it('trims values and reports how many cells changed', () => {
    const dataset = makeDataset({
      rows: [
        { c1: '  Laptop  ', c2: ' 100 ' },
        { c1: 'Mouse', c2: '200' },
      ],
    });

    expect(countUntrimmedCells(dataset)).toBe(2);

    const result = trimValues(dataset);

    expect(result.changed).toBe(2);
    expect(result.dataset.rows).toEqual([
      { c1: 'Laptop', c2: '100' },
      { c1: 'Mouse', c2: '200' },
    ]);
    // Immutability: the original stays untouched.
    expect(dataset.rows[0]?.c1).toBe('  Laptop  ');
  });
});

describe('duplicates', () => {
  const dataset = makeDataset({
    rows: [
      { c1: 'Laptop', c2: '100' },
      { c1: 'Mouse', c2: '20' },
      { c1: 'Laptop', c2: '100' },
      { c1: 'Laptop ', c2: '100' },
    ],
  });

  it('detects duplicate groups, ignoring surrounding whitespace', () => {
    const result = findDuplicates(dataset);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.indexes).toEqual([0, 2, 3]);
    expect(result.duplicateIndexes).toEqual([2, 3]);
  });

  it('removes duplicates and keeps the first occurrence', () => {
    const result = removeDuplicates(dataset);

    expect(result.changed).toBe(2);
    expect(result.dataset.rows).toEqual([
      { c1: 'Laptop', c2: '100' },
      { c1: 'Mouse', c2: '20' },
    ]);
  });

  it('can keep the last occurrence while preserving order', () => {
    const result = removeDuplicates(
      makeDataset({
        rows: [
          { c1: 'A', c2: '1' },
          { c1: 'B', c2: '2' },
          { c1: 'A', c2: '1' },
        ],
      }),
      { keep: 'last' },
    );

    expect(result.dataset.rows).toEqual([
      { c1: 'B', c2: '2' },
      { c1: 'A', c2: '1' },
    ]);
  });

  it('reports nothing when all rows are unique', () => {
    const result = removeDuplicates(makeDataset());

    expect(result.changed).toBe(0);
    expect(result.message).toMatch(/no duplicate/i);
  });
});

describe('missing values', () => {
  const dataset = makeDataset({
    rows: [
      { c1: 'Laptop', c2: '100' },
      { c1: 'Mouse', c2: '' },
      { c1: '   ', c2: '50' },
    ],
  });

  it('counts blank cells per column and per row', () => {
    const report = findMissingValues(dataset);

    expect(report.totalCells).toBe(6);
    expect(report.missingCells).toBe(2);
    expect(report.rowsWithMissing).toBe(2);
    expect(report.byColumn[0]).toMatchObject({ columnName: 'Product', missing: 1, rowIndexes: [2] });
    expect(report.byColumn[1]).toMatchObject({ columnName: 'Price', missing: 1, rowIndexes: [1] });
  });

  it('removes rows containing blank cells', () => {
    const result = removeRowsWithMissing(dataset);

    expect(result.changed).toBe(2);
    expect(result.dataset.rows).toEqual([{ c1: 'Laptop', c2: '100' }]);
  });
});

describe('column names', () => {
  it('normalizes names into the requested style', () => {
    expect(standardizeName('Product Name', 'snake')).toBe('product_name');
    expect(standardizeName('product name', 'camel')).toBe('productName');
    expect(standardizeName('product  name', 'title')).toBe('Product Name');
    expect(standardizeName('2024 Revenue ($)', 'snake')).toBe('col_2024_revenue');
  });

  it('applies a style and reports each change', () => {
    const dataset = makeDataset({
      columns: [
        { id: 'c1', name: 'Product Name', originalName: 'Product Name', dataType: 'string' },
        { id: 'c2', name: 'Unit Price', originalName: 'Unit Price', dataType: 'string' },
      ],
    });

    const result = standardizeColumnNames(dataset, 'snake');

    expect(result.dataset.columns.map((column) => column.name)).toEqual(['product_name', 'unit_price']);
    expect(result.changes).toEqual([
      { from: 'Product Name', to: 'product_name' },
      { from: 'Unit Price', to: 'unit_price' },
    ]);
  });

  it('renames columns without creating duplicates', () => {
    const dataset = makeDataset();
    const renamed = renameColumn(dataset, 'c2', 'Product');

    expect(renamed.columns.map((column) => column.name)).toEqual(['Product', 'Product_2']);
    expect(renameColumn(dataset, 'c1', '   ')).toBe(dataset);
  });

  it('removes a column and its values but keeps the last column', () => {
    const removed = removeColumn(makeDataset(), 'c2');

    expect(removed.columns).toHaveLength(1);
    expect(removed.rows).toEqual([{ c1: 'Laptop A' }, { c1: 'Mouse A' }]);

    const single = makeDataset({
      columns: [{ id: 'c1', name: 'Product', originalName: 'Product', dataType: 'string' }],
      rows: [{ c1: 'A' }],
    });
    expect(removeColumn(single, 'c1')).toBe(single);
  });
});

describe('type inference', () => {
  it('classifies individual values', () => {
    expect(inferValueType('')).toBe('empty');
    expect(inferValueType('42')).toBe('integer');
    expect(inferValueType('-3.5')).toBe('number');
    expect(inferValueType('1,234.50')).toBe('number');
    expect(inferValueType('Rp 8.500.000')).toBe('number');
    expect(inferValueType('true')).toBe('boolean');
    expect(inferValueType('2024-03-01')).toBe('date');
    expect(inferValueType('007')).toBe('string');
    expect(inferValueType('hello')).toBe('string');
  });

  it('infers one type per column, ignoring empty cells', () => {
    const dataset = makeDataset({
      columns: [
        { id: 'c1', name: 'Name', originalName: 'Name', dataType: 'string' },
        { id: 'c2', name: 'Price', originalName: 'Price', dataType: 'string' },
        { id: 'c3', name: 'Mixed', originalName: 'Mixed', dataType: 'string' },
      ],
      rows: [
        { c1: 'A', c2: '10', c3: '1' },
        { c1: 'B', c2: '1,200.5', c3: 'two' },
        { c1: '', c2: '', c3: '3' },
      ],
    });

    expect(inferColumnTypes(dataset)).toEqual({ c1: 'string', c2: 'number', c3: 'string' });

    const applied = applyInferredTypes(dataset);
    expect(applied.changes).toEqual([
      { column: 'Price', from: 'string', to: 'number' },
    ]);
    expect(applied.dataset.columns.find((column) => column.id === 'c2')?.dataType).toBe('number');
  });

  it('marks a column with only blank cells as empty', () => {
    const dataset = makeDataset({
      columns: [{ id: 'c1', name: 'Empty', originalName: 'Empty', dataType: 'string' }],
      rows: [{ c1: '' }, { c1: '   ' }],
    });

    expect(inferColumnTypes(dataset)).toEqual({ c1: 'empty' });
  });
});
