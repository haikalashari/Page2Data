import type { Dataset } from '@/types/dataset';
import type { ContentRequest, ContentResponse, TableInfo } from '@/types/extraction';

const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

export class PageAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageAccessError';
  }
}

export interface ScannedPage {
  tabId: number;
  url: string;
  title: string;
  tables: TableInfo[];
}

function isRestrictedPage(url: string | undefined): boolean {
  if (!url) return true;
  return (
    /^(chrome|edge|about|chrome-extension|moz-extension|view-source|devtools):/i.test(url) ||
    /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url)
  );
}

function friendlyMessage(error: unknown): string {
  if (error instanceof PageAccessError) return error.message;
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (/Receiving end does not exist|Could not establish connection/i.test(raw)) {
    return 'Page2Data cannot read this page yet. Reload the webpage, then scan again.';
  }
  if (/Cannot access|Missing host permission|The extensions gallery/i.test(raw)) {
    return 'Chrome blocks extensions on this page. Try a regular webpage.';
  }
  return raw || 'Could not read this page.';
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  } catch {
    throw new PageAccessError('Could not access this page. Reload it, then scan again.');
  }
}

async function sendToTab<T>(tabId: number, request: ContentRequest): Promise<T> {
  const send = () => chrome.tabs.sendMessage(tabId, request) as Promise<ContentResponse<T>>;

  let response: ContentResponse<T>;
  try {
    response = await send();
  } catch {
    // The content script is injected on page load; this covers pages that were
    // already open when the extension was installed or reloaded.
    await injectContentScript(tabId);
    try {
      response = await send();
    } catch (error) {
      throw new PageAccessError(friendlyMessage(error));
    }
  }

  if (!response) {
    throw new PageAccessError('The page did not respond. Reload it and try again.');
  }
  if (!response.ok) {
    throw new PageAccessError(response.error);
  }
  return response.data;
}

/** Scans the active tab for HTML tables. */
export async function scanActivePage(): Promise<ScannedPage> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new PageAccessError('No active page found. Open a webpage first.');
  if (isRestrictedPage(tab.url)) {
    throw new PageAccessError('Chrome does not allow extensions to read this page. Open a regular webpage.');
  }

  const tables = await sendToTab<TableInfo[]>(tab.id, { type: 'p2d:detect-tables' });
  return { tabId: tab.id, url: tab.url ?? '', title: tab.title ?? '', tables };
}

/** Extracts one table from a previously scanned page. */
export async function extractTableFromPage(
  page: ScannedPage,
  index: number,
  options: { name?: string; headerRowCount?: number } = {},
): Promise<Dataset> {
  return sendToTab<Dataset>(page.tabId, {
    type: 'p2d:extract-table',
    index,
    datasetName: options.name,
    headerRowCount: options.headerRowCount,
  });
}

/** Checks that the content script in a tab is responsive. */
export async function pingPage(tabId: number): Promise<boolean> {
  try {
    await sendToTab(tabId, { type: 'p2d:ping' });
    return true;
  } catch {
    return false;
  }
}
