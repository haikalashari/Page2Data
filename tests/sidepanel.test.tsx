import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '@/entrypoints/sidepanel/App';
import type { Dataset } from '@/types/dataset';
import type { TableInfo } from '@/types/extraction';
import { makeDataset } from './helpers';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderApp(): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById('root');
  if (!container) throw new Error('missing root');
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await flush();
  return { container, root };
}

describe('side panel shell', () => {
  it('renders navigation and the extraction view without browser APIs', async () => {
    // Silence expected storage/scan failures in the jsdom environment.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container, root } = await renderApp();

    expect(container.textContent).toContain('Page2Data');
    expect(container.textContent).toContain('Extract');
    expect(container.textContent).toContain('Data');
    expect(container.textContent).toContain('Clean');
    expect(container.textContent).toContain('AI');

    // No dataset yet: data/clean tabs are disabled.
    expect(buttonByText(container, 'Clean')?.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('detects a table, extracts it, and navigates the workspace', async () => {
    const table: TableInfo = {
      index: 0,
      caption: 'Quarterly revenue',
      rowCount: 2,
      columnCount: 2,
      hasHeader: true,
      headerRowCount: 1,
      likelyLayout: false,
      nested: false,
      headers: ['Product', 'Price'],
      preview: [
        ['Laptop A', '8500000'],
        ['Mouse A', '150000'],
      ],
    };

    const dataset: Dataset = makeDataset({
      name: 'Quarterly revenue',
      columns: [
        { id: 'c1', name: 'Product', originalName: 'Product', dataType: 'string' },
        { id: 'c2', name: 'Price', originalName: 'Price', dataType: 'string' },
      ],
      rows: [
        { c1: 'Laptop A', c2: '8500000' },
        { c1: 'Mouse A', c2: '150000' },
      ],
    });

    const sendMessage = vi.fn(async (_tabId: number, message: { type: string }) =>
      message.type === 'p2d:detect-tables' ? { ok: true, data: [table] } : { ok: true, data: dataset },
    );

    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://shop.test/list', title: 'Shop' }]),
        sendMessage,
      },
      scripting: { executeScript: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
    });

    const { container, root } = await renderApp();

    // Detection result rendered.
    expect(container.textContent).toContain('Tables on this page');
    expect(container.textContent).toContain('Quarterly revenue');
    expect(container.textContent).toContain('2 rows · 2 cols');

    // Extract the selected table.
    const extractButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Extract') && button.getAttribute('aria-current') !== 'page',
    );
    expect(extractButton).toBeDefined();
    await act(async () => {
      extractButton?.click();
    });
    await flush();

    expect(sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'p2d:extract-table', index: 0, headerRowCount: 1 }),
    );

    // Dataset view is now open and the data tabs are enabled.
    expect(buttonByText(container, 'Clean')?.disabled).toBe(false);
    expect(container.textContent).toContain('Stored locally');
    expect(container.textContent).toContain('Laptop A');
    expect(container.textContent).toContain('8500000');

    // Cleaning view renders the tools for the extracted dataset.
    await act(async () => {
      buttonByText(container, 'Clean')?.click();
    });
    await flush();
    expect(container.textContent).toContain('Clean & validate');
    expect(container.textContent).toContain('Trim whitespace');
    expect(container.textContent).toContain('Duplicate rows');

    // AI view explains that AI is optional.
    await act(async () => {
      buttonByText(container, 'AI')?.click();
    });
    await flush();
    expect(container.textContent).toContain('AI assistant');
    expect(container.textContent).toContain('What gets sent to the provider?');
    expect(container.textContent).toContain('AI is turned off');

    // Settings render with provider options.
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Open settings"]')?.click();
    });
    await flush();
    expect(container.textContent).toContain('AI settings');
    expect(container.textContent).toContain('Enable AI assistance');
    expect(container.textContent).toContain('Google Gemini');

    await act(async () => {
      root.unmount();
    });
  });
});
