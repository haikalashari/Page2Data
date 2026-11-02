// Serves docs/ over HTTP so the extension can scan the manual test page.
// Usage: npm run test:page
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const relative = urlPath === '/' ? '/manual-test.html' : urlPath;
    const filePath = normalize(join(ROOT, relative));
    if (!filePath.startsWith(ROOT)) {
      response.statusCode = 403;
      response.end('forbidden');
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

server.listen(PORT, HOST, () => {
  console.log(`Page2Data manual test page: http://${HOST}:${PORT}/manual-test.html`);
  console.log('Press Ctrl+C to stop.');
});
