import { CATALOG } from "@/engine/catalog.js";
import type { Dir, MapFloor, MapItem, OfficeMap } from "@/engine/map.js";
import { MAX_SPAN } from "@/lib/map/validate";

export type CatalogEntry = { cat?: string; entrance?: unknown; seats?: unknown; dirs: Dir[]; props: Record<string, unknown>; boxes?: (d: Dir, p: Record<string, unknown>) => { b: number[]; block?: boolean }[] };
export const catOf = (type: string): CatalogEntry | undefined => (Object.hasOwn(CATALOG, type) ? (CATALOG as unknown as Record<string, CatalogEntry>)[type] : undefined);
export const TYPES = Object.keys(CATALOG);
export const G = 16;
export const s16 = (v: number) => Math.round(v / G) * G;
export const s8 = (v: number) => Math.round(v / 8) * 8;
/** 表札の初期位置(サンプルと同じ左下寄り)。小さい部屋でも矩形の中に収める */
export const defaultSign = ([x0, y0, x1, y1]: number[]): [number, number] => [Math.min(Math.max(s8(x0 + 8), x0), x1 - 1), Math.min(Math.max(s8(y1 - 16), y0), y1 - 1)];

export const ROOM_COLOR: Record<string, string> = { work: "#5b86d6", meeting: "#e8955a", break: "#5fa84a", free: "#e9b92f", hall: "#8e96a8" };
export const TOOLS = ["select", "room", "wall", "door", "item"] as const;
export type Tool = (typeof TOOLS)[number];
export const TOOL_KEY: Record<Tool, string> = { select: "V", room: "2", wall: "3", door: "4", item: "5" };
export type Sel = { k: "room"; id: string } | { k: "item"; id: string } | { k: "door"; id: string } | { k: "wall"; i: number } | null;
export type Seg = { axis: "x" | "y"; at: number; a: number; b: number };

export const CAT_ORDER = ["desk", "meeting", "lounge", "storage", "decor", "facility", "season"];
export const catKey = (type: string) => catOf(type)?.cat ?? "other";

/** 階のbbox(部屋・壁・置き物)が1024を超えるか。超える編集は取り消す */
export function tooBig(f: MapFloor): boolean {
  const xs: number[] = [], ys: number[] = [];
  for (const r of f.rooms) for (const [a, b, c, d] of r.rects) { xs.push(a, c); ys.push(b, d); }
  for (const w of f.walls) { (w.axis === "x" ? xs : ys).push(w.a, w.b); (w.axis === "x" ? ys : xs).push(w.at); }
  for (const i of f.items) { xs.push(i.x); ys.push(i.y); }
  return xs.length > 0 && (Math.max(...xs) - Math.min(...xs) > MAX_SPAN || Math.max(...ys) - Math.min(...ys) > MAX_SPAN);
}

export function newId(map: OfficeMap): string {
  const used = new Set(map.floors.flatMap((f) => [f.id, ...f.rooms.map((r) => r.id), ...f.doors.map((d) => d.id), ...f.items.map((i) => i.id)]));
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6);
    if (id.length === 4 && !used.has(id)) return id;
  }
}

/** 置き物の足もと(全boxの外接)。boxのない置き物は小さい四角 */
export function footprintOf(type: string, dir: Dir, props: Record<string, unknown> | undefined, x: number, y: number): [number, number, number, number] {
  const c = catOf(type);
  let bs: { b: number[] }[] = [];
  try { bs = c?.boxes?.(dir, { ...c.props, ...props }) ?? []; } catch { /* 不正なpropsは検証が拾う */ }
  if (bs.length === 0) return [x - 8, y - 8, x + 8, y + 8];
  return [x + Math.min(...bs.map((b) => b.b[0])), y + Math.min(...bs.map((b) => b.b[1])), x + Math.max(...bs.map((b) => b.b[3])), y + Math.max(...bs.map((b) => b.b[4]))];
}
export const footprint = (it: MapItem) => footprintOf(it.type, it.dir, it.props, it.x, it.y);

export const segDist = (px: number, py: number, w: Seg) => {
  const [u, v] = w.axis === "x" ? [px, py] : [py, px];
  return Math.hypot(Math.max(w.a - u, 0, u - w.b), v - w.at);
};

/** 扉の位置。壁wの上でカーソルu(軸方向の座標)を中心に幅dwで置く */
export const doorOn = (w: Seg, x: number, y: number, dw: number) => {
  const u = w.axis === "x" ? x : y;
  const a = Math.min(Math.max(s16(u - dw / 2), w.a), Math.max(w.a, w.b - dw));
  return { axis: w.axis, at: w.at, a, b: Math.min(a + dw, w.b) };
};

/** 向きの矢印(左右反転した平面上の向き)。上向きの矢印を何度回すか */
export const DIR_ANGLE: Record<string, number> = { "x+": 270, "y+": 180, "x-": 90, "y-": 0 };

/** 選んだ部屋の矩形の角(リサイズの取っ手)。cx/cy: 0=小さい側 1=大きい側 */
export function handleAt(room: { rects: number[][] }, x: number, y: number, z: number): { ri: number; cx: 0 | 1; cy: 0 | 1 } | null {
  const tol = 9 / z;
  for (const [ri, r] of room.rects.entries()) for (const cx of [0, 1] as const) for (const cy of [0, 1] as const) {
    if (Math.hypot(x - r[cx ? 2 : 0], y - r[cy ? 3 : 1]) <= tol) return { ri, cx, cy };
  }
  return null;
}
