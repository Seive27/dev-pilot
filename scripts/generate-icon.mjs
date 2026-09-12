// Generates a 1024x1024 app icon for Dev Pilot: a dark rounded square with a
// white heartbeat line — monochrome, developer-tool aesthetic.
// Encodes PNG with Node's built-in zlib; no dependencies.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const S = 1024;
const px = new Uint8Array(S * S * 4);

const put = (x, y, r, g, b, a) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};

const mix = (a, b, t) => a + (b - a) * t;

// ---- rounded rect ---------------------------------------------------------
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const qx = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + r;
  const qy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// ---- polyline stroke (rounded caps) --------------------------------------
const segDist = (px_, py_, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px_ - ax) * dx + (py_ - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px_ - (ax + t * dx), py_ - (ay + t * dy));
};

const strokePolyline = (pts, width, r, g, b, aa = 2) => {
  const rad = width / 2;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      }
      const cov = Math.max(0, Math.min(1, rad - d + 0.5));
      if (cov <= 0) continue;
      const idx = (y * S + x) * 4;
      const a0 = px[idx + 3] / 255;
      const a1 = cov;
      const a = a0 + a1 * (1 - a0);
      if (a <= 0) continue;
      px[idx] = Math.round(mix(px[idx], r, (a1 * (1 - a0)) / a));
      px[idx + 1] = Math.round(mix(px[idx + 1], g, (a1 * (1 - a0)) / a));
      px[idx + 2] = Math.round(mix(px[idx + 2], b, (a1 * (1 - a0)) / a));
      px[idx + 3] = Math.round(a * 255);
    }
  }
};

const fillCircle = (cx, cy, rad, r, g, b) => {
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const cov = Math.max(0, Math.min(1, rad - d + 0.5));
      if (cov <= 0) continue;
      const idx = (y * S + x) * 4;
      const a0 = px[idx + 3] / 255;
      const a1 = cov;
      const a = a0 + a1 * (1 - a0);
      px[idx] = Math.round(mix(px[idx], r, (a1 * (1 - a0)) / a));
      px[idx + 1] = Math.round(mix(px[idx + 1], g, (a1 * (1 - a0)) / a));
      px[idx + 2] = Math.round(mix(px[idx + 2], b, (a1 * (1 - a0)) / a));
      px[idx + 3] = Math.round(a * 255);
    }
  }
};

// background rounded square
const X0 = 84, X1 = S - 84, Y0 = 84, Y1 = S - 84, R = 210;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (inRoundedRect(x, y, X0, Y0, X1, Y1, R)) {
      put(x, y, 13, 13, 14, 255);
    }
  }
}
// border (anti-aliased ring)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = sdRoundRect(x, y, X0, Y0, X1, Y1, R);
    const cov = Math.max(0, Math.min(1, 2.5 - Math.abs(d - 3)));
    if (cov <= 0) continue;
    const idx = (y * S + x) * 4;
    const a0 = px[idx + 3] / 255;
    const a1 = cov * 0.9;
    const a = a0 + a1 * (1 - a0);
    px[idx] = Math.round(mix(px[idx], 38, (a1 * (1 - a0)) / a));
    px[idx + 1] = Math.round(mix(px[idx + 1], 38, (a1 * (1 - a0)) / a));
    px[idx + 2] = Math.round(mix(px[idx + 2], 42, (a1 * (1 - a0)) / a));
    px[idx + 3] = Math.round(a * 255);
  }
}

// heartbeat polyline
const P = [
  [200, 512], [330, 512], [372, 440], [420, 590], [470, 392], [516, 545], [568, 512], [824, 512],
];
strokePolyline(P, 30, 240, 240, 242);
// leading dot
fillCircle(330, 512, 34, 240, 240, 242);

// ---- PNG encoding ----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outPath = join(__dirname, "app-icon.png");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`Icon written to ${outPath} (${png.length} bytes)`);