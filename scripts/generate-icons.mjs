// Generates the extension icons without external image dependencies.
// Usage: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

const BRAND_START = [99, 102, 241];
const BRAND_END = [124, 58, 237];
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return a.map((value, index) => value + (b[index] - value) * t);
}

function roundedRect(x, y, x0, y0, x1, y1, r) {
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
}

function render(size) {
  const work = size * SS;
  const pixels = new Uint8Array(work * work * 4);

  const table = {
    x0: 0.22 * work,
    y0: 0.24 * work,
    x1: 0.78 * work,
    y1: 0.76 * work,
    r: 0.07 * work,
  };
  const headerBottom = table.y0 + 0.12 * work;
  const rowLine = 0.56 * work;
  const columnLine = 0.5 * work;
  const line = Math.max(1.1, 0.028 * work);

  for (let y = 0; y < work; y += 1) {
    for (let x = 0; x < work; x += 1) {
      const offset = (y * work + x) * 4;
      const t = (x / work + y / work) / 2;
      let color = mix(BRAND_START, BRAND_END, t);
      let alpha = 255;

      if (!roundedRect(x + 0.5, y + 0.5, 0, 0, work, work, work * 0.22)) {
        alpha = 0;
      }

      if (alpha > 0) {
        const px = x + 0.5;
        const py = y + 0.5;
        if (roundedRect(px, py, table.x0, table.y0, table.x1, table.y1, table.r)) {
          color = WHITE;
        }
        if (
          px >= table.x0 &&
          px <= table.x1 &&
          py >= table.y0 &&
          py <= headerBottom &&
          roundedRect(px, py, table.x0, table.y0, table.x1, table.y1, table.r)
        ) {
          color = mix(BRAND_START, BRAND_END, (px / work + py / work) / 2);
        }
        const inTable =
          px >= table.x0 && px <= table.x1 && py >= table.y0 && py <= table.y1;
        const isGridLine =
          (Math.abs(py - headerBottom) <= line / 2 && px > table.x0 + line) ||
          (Math.abs(py - rowLine) <= line / 2) ||
          (Math.abs(px - columnLine) <= line / 2 && py > headerBottom + line);
        if (inTable && isGridLine) {
          color = mix(BRAND_START, BRAND_END, (px / work + py / work) / 2);
        }
      }

      pixels[offset] = Math.round(color[0]);
      pixels[offset + 1] = Math.round(color[1]);
      pixels[offset + 2] = Math.round(color[2]);
      pixels[offset + 3] = alpha;
    }
  }

  // Downsample with premultiplied alpha to avoid dark fringes.
  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const source = ((y * SS + sy) * work + (x * SS + sx)) * 4;
          const alpha = pixels[source + 3] / 255;
          r += pixels[source] * alpha;
          g += pixels[source + 1] * alpha;
          b += pixels[source + 2] * alpha;
          a += alpha;
        }
      }
      const samples = SS * SS;
      const alpha = a / samples;
      const target = (y * size + x) * 4;
      output[target] = a > 0 ? Math.round(r / a) : 0;
      output[target + 1] = a > 0 ? Math.round(g / a) : 0;
      output[target + 2] = a > 0 ? Math.round(b / a) : 0;
      output[target + 3] = Math.round(alpha * 255);
    }
  }

  return output;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputDir = resolve(ROOT, 'public/icon');
mkdirSync(outputDir, { recursive: true });

for (const size of SIZES) {
  const png = encodePng(size, render(size));
  writeFileSync(resolve(outputDir, `${size}.png`), png);
  console.log(`icon/${size}.png (${png.length} bytes)`);
}
