// 本体の置き物のサムネイルを、本物のエンジンで描いて1枚のスプライトシートにする(public/catalog-thumbs.png と .json)。
// プラグインの置き物(idに「:」がある)は plugins/<id>/thumbs/<名前>.png に64x64で1枚ずつ書く(配る人が一緒に入れる)
// 置き物だけを置いた小さな架空の床を描き、置き物の無い床との差で切り抜く。同じ入力なら毎回同じバイト列になる
import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { deflateSync } from "node:zlib";
import { CATALOG } from "../src/engine/catalog.js";

const SIZE = 64, COLS = 10, root = process.cwd();
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
const PAGE = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/engine/office.css">
<div class="vo-page"><div id="root"></div></div>
<script type="module">
import { mountOffice } from "/src/engine/office.js";
let h;
// 部屋は床だけ(壁・扉・人なし)。itemを置く/置かないで2回描く
window.__render = async (item) => {
  h?.destroy();
  const map = { version: 1, name: "t", floors: [{ id: "f", name: "F", rooms: [{ id: "r", name: "R", kind: "free", rects: [[0, 0, 400, 320]], floor: "carpet" }], walls: [], doors: [], items: item ? [item] : [] }] };
  h = mountOffice(document.getElementById("root"), { map, appName: "t", t: k => k, menu: [], weather: null, weatherKind: "sunny", timeOfDay: "day", freeze: true, send: () => Promise.reject(new Error("off")),
    initial: { serverTime: "2026-01-05T03:00:00.000Z", date: "2026-01-05", meId: null, people: [], messages: [], events: [], lastEventId: 0, meetUrls: {}, autoLeftAt: null, talkingUserIds: [], talkingRooms: [], emotes: [], isAdmin: false, season: null } });
  document.getElementById("zoomFit").click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))));
  const c = h.worldCanvas(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  let s = ""; for (let i = 0; i < d.data.length; i += 0x8000) s += String.fromCharCode(...d.data.subarray(i, i + 0x8000));
  return { w: c.width, h: c.height, b64: btoa(s) };
};
window.__ready = true;
</script>`;

// RGBAの生データをPNGにする(フィルタなし・zlib固定。ブラウザのエンコーダに頼らないので毎回同じバイト列)
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); b.copy(o, 4); o.writeUInt32BE(crc(b), 8 + d.length); return o; };
export const png = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
};

const server = createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/") return res.writeHead(200, { "content-type": MIME[".html"] }).end(PAGE);
  try {
    const f = join(root, normalize(p));
    if (!f.startsWith(root)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
await new Promise(r => server.once("listening", r));

const browser = await puppeteer.launch({ headless: true, args: ["--force-device-scale-factor=1", "--font-render-hinting=none", "--disable-lcd-text"] });
const all = Object.keys(CATALOG), ids = all.filter(id => !id.includes(":")), sheetW = COLS * SIZE, sheetH = Math.ceil(ids.length / COLS) * SIZE, sheet = Buffer.alloc(sheetW * sheetH * 4);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", e => { throw e; });
  await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__ready === true");
  const grab = async item => { const r = await page.evaluate(i => window.__render(i), item); return { ...r, px: Buffer.from(r.b64, "base64") }; };
  const base = await grab(null);
  for (const [n, id] of all.entries()) {
    const it = await grab({ id: "i", type: id, x: 150, y: 110, dir: CATALOG[id].dirs[0] });
    // 置き物の画素 = 床だけの絵と違う画素
    let x0 = it.w, y0 = it.h, x1 = -1, y1 = -1;
    for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) {
      const o = (y * it.w + x) * 4;
      if (it.px.compare(base.px, o, o + 4, o, o + 4) !== 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) throw new Error(`${id}: 床との差が無い`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, k = Math.min(SIZE / w, SIZE / h);
    const at = (x, y) => (y * it.w + x) * 4;
    const inItem = (x, y) => it.px.compare(base.px, at(x, y), at(x, y) + 4, at(x, y), at(x, y) + 4) !== 0;
    // 切り抜き: 差のある画素だけ残し、ほかは透明
    const crop = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inItem(x0 + x, y0 + y)) { const o = at(x0 + x, y0 + y), q = (y * w + x) * 4; it.px.copy(crop, q, o, o + 3); crop[q + 3] = 255; }
    // 拡大は整数倍、収まらないときだけ縮小(区間の平均。αで重み付け)
    const tw = k >= 1 ? w * Math.floor(k) : Math.max(1, Math.round(w * k)), th = k >= 1 ? h * Math.floor(k) : Math.max(1, Math.round(h * k));
    // 1マス分(64x64)に描いてから、シートか個別のPNGに回す
    const tile = Buffer.alloc(SIZE * SIZE * 4), ox = (SIZE - tw) >> 1, oy = (SIZE - th) >> 1;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor((tx * w) / tw), sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * w) / tw)), sy0 = Math.floor((ty * h) / th), sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * h) / th));
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) { const q = (sy * w + sx) * 4; c++; if (crop[q + 3]) { r += crop[q]; g += crop[q + 1]; b += crop[q + 2]; a++; } }
      if (a * 2 < c) continue; // 半分以上が透明なら透明のまま
      const o = ((oy + ty) * SIZE + ox + tx) * 4;
      tile[o] = Math.round(r / a); tile[o + 1] = Math.round(g / a); tile[o + 2] = Math.round(b / a); tile[o + 3] = 255;
    }
    if (id.includes(":")) {
      const [pid, name] = id.split(":");
      await mkdir(`plugins/${pid}/thumbs`, { recursive: true });
      await writeFile(`plugins/${pid}/thumbs/${name}.png`, png(SIZE, SIZE, tile));
    } else for (let y = 0; y < SIZE; y++) tile.copy(sheet, (((Math.floor(n / COLS)) * SIZE + y) * sheetW + (n % COLS) * SIZE) * 4, y * SIZE * 4, (y + 1) * SIZE * 4);
    console.log(id.padEnd(18), `${w}x${h} -> ${tw}x${th}`);
  }
} finally {
  await browser.close();
  server.close();
}

await writeFile("public/catalog-thumbs.png", png(sheetW, sheetH, sheet));
await writeFile("public/catalog-thumbs.json", JSON.stringify({ size: SIZE, cols: COLS, ids }) + "\n");
console.log(`public/catalog-thumbs.png ${sheetW}x${sheetH}, ${ids.length} ids`);
