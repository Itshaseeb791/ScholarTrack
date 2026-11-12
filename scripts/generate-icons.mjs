// Dependency-free PNG rasterizer: opaque academic icon with 3x antialiasing.
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}

function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function png(size, maskable) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  // The entire foreground fits within the maskable central safe circle.
  const scale = maskable ? 0.78 : 1;
  const cap = [[26, 46], [50, 35], [74, 46], [50, 57]];
  const base = [[34, 53], [50, 61], [66, 53], [66, 63], [50, 70], [34, 63]];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sums = [0, 0, 0];
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const x = ((px + (sx + 0.5) / 3) / size * 100 - 50) / scale + 50;
        const y = ((py + (sy + 0.5) / 3) / size * 100 - 50) / scale + 50;
        const tassel = (x >= 72 && x <= 74 && y >= 46 && y <= 64) ||
          ((x - 73) ** 2 + (y - 65) ** 2 < 7);
        const color = inside(x, y, cap) || inside(x, y, base) || tassel
          ? [255, 255, 255] : [23, 84, 62];
        color.forEach((value, index) => { sums[index] += value; });
      }
      const offset = py * (size * 4 + 1) + 1 + px * 4;
      sums.forEach((value, index) => { scanlines[offset + index] = Math.round(value / 9); });
      scanlines[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size, maskable] of [
  ["icon-192.png", 192, false], ["icon-512.png", 512, false],
  ["apple-touch-icon.png", 180, false], ["icon-maskable-512.png", 512, true],
]) {
  await writeFile(new URL(name, directory), png(size, maskable));
  console.log(name + ": " + size + "×" + size);
}

// Replace the starter favicon with a real ICO containing a 32px PNG.
const favicon = png(32, false);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(favicon.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([ico, favicon]));
