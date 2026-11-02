// Renders the built side panel in Edge with a mocked chrome API and saves
// screenshots for documentation. Usage: npm run screenshots
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, '.output/chrome-mv3');
const OUT_DIR = join(ROOT, 'docs/screenshots');
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 4317;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const rows = [
  ['Laptop Pro 14', '18,999,000', '4.8', 'Electronics', '12'],
  ['Wireless Mouse', '249,000', '4.5', 'Accessories', '84'],
  ['Mechanical Keyboard', '1,299,000', '4.7', 'Accessories', '31'],
  ['27" 4K Monitor', '5,499,000', '4.6', 'Electronics', '8'],
  ['USB-C Hub', '599,000', '4.3', 'Accessories', '56'],
  ['Noise-cancelling Headphones', '3,299,000', '4.9', 'Audio', '19'],
  ['Laptop Stand', '399,000', '4.4', 'Accessories', '42'],
  ['Portable SSD 1TB', '1,899,000', '4.8', 'Storage', '27'],
];

const tables = [
  {
    index: 0,
    caption: 'Product catalog — March 2026',
    rowCount: rows.length,
    columnCount: 5,
    hasHeader: true,
    headerRowCount: 1,
    likelyLayout: false,
    nested: false,
    headers: ['Product', 'Price', 'Rating', 'Category', 'Stock'],
    preview: rows.slice(0, 3),
  },
  {
    index: 1,
    caption: 'Category summary',
    rowCount: 4,
    columnCount: 2,
    hasHeader: true,
    headerRowCount: 1,
    likelyLayout: false,
    nested: false,
    headers: ['Category', 'Products'],
    preview: [
      ['Electronics', '2'],
      ['Accessories', '4'],
      ['Audio', '1'],
    ],
  },
  {
    index: 2,
    caption: 'Table 3',
    rowCount: 1,
    columnCount: 1,
    hasHeader: false,
    headerRowCount: 0,
    likelyLayout: true,
    nested: false,
    headers: [],
    preview: [['Spacer']],
  },
];

const columns = [
  { id: 'col_1', name: 'Product', originalName: 'Product', dataType: 'string' },
  { id: 'col_2', name: 'Price', originalName: 'Price', dataType: 'string' },
  { id: 'col_3', name: 'Rating', originalName: 'Rating', dataType: 'string' },
  { id: 'col_4', name: 'Category', originalName: 'Category', dataType: 'string' },
  { id: 'col_5', name: 'Stock', originalName: 'Stock', dataType: 'string' },
];

const dataset = {
  id: 'ds_demo',
  name: 'Product catalog — March 2026',
  sourceUrl: 'https://shop.example.com/catalog',
  sourceTitle: 'Product catalog',
  extractedAt: new Date().toISOString(),
  columns,
  rows: rows.map((values) => Object.fromEntries(columns.map((column, index) => [column.id, values[index]]))),
};

// Introduce realistic missing values and duplicate rows for the cleaning view.
dataset.rows[2].col_3 = '';
dataset.rows[7].col_3 = '';

const settings = {
  enabled: true,
  provider: 'openai',
  apiKey: 'sk-demo-not-a-real-key',
  model: 'gpt-4o-mini',
  baseUrl: '',
  temperature: 0.2,
  maxTokens: 1200,
  systemInstructions: '',
};

const fixtures = { tables, dataset, settings };

function startServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
        const relative = urlPath === '/' ? '/sidepanel.html' : urlPath;
        const filePath = normalize(join(DIST, relative));
        if (!filePath.startsWith(DIST)) {
          response.statusCode = 403;
          response.end();
          return;
        }
        const data = await readFile(filePath);
        response.setHeader('content-type', MIME[extname(filePath)] ?? 'application/octet-stream');
        response.end(data);
      } catch {
        response.statusCode = 404;
        response.end('not found');
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolveServer(server));
    server.on('error', reject);
  });
}

const server = await startServer();
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
const context = await browser.newContext({ viewport: { width: 400, height: 920 }, deviceScaleFactor: 2 });

await context.addInitScript(
  ({ tables, dataset, settings }) => {
    window.chrome = {
      tabs: {
        query: async () => [
          { id: 1, url: dataset.sourceUrl, title: dataset.sourceTitle },
        ],
        sendMessage: async (_tabId, message) =>
          message?.type === 'p2d:extract-table'
            ? { ok: true, data: dataset }
            : { ok: true, data: tables },
      },
      scripting: { executeScript: async () => {} },
      storage: {
        local: {
          get: async () => ({ 'p2d:ai-settings': settings }),
          set: async () => {},
          remove: async () => {},
        },
      },
    };
  },
  fixtures,
);

const page = await context.newPage();

async function shot(name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`saved docs/screenshots/${name}.png`);
}

await page.goto(`http://127.0.0.1:${PORT}/sidepanel.html`, { waitUntil: 'networkidle' });
await page.getByText('Tables on this page').waitFor();
await shot('01-extract');

// Extract the first (ranked) table.
await page.locator('button', { hasText: 'Extract' }).last().click();
await page.getByText('Stored locally').waitFor();
await page.waitForTimeout(300);
// Dismiss the "Extracted" toast so it does not cover the workspace.
await page
  .locator('button[aria-label="Dismiss notification"]')
  .click()
  .catch(() => {});
await page.waitForTimeout(200);
await shot('02-data');

// Open a column editor.
await page.locator('button[title="Edit Product"]').click();
await shot('03-column');
await page.keyboard.press('Escape');

// Cleaning view.
await page.getByRole('button', { name: 'Clean', exact: true }).click();
await shot('04-clean');

// AI view.
await page.getByRole('button', { name: 'AI', exact: true }).click();
await shot('05-ai');

// Settings.
await page.locator('button[aria-label="Open settings"]').click();
await shot('06-settings');

await browser.close();
await new Promise((resolveClose) => server.close(resolveClose));
