import type { Dir, MapFloor } from "@/engine/map.js";
import PLUGIN_THUMBS from "../../plugins/generated/thumbs.json" with { type: "json" };
import { footprint, footprintOf, G, ROOM_COLOR, type Seg, type Sel } from "./shared";

export type Thumbs = { img: HTMLImageElement; size: number; cols: number; idx: Map<string, number> };
/** プラグインが同梱したサムネイル(plugins/<id>/thumbs/*.png)。本体のシートに無いidだけ使う */
export const pluginThumbs = PLUGIN_THUMBS as Record<string, string>;
const plugImgs = new Map<string, HTMLImageElement>();
export function pluginImg(id: string): HTMLImageElement | undefined {
  if (!Object.hasOwn(pluginThumbs, id)) return undefined;
  let img = plugImgs.get(id);
  if (!img) { img = new Image(); img.src = pluginThumbs[id]; plugImgs.set(id, img); }
  return img;
}
export type DrawIn = {
  w: number; h: number; dpr: number; view: { x: number; y: number; z: number };
  floor: MapFloor; sel: Sel; hover: Sel; bad: Set<string>; warn: Set<string>; flash: Set<string>;
  seats: { x: number; y: number }[]; thumbs: Thumbs | null; lab: (type: string) => string;
  ghost: { k: "rect" | "wall"; r: number[] } | null; snap: [number, number] | null;
  itemGhost: { type: string; dir: Dir; x: number; y: number } | null; doorGhost: (Seg & { ok: boolean }) | null;
};

const NAVY = "#34446b", RED = "#d1384c", AMBER = "#d98a00";
const WALL_COLOR: Record<string, string> = { glass: "#4aa3b5", glasslow: "#7cc0cc", window: "#4aa3b5", panel: "#7a8399", slat: "#a07c52", rail: "#b58a55", outer: "#2b3550", cut: "#3a4258" };

const line = (ctx: CanvasRenderingContext2D, w: Seg) => {
  ctx.beginPath();
  if (w.axis === "x") { ctx.moveTo(w.a, w.at); ctx.lineTo(w.b, w.at); } else { ctx.moveTo(w.at, w.a); ctx.lineTo(w.at, w.b); }
  ctx.stroke();
};
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

export function drawEditor(ctx: CanvasRenderingContext2D, o: DrawIn) {
  const { view, floor, sel, hover, bad, warn, thumbs } = o;
  const { x: vx, y: vy, z } = view;
  const px = (n: number) => n / z; // 画面上のnピクセルぶんの世界の長さ
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.fillStyle = "#f4f6fa";
  ctx.fillRect(0, 0, o.w, o.h);
  // 東西を反転して表示(エンジンの画面が左右反転のため)。vxは右端の世界x
  ctx.translate(o.w, 0);
  ctx.scale(-z, z);
  ctx.translate(-vx, -vy);
  ctx.imageSmoothingEnabled = false;
  const x1 = vx + o.w / z, y1 = vy + o.h / z;

  // 格子(縮小するとうすくなり、消える)
  const fade = Math.min(1, Math.max(0, (z - 0.28) / 0.35));
  if (fade > 0) {
    ctx.lineWidth = px(1);
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? `rgba(52,68,107,${0.16 * fade})` : `rgba(52,68,107,${0.07 * fade})`;
      ctx.beginPath();
      for (let x = Math.floor(vx / G) * G; x <= x1; x += G) if ((x % 64 === 0) === major && (major || z >= 0.55)) { ctx.moveTo(x, vy); ctx.lineTo(x, y1); }
      for (let y = Math.floor(vy / G) * G; y <= y1; y += G) if ((y % 64 === 0) === major && (major || z >= 0.55)) { ctx.moveTo(vx, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(52,68,107,.35)"; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(0, y1); ctx.moveTo(vx, 0); ctx.lineTo(x1, 0); ctx.stroke();

  // 部屋: 種類の色で塗る
  for (const r of floor.rooms) {
    const col = ROOM_COLOR[r.kind] ?? "#aaa";
    const on = sel?.k === "room" && sel.id === r.id, hov = hover?.k === "room" && hover.id === r.id;
    for (const [a, b, c, d] of r.rects) {
      ctx.fillStyle = col; ctx.globalAlpha = r.outdoor ? 0.16 : on ? 0.34 : hov ? 0.3 : 0.24; ctx.fillRect(a, b, c - a, d - b); ctx.globalAlpha = 1;
      if (r.outdoor) { ctx.save(); ctx.beginPath(); ctx.rect(a, b, c - a, d - b); ctx.clip(); ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = px(1); ctx.beginPath(); for (let k = a - (d - b); k < c; k += 12) { ctx.moveTo(k, d); ctx.lineTo(k + (d - b), b); } ctx.stroke(); ctx.restore(); }
      const isBad = bad.has(r.id), isWarn = warn.has(r.id), fl = o.flash.has(r.id);
      ctx.strokeStyle = isBad || fl ? RED : on ? NAVY : isWarn ? AMBER : col;
      ctx.globalAlpha = on || isBad || isWarn || fl || hov ? 1 : 0.8;
      ctx.lineWidth = px(on || isBad || fl ? 2.5 : hov ? 2 : 1.25);
      ctx.setLineDash(r.outdoor ? [px(6), px(4)] : []);
      ctx.strokeRect(a, b, c - a, d - b); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  // 壁・扉
  ctx.lineCap = "butt";
  floor.walls.forEach((w, i) => {
    const on = sel?.k === "wall" && sel.i === i, hov = hover?.k === "wall" && hover.i === i;
    const lw = Math.max(4, px(2.5));
    if (on || hov) { ctx.strokeStyle = on ? "rgba(52,68,107,.28)" : "rgba(52,68,107,.14)"; ctx.lineWidth = lw + px(8); line(ctx, w); }
    ctx.strokeStyle = on ? NAVY : w.kind === "none" ? "#aab2c3" : WALL_COLOR[w.kind] ?? "#3a4258";
    ctx.lineWidth = lw; ctx.setLineDash(w.kind === "none" ? [6, 4] : w.kind === "rail" ? [10, 3] : []);
    line(ctx, w); ctx.setLineDash([]);
  });
  for (const d of floor.doors) {
    const on = sel?.k === "door" && sel.id === d.id, hov = hover?.k === "door" && hover.id === d.id;
    if (on || hov) { ctx.strokeStyle = on ? "rgba(52,68,107,.28)" : "rgba(52,68,107,.14)"; ctx.lineWidth = 7 + px(8); line(ctx, d); }
    ctx.strokeStyle = on ? NAVY : "#e07b00"; ctx.lineWidth = 7; line(ctx, d);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; line(ctx, d);
  }

  // 置き物: 足もとの四角にサムネイル
  const thumb = (type: string, cx: number, cy: number, s: number, alpha = 1) => {
    const i = thumbs?.idx.get(type), pi = i === undefined ? pluginImg(type) : undefined;
    if (!(thumbs && i !== undefined) && !pi?.complete) return false;
    ctx.globalAlpha = alpha;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(-1, 1); // 画像は鏡像にしない
    if (thumbs && i !== undefined) ctx.drawImage(thumbs.img, (i % thumbs.cols) * thumbs.size, Math.floor(i / thumbs.cols) * thumbs.size, thumbs.size, thumbs.size, -s / 2, -s / 2, s, s);
    else ctx.drawImage(pi!, -s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  };
  for (const it of floor.items) {
    const [a, b, c, d] = footprint(it);
    const on = sel?.k === "item" && sel.id === it.id, hov = hover?.k === "item" && hover.id === it.id;
    const isBad = bad.has(it.id) || o.flash.has(it.id), isWarn = warn.has(it.id);
    ctx.fillStyle = on ? "rgba(52,68,107,.20)" : "rgba(120,100,70,.16)"; rr(ctx, a, b, c - a, d - b, 3); ctx.fill();
    ctx.strokeStyle = isBad ? RED : on ? NAVY : isWarn ? AMBER : hov ? "#6f7ea6" : "rgba(90,74,50,.55)"; ctx.lineWidth = px(on || isBad ? 2.5 : hov ? 2 : 1); rr(ctx, a, b, c - a, d - b, 3); ctx.stroke();
    const sz = Math.min(72, Math.max(28, Math.max(c - a, d - b) * 1.05));
    if (!thumb(it.type, (a + c) / 2, (b + d) / 2 - sz * 0.05, sz) && z > 0.35) {
      ctx.fillStyle = "#4a3a2a"; ctx.font = `${px(10)}px system-ui, sans-serif`; ctx.textBaseline = "top"; ctx.save(); ctx.translate(c, b); ctx.scale(-1, 1); ctx.fillText(o.lab(it.type), px(3), px(3)); ctx.restore();
    }
    ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = px(1); ctx.beginPath(); ctx.arc(it.x, it.y, px(2.5), 0, 7); ctx.fill(); ctx.stroke();
  }
  for (const s of o.seats) { ctx.fillStyle = "#1f9d63"; ctx.beginPath(); ctx.arc(s.x, s.y, px(4.5), 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = px(1.5); ctx.stroke(); }

  // 部屋の名前(置き物に隠れないよう、置き物のあとに描く)
  ctx.textBaseline = "middle";
  for (const r of floor.rooms) {
    const [, b, a] = r.rects[0] ?? [0, 0, 0];
    const col = ROOM_COLOR[r.kind] ?? "#aaa";
    const fs = px(11.5), padX = px(7), h = px(20);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(r.name || "-").width, w = tw + padX * 2 + px(10);
    // 画面の左上(世界のmax-x,min-y)を原点に、文字が鏡文字にならない向きで描く
    ctx.save(); ctx.translate(a, b); ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(255,255,255,.92)"; rr(ctx, px(5), px(5), w, h, px(10)); ctx.fill();
    ctx.strokeStyle = "rgba(52,68,107,.18)"; ctx.lineWidth = px(1); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px(5) + padX, px(5) + h / 2, px(3.5), 0, 7); ctx.fill();
    ctx.fillStyle = "#1e2433"; ctx.fillText(r.name || "-", px(5) + padX + px(10), px(5) + h / 2 + px(0.5));
    ctx.restore();
    if (r.sign) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(r.sign[0], r.sign[1], px(4), 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = px(1.5); ctx.stroke(); }
  }

  // 選択の取っ手(部屋の角。ドラッグで大きさを変えられる)
  if (sel?.k === "room") {
    const r = floor.rooms.find((q) => q.id === sel.id);
    for (const q of r?.rects ?? []) for (const [hx, hy] of [[q[0], q[1]], [q[2], q[1]], [q[0], q[3]], [q[2], q[3]]]) {
      const s = px(8);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = px(1.75); rr(ctx, hx - s / 2, hy - s / 2, s, s, px(2)); ctx.fill(); ctx.stroke();
    }
  }

  // ゴースト・スナップ
  if (o.ghost) {
    ctx.strokeStyle = NAVY; ctx.lineWidth = px(2); ctx.setLineDash([px(5), px(3)]);
    if (o.ghost.k === "rect") { const g = o.ghost.r; ctx.fillStyle = "rgba(52,68,107,.10)"; ctx.fillRect(g[0], g[1], g[2] - g[0], g[3] - g[1]); ctx.strokeRect(g[0], g[1], g[2] - g[0], g[3] - g[1]); }
    else { ctx.beginPath(); ctx.moveTo(o.ghost.r[0], o.ghost.r[1]); ctx.lineTo(o.ghost.r[2], o.ghost.r[3]); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (o.doorGhost) { ctx.globalAlpha = 0.75; ctx.strokeStyle = o.doorGhost.ok ? "#e07b00" : RED; ctx.lineWidth = 7; line(ctx, o.doorGhost); ctx.globalAlpha = 1; }
  if (o.itemGhost) {
    const g = o.itemGhost, [a, b, c, d] = footprintOf(g.type, g.dir, undefined, g.x, g.y);
    ctx.fillStyle = "rgba(52,68,107,.12)"; ctx.strokeStyle = NAVY; ctx.lineWidth = px(1.75); ctx.setLineDash([px(5), px(3)]);
    rr(ctx, a, b, c - a, d - b, 3); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    thumb(g.type, (a + c) / 2, (b + d) / 2, Math.min(72, Math.max(28, Math.max(c - a, d - b) * 1.05)), 0.7);
  }
  if (o.snap) {
    const [sx, sy] = o.snap, k = px(6);
    ctx.strokeStyle = NAVY; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(sx - k, sy); ctx.lineTo(sx + k, sy); ctx.moveTo(sx, sy - k); ctx.lineTo(sx, sy + k); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, px(2.5), 0, 7); ctx.fill(); ctx.stroke();
  }
}
