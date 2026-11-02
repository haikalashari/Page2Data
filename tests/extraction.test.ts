import { describe, expect, it } from 'vitest';
import { detectTables } from '@/services/extraction/table-detector';
import { datasetFromTable } from '@/services/extraction/table-extractor';

function mount(html: string): void {
  document.body.innerHTML = html;
}

function firstTable(): HTMLTableElement {
  const table = document.querySelector('table');
  if (!table) throw new Error('Test table missing');
  return table as HTMLTableElement;
}

describe('datasetFromTable', () => {
  it('extracts headers, rows, and source metadata', () => {
    mount(`
      <table>
        <caption>Laptops</caption>
        <thead><tr><th>Product</th><th>Price</th></tr></thead>
        <tbody>
          <tr><td>Laptop A</td><td>8500000</td></tr>
          <tr><td>Laptop B</td><td>7200000</td></tr>
        </tbody>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), {
      index: 0,
      sourceUrl: 'https://shop.test/list',
      sourceTitle: 'Shop',
    });

    expect(dataset.name).toBe('Laptops');
    expect(dataset.columns.map((column) => column.name)).toEqual(['Product', 'Price']);
    expect(dataset.columns.map((column) => column.originalName)).toEqual(['Product', 'Price']);
    expect(dataset.columns.every((column) => column.dataType === 'string')).toBe(true);
    expect(dataset.rows).toEqual([
      { col_1: 'Laptop A', col_2: '8500000' },
      { col_1: 'Laptop B', col_2: '7200000' },
    ]);
    expect(dataset.sourceUrl).toBe('https://shop.test/list');
    expect(dataset.sourceTitle).toBe('Shop');
    expect(dataset.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('generates column names when the table has no header row', () => {
    mount(`
      <table>
        <tr><td>Laptop A</td><td>8500000</td></tr>
        <tr><td>Mouse A</td><td>150000</td></tr>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), { index: 0 });

    expect(dataset.columns.map((column) => column.name)).toEqual(['Column 1', 'Column 2']);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]).toEqual({ col_1: 'Laptop A', col_2: '8500000' });
  });

  it('expands multi-row headers and spanned cells', () => {
    mount(`
      <table>
        <thead>
          <tr><th rowspan="2">Product</th><th colspan="2">Price</th></tr>
          <tr><th>USD</th><th>IDR</th></tr>
        </thead>
        <tbody>
          <tr><td>Laptop</td><td>599</td><td>8500000</td></tr>
        </tbody>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), { index: 0 });

    expect(dataset.columns.map((column) => column.name)).toEqual([
      'Product',
      'Price / USD',
      'Price / IDR',
    ]);
    expect(dataset.rows).toEqual([{ col_1: 'Laptop', col_2: '599', col_3: '8500000' }]);
  });

  it('preserves empty cells and drops columns that never contain data', () => {
    mount(`
      <table>
        <tr><th>Name</th><th>Note</th><th></th></tr>
        <tr><td>Ada</td><td></td><td></td></tr>
        <tr><td>Grace</td><td>   </td><td></td></tr>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), { index: 0 });

    expect(dataset.columns.map((column) => column.name)).toEqual(['Name', 'Note']);
    expect(dataset.rows).toEqual([
      { col_1: 'Ada', col_2: '' },
      { col_1: 'Grace', col_2: '' },
    ]);
  });

  it('makes duplicate header names unique and keeps original values', () => {
    mount(`
      <table>
        <tr><th>Price</th><th>Price</th></tr>
        <tr><td>1,200</td><td>850</td></tr>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), { index: 0 });

    expect(dataset.columns.map((column) => column.name)).toEqual(['Price', 'Price (2)']);
    expect(dataset.rows[0]).toEqual({ col_1: '1,200', col_2: '850' });
  });

  it('honours a headerRowCount override of zero', () => {
    mount(`
      <table>
        <tr><th>Product</th><th>Price</th></tr>
        <tr><td>Laptop</td><td>999</td></tr>
      </table>
    `);

    const dataset = datasetFromTable(firstTable(), { index: 0, headerRowCount: 0 });

    expect(dataset.columns.map((column) => column.name)).toEqual(['Column 1', 'Column 2']);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]).toEqual({ col_1: 'Product', col_2: 'Price' });
  });

  it('throws for a table without cells', () => {
    mount('<table><tbody></tbody></table>');
    expect(() => datasetFromTable(firstTable(), { index: 0 })).toThrow(/no cells/i);
  });
});

describe('detectTables', () => {
  it('describes data tables and ignores presentation tables', () => {
    mount(`
      <table role="presentation"><tr><td>layout</td></tr></table>
      <table>
        <caption>Quarterly revenue</caption>
        <thead><tr><th>Quarter</th><th>Revenue</th></tr></thead>
        <tbody>
          <tr><td>Q1</td><td>1200</td></tr>
          <tr><td>Q2</td><td>1400</td></tr>
        </tbody>
      </table>
    `);

    const tables = detectTables(document);

    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({
      index: 0,
      caption: 'Quarterly revenue',
      rowCount: 2,
      columnCount: 2,
      hasHeader: true,
      headerRowCount: 1,
      likelyLayout: false,
      nested: false,
    });
    expect(tables[0]?.preview[0]).toEqual(['Q1', '1200']);
    expect(tables[0]?.headers).toEqual(['Quarter', 'Revenue']);
  });

  it('flags nested tables but keeps them selectable', () => {
    mount(`
      <table>
        <tr><th>Outer</th></tr>
        <tr>
          <td>
            <table><tr><td>inner</td><td>value</td></tr></table>
          </td>
        </tr>
      </table>
    `);

    const tables = detectTables(document);

    expect(tables).toHaveLength(2);
    expect(tables.find((table) => table.index === 0)?.nested).toBe(false);
    expect(tables.find((table) => table.index === 1)?.nested).toBe(true);
    expect(tables.find((table) => table.index === 0)?.rowCount).toBe(1);
  });

  it('marks small layout tables as likely layout', () => {
    mount('<table><tr><td>Spacer</td></tr></table>');

    const tables = detectTables(document);

    expect(tables).toHaveLength(1);
    expect(tables[0]?.likelyLayout).toBe(true);
  });
});
