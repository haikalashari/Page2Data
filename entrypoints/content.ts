import { detectTables } from '@/services/extraction/table-detector';
import { extractTableByIndex } from '@/services/extraction/table-extractor';
import type { ContentRequest, ContentResponse } from '@/types/extraction';

function isPage2DataRequest(value: unknown): value is ContentRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && type.startsWith('p2d:');
}

function handleRequest(message: ContentRequest): unknown {
  switch (message.type) {
    case 'p2d:ping':
      return { ready: true };
    case 'p2d:detect-tables':
      return detectTables(document);
    case 'p2d:extract-table':
      return extractTableByIndex(document, {
        index: message.index,
        name: message.datasetName,
        headerRowCount: message.headerRowCount,
      });
  }
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    if (window.top !== window) return;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isPage2DataRequest(message)) return false;

      try {
        sendResponse({ ok: true, data: handleRequest(message) } satisfies ContentResponse<unknown>);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not read this page.',
        } satisfies ContentResponse<unknown>);
      }
      return false;
    });
  },
});
