// Generates assets/command-icon.png (512x512) with no dependencies.
// A dark rounded terminal panel, a white ">_" prompt, and a green "online" dot.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 512;
const H = 512;
const buf = Buffer.alloc(W * H * 4); // RGBA, transparent by default

function px(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRoundRect(x0, y0, x1, y1, rad, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x < x0 + rad ? x0 + rad : x > x1 - rad ? x1 - rad : x;
      const cy = y < y0 + rad ? y0 + rad : y > y1 - rad ? y1 - rad : y;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) px(x, y, color);
    }
  }
}

function fillCircle(cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, color);
    }
  }
}

// Thick line segment from (x0,y0) to (x1,y1).
function stroke(x0, y0, x1, y1, half, color) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), half, color);
  }
}

const PANEL = [28, 30, 38];
const WHITE = [240, 242, 245];
const GREEN = [52, 211, 153];

// Panel
fillRoundRect(56, 56, W - 56, H - 56, 96, PANEL);

// ">" chevron
stroke(180, 195, 270, 256, 17, WHITE);
stroke(270, 256, 180, 317, 17, WHITE);

// "_" cursor
stroke(300, 325, 372, 325, 17, WHITE);

// "online" dot, top-right
fillCircle(W - 150, 150, 52, GREEN);

// ---- PNG encoding ----
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// rest zero (compression, filter, interlace)

// Raw scanlines, each prefixed with filter byte 0.
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "command-icon.png"), png);
console.log(`Wrote assets/command-icon.png (${png.length} bytes)`);
