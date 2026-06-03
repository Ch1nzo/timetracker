// Generates a 1024×1024 source PNG for the TimeTracker app icon — no deps.
// A brand-green rounded square (transparent corners) with a white timer glyph.
// Rendered at 4× and box-downsampled (premultiplied) for clean anti-aliasing.
//
//   node scripts/generate-icon.mjs            -> writes scripts/.icon-source.png
// then: npx tauri icon scripts/.icon-source.png -o src-tauri/icons
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const OUT = 1024;
const SS = 4;
const W = OUT * SS;
const H = OUT * SS;
const buf = new Uint8Array(W * H * 4); // straight RGBA, transparent

const GREEN = [52, 211, 153];
const WHITE = [255, 255, 255];

function setPx(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

// Filled rounded rectangle (hard edges; AA comes from downsampling).
function roundRect(x0, y0, x1, y1, rad, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let inside = true;
      const corners = [
        [x0 + rad, y0 + rad], [x1 - rad, y0 + rad],
        [x0 + rad, y1 - rad], [x1 - rad, y1 - rad],
      ];
      if (x < x0 + rad && y < y0 + rad) inside = dist(x, y, ...corners[0]) <= rad;
      else if (x >= x1 - rad && y < y0 + rad) inside = dist(x, y, ...corners[1]) <= rad;
      else if (x < x0 + rad && y >= y1 - rad) inside = dist(x, y, ...corners[2]) <= rad;
      else if (x >= x1 - rad && y >= y1 - rad) inside = dist(x, y, ...corners[3]) <= rad;
      if (inside) setPx(x, y, color);
    }
  }
}
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Annulus (ring) stroke.
function ring(cx, cy, rOuter, rInner, color) {
  for (let y = cy - rOuter; y <= cy + rOuter; y++) {
    for (let x = cx - rOuter; x <= cx + rOuter; x++) {
      const d = dist(x, y, cx, cy);
      if (d <= rOuter && d >= rInner) setPx(x, y, color);
    }
  }
}

function discC(cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if (dist(x, y, cx, cy) <= r) setPx(x, y, color);
}

// Thick line with round caps.
function line(x0, y0, x1, y1, width, color) {
  const half = width / 2;
  const minx = Math.min(x0, x1) - half, maxx = Math.max(x0, x1) + half;
  const miny = Math.min(y0, y1) - half, maxy = Math.max(y0, y1) + half;
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      let t = ((x - x0) * dx + (y - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + t * dx, py = y0 + t * dy;
      if (dist(x, y, px, py) <= half) setPx(x, y, color);
    }
  }
}

const s = (v) => Math.round(v * SS);

// --- compose -----------------------------------------------------------
roundRect(s(88), s(88), s(936), s(936), s(196), GREEN);

const cx = s(512), cy = s(548);
const rOuter = s(252), rInner = s(200);
ring(cx, cy, rOuter, rInner, WHITE);                 // clock face
roundRect(s(437), s(214), s(587), s(262), s(24), WHITE); // top start button
line(s(512), s(262), s(512), s(300), s(34), WHITE);  // button stem
line(s(512), s(548), s(512), s(398), s(46), WHITE);  // minute hand (up)
line(s(512), s(548), s(632), s(470), s(46), WHITE);  // hour hand (upper-right)
discC(cx, cy, s(34), WHITE);                          // hub

// --- premultiplied box downsample -> OUT×OUT ---------------------------
const out = new Uint8Array(OUT * OUT * 4);
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    let sa = 0, sr = 0, sg = 0, sb = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = (((oy * SS + dy) * W) + (ox * SS + dx)) * 4;
        const a = buf[i + 3];
        sa += a; sr += buf[i] * a; sg += buf[i + 1] * a; sb += buf[i + 2] * a;
      }
    }
    const n = SS * SS;
    const oi = (oy * OUT + ox) * 4;
    const a = Math.round(sa / n);
    out[oi + 3] = a;
    if (sa > 0) {
      out[oi] = Math.round(sr / sa);
      out[oi + 1] = Math.round(sg / sa);
      out[oi + 2] = Math.round(sb / sa);
    }
  }
}

// --- encode PNG --------------------------------------------------------
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
const raw = Buffer.alloc(OUT * (OUT * 4 + 1));
for (let y = 0; y < OUT; y++) {
  raw[y * (OUT * 4 + 1)] = 0; // filter: none
  out.subarray(y * OUT * 4, (y + 1) * OUT * 4).forEach((v, k) => {
    raw[y * (OUT * 4 + 1) + 1 + k] = v;
  });
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const dest = new URL(".icon-source.png", import.meta.url);
writeFileSync(dest, png);
console.log("wrote", dest.pathname, png.length, "bytes");
