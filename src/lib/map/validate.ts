/** マップJSONの検証。エディタ(クライアント)と公開(サーバー)で同じものを使う。純TS */
import { CATALOG, DOOR_KINDS, FLOOR_KINDS, WALL_KINDS } from "../../engine/catalog.js";
import { seatsOf } from "../../engine/map.js";
import type { OfficeMap } from "../../engine/map.js";
import { VO_EVENT_DECORS } from "../virtual-office/events.ts";

export type Issue = { level: "error" | "warning"; floor?: string; id?: string; key: string; vars?: Record<string, string | number> };

export const MAP_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FLOORS = 5;
export const MAX_SPAN = 1024;
export const MAX_TEXT = 40;
export const ROOM_KINDS = ["work", "meeting", "break", "free", "hall"];
const DIRS = ["x+", "x-", "y+", "y-"];
const BAD_KEYS = ["__proto__", "constructor", "prototype"];
const MAX_NUM = 100000;
const MAX_PROP_NUM = 4096; // 机の数などをループに使うカタログがあるので、上限を決めて暴走させない
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_NUM;
const has = (o: object, k: string) => Object.hasOwn(o, k);

/** 入力が信用できない前提の再帰走査。__proto__などの鍵と深すぎる入れ子を見つける */
function hasBadKey(v: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (Array.isArray(v)) return v.some((x) => hasBadKey(x, depth + 1));
  if (!isRec(v)) return false;
  return Object.keys(v).some((k) => BAD_KEYS.includes(k) || hasBadKey(v[k], depth + 1));
}

/** propsの値がカタログの初期値と同じ形か(数は上限つき・文字は40字まで。配列は同じ長さ、オブジェクトは平らな辞書) */
function sameShape(def: unknown, v: unknown): boolean {
  if (def === null) return v === null || (typeof v === "string" && v.length <= MAX_TEXT);
  if (typeof def === "number") return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_PROP_NUM;
  if (typeof def === "string") return typeof v === "string" && v.length <= MAX_TEXT;
  if (typeof def === "boolean") return typeof v === "boolean";
  if (Array.isArray(def)) return Array.isArray(v) && v.length === def.length && def.every((d, i) => sameShape(d, v[i]));
  if (isRec(def)) {
    const entries = isRec(v) ? Object.entries(v) : null;
    return !!entries && entries.length <= 64 && entries.every(([, x]) => (typeof x === "string" && x.length <= MAX_TEXT) || typeof x === "boolean" || (typeof x === "number" && Math.abs(x) <= MAX_PROP_NUM));
  }
  return false;
}

const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export function validateMap(input: unknown): Issue[] {
  const out: Issue[] = [];
  const err = (key: string, f?: { id: string }, id?: string, vars?: Issue["vars"]) =>
    out.push({ level: "error", ...(f ? { floor: f.id } : {}), ...(id !== undefined ? { id } : {}), key, ...(vars ? { vars } : {}) });
  const warn = (key: string, f: { id: string }, id: string, vars?: Issue["vars"]) =>
    out.push({ level: "warning", floor: f.id, id, key, ...(vars ? { vars } : {}) });

  let size = 0;
  try { size = new TextEncoder().encode(JSON.stringify(input)).length; } catch { /* 循環などはbadTypeで落ちる */ }
  if (size > MAP_MAX_BYTES) return [{ level: "error", key: "map.err.tooLarge" }];
  if (hasBadKey(input)) return [{ level: "error", key: "map.err.forbiddenKey" }];
  if (!isRec(input) || input.version !== 1 || typeof input.name !== "string" || (input.backdrop !== "city" && input.backdrop !== "countryside") || !Array.isArray(input.floors)) {
    return [{ level: "error", key: "map.err.badType", vars: { path: "map" } }];
  }
  if (input.name.length > MAX_TEXT) err("map.err.tooLong", undefined, undefined, { path: "name" });
  const floorsIn = input.floors as unknown[];
  if (floorsIn.length === 0) err("map.err.noFloors");
  if (floorsIn.length > MAX_FLOORS) err("map.err.tooManyFloors");
  if (floorsIn.length === 0) return out;

  const bad = (path: string, f?: { id: string }, id?: string) => err("map.err.badType", f, id, { path });
  const text = (o: Rec, k: string, path: string, f?: { id: string }, id?: string, optional = false) => {
    const v = o[k];
    if (v === undefined && optional) return;
    if (typeof v !== "string") return bad(path, f, id);
    if (v.length > MAX_TEXT) err("map.err.tooLong", f, id, { path });
  };
  const seen: Record<string, Set<string>> = { floor: new Set(), room: new Set(), door: new Set(), item: new Set() };
  const idOf = (o: Rec, kind: string, f?: { id: string }): string | null => {
    if (typeof o.id !== "string" || !ID_RE.test(o.id)) { err("map.err.badId", f, typeof o.id === "string" ? o.id : undefined, { kind }); return null; }
    // 部屋・置き物のidは階をまたいで一意(在室の部屋idと、席id「置き物のid-番号」がマップ全体で使われる)
    if (seen[kind].has(o.id)) err("map.err.dupId", f, o.id, { kind });
    seen[kind].add(o.id);
    return o.id;
  };

  for (const [fi, fRaw] of floorsIn.slice(0, MAX_FLOORS + 1).entries()) {
    if (!isRec(fRaw) || !Array.isArray(fRaw.rooms) || !Array.isArray(fRaw.walls) || !Array.isArray(fRaw.doors) || !Array.isArray(fRaw.items)) { bad(`floors[${fi}]`); continue; }
    const f = fRaw as unknown as OfficeMap["floors"][number];
    const fid = { id: typeof f.id === "string" ? f.id : `#${fi}` };
    idOf(fRaw, "floor");
    text(fRaw, "name", "floor.name", fid);
    const xs: number[] = [], ys: number[] = [];
    const rects: { room: string; r: number[] }[] = [];
    const names = new Map<string, string>(); // 部屋のid→名前(メッセージには名前を出す)
    const nm = (id: string | undefined) => (id !== undefined && names.get(id)) || id || "";

    for (const r of f.rooms as unknown[]) {
      if (!isRec(r)) { bad("room", fid); continue; }
      const id = idOf(r, "room", fid) ?? undefined;
      if (id !== undefined && typeof r.name === "string") names.set(id, r.name);
      const vn = { name: nm(id) };
      text(r, "name", "room.name", fid, id);
      if (typeof r.kind !== "string" || !ROOM_KINDS.includes(r.kind)) err("map.err.badRoomKind", fid, id, vn);
      if (r.outdoor !== undefined && typeof r.outdoor !== "boolean") bad("room.outdoor", fid, id);
      if (r.floor !== undefined) {
        if (typeof r.floor !== "string") bad("room.floor", fid, id);
        else if (r.floor.length > MAX_TEXT) err("map.err.tooLong", fid, id, { path: "room.floor" });
        else if (FLOOR_KINDS.length > 0 && !FLOOR_KINDS.includes(r.floor)) err("map.err.badFloorKind", fid, id, vn);
      }
      if (r.sign !== undefined && !(Array.isArray(r.sign) && r.sign.length === 2 && r.sign.every(num))) bad("room.sign", fid, id);
      if (r.signMount !== undefined && r.signMount !== "floor" && r.signMount !== "wall") bad("room.signMount", fid, id);
      if (r.signZ !== undefined && !num(r.signZ)) bad("room.signZ", fid, id);
      if (!Array.isArray(r.rects)) { bad("room.rects", fid, id); continue; }
      if (r.rects.length === 0) err("map.err.roomNoRects", fid, id, vn);
      for (const rc of r.rects) {
        if (!Array.isArray(rc) || rc.length !== 4 || !rc.every(num) || rc[0] >= rc[2] || rc[1] >= rc[3]) { err("map.err.badRect", fid, id, vn); continue; }
        rects.push({ room: id ?? "", r: rc });
        xs.push(rc[0], rc[2]); ys.push(rc[1], rc[3]);
      }
    }

    for (const [list, label] of [[f.walls, "wall"], [f.doors, "door"]] as const) {
      for (const w of list as unknown[]) {
        if (!isRec(w)) { bad(label, fid); continue; }
        const id = label === "door" ? idOf(w, "door", fid) ?? undefined : undefined;
        if ((w.axis !== "x" && w.axis !== "y") || !num(w.at) || !num(w.a) || !num(w.b) || w.a >= w.b) { bad(label, fid, id); continue; }
        const kinds: string[] = label === "wall" ? WALL_KINDS : DOOR_KINDS;
        if (typeof w.kind !== "string") bad(`${label}.kind`, fid, id);
        else if (kinds.length > 0 && !kinds.includes(w.kind)) err(label === "wall" ? "map.err.badWallKind" : "map.err.badDoorKind", fid, id);
        if (w.h !== undefined && !num(w.h)) bad(`${label}.h`, fid, id);
        for (const k of ["blinds", "frost"]) if (label === "wall" && w[k] !== undefined && typeof w[k] !== "boolean") bad(`wall.${k}`, fid);
        (w.axis === "x" ? xs : ys).push(w.a, w.b);
        (w.axis === "x" ? ys : xs).push(w.at);
      }
    }

    const boxes: { id: string; b: number[] }[] = [];
    const entrances: string[] = [];
    for (const it of f.items as unknown[]) {
      if (!isRec(it)) { bad("item", fid); continue; }
      const id = idOf(it, "item", fid) ?? undefined;
      if (!num(it.x) || !num(it.y)) { bad("item.xy", fid, id); continue; }
      xs.push(it.x); ys.push(it.y);
      if (typeof it.type !== "string" || !has(CATALOG, it.type)) { err("map.err.badItemType", fid, id); continue; }
      const c = CATALOG[it.type as keyof typeof CATALOG] as { dirs: string[]; props: Rec; boxes?: (d: string, p: Rec) => { b: number[]; block?: boolean }[] };
      if (typeof it.dir !== "string" || !DIRS.includes(it.dir) || !c.dirs.includes(it.dir)) { err("map.err.badDir", fid, id); continue; }
      if (it.season !== undefined && (typeof it.season !== "string" || !VO_EVENT_DECORS.some((e) => e.id === it.season))) err("map.err.badSeason", fid, id);
      if (it.props !== undefined && !isRec(it.props)) { bad("item.props", fid, id); continue; }
      const props = (it.props ?? {}) as Rec;
      let propsOk = true;
      for (const k of Object.keys(props)) {
        if (!has(c.props, k) || !sameShape(c.props[k], props[k])) { err("map.err.badProp", fid, id, { prop: k }); propsOk = false; }
      }
      if (!propsOk) continue;
      if (props.entrance === true) entrances.push(it.type);
      try {
        for (const { b, block } of c.boxes?.(it.dir, { ...c.props, ...props }) ?? []) {
          if (block !== false) boxes.push({ id: id ?? "", b: [it.x + b[0], it.y + b[1], it.x + b[3], it.y + b[4], b[2], b[5]] });
        }
      } catch { bad("item.props", fid, id); }
    }
    if (!entrances.some((t) => (CATALOG[t as keyof typeof CATALOG] as Rec).entrance)) err("map.err.noEntrance", fid);

    if (xs.length > 0 && (Math.max(...xs) - Math.min(...xs) > MAX_SPAN || Math.max(...ys) - Math.min(...ys) > MAX_SPAN)) err("map.err.bboxTooLarge", fid);

    // 重なり: 部屋の矩形どうし(同じ部屋の中も)、置き物のブロックする箱(別の置き物どうし)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (overlap(rects[i].r, rects[j].r)) err("map.err.roomOverlap", fid, rects[i].room, { name: nm(rects[i].room), other: nm(rects[j].room) });
    }
    boxes.sort((p, q) => p.b[0] - q.b[0]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length && boxes[j].b[0] < boxes[i].b[2]; j++) {
      const [p, q] = [boxes[i], boxes[j]];
      if (p.id !== q.id && overlap(p.b, q.b) && p.b[4] < q.b[5] && q.b[4] < p.b[5]) err("map.err.itemOverlap", fid, p.id, { other: q.id });
    }
  }

  // 警告は、型が正しいマップだけ(seatsOfは信用できる形を前提にしている)
  if (out.some((i) => i.level === "error" && /^map\.err\.(badType|badId|badItemType|badDir|badProp|badRect|roomNoRects|badRoomKind)$/.test(i.key))) return out;
  const m = input as unknown as OfficeMap;
  try {
    const got = new Set(seatsOf(m).map((s: { id: string }) => s.id));
    for (const f of m.floors) {
      for (const it of f.items) {
        const c = CATALOG[it.type as keyof typeof CATALOG] as { props: Rec; seats?: (d: string, p: Rec) => unknown[] };
        const n = c.seats?.(it.dir, { ...c.props, ...it.props }).length ?? 0;
        for (let i = 1; i <= n; i++) if (!got.has(`${it.id}-${i}`)) warn("map.warn.seatOutside", f, it.id, { no: i });
      }
      for (const r of f.rooms) {
        const touches = f.doors.some((d) => r.rects.some(([x0, y0, x1, y1]) => d.axis === "y"
          ? (d.at === x0 || d.at === x1) && d.a < y1 && d.b > y0
          : (d.at === y0 || d.at === y1) && d.a < x1 && d.b > x0));
        if (!touches) warn("map.warn.roomNoDoor", f, r.id, { name: r.name || r.id });
      }
    }
  } catch { err("map.err.badType", undefined, undefined, { path: "items" }); }
  return out;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

/** 下書きの保存と読み込みに最低限必要な形(エラーが残っていてもよい)。2MB以内・禁止の鍵なし・version 1・floorsが配列 */
export function looksLikeMap(input: unknown): input is OfficeMap {
  if (!isRec(input) || input.version !== 1 || !Array.isArray(input.floors) || hasBadKey(input)) return false;
  try { return new TextEncoder().encode(JSON.stringify(input)).length <= MAP_MAX_BYTES; } catch { return false; }
}
