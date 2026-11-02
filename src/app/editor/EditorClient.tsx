"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, DOOR_KINDS, FLOOR_KINDS, WALL_KINDS } from "@/engine/catalog.js";
import { seatsOf } from "@/engine/map.js";
import type { Dir, MapFloor, MapItem, MapRoom, OfficeMap, Rect } from "@/engine/map.js";
import { t as tr, type Locale } from "@/i18n";
import type { Version } from "./store";
import { hasErrors, looksLikeMap, MAX_FLOORS, MAX_SPAN, ROOM_KINDS, validateMap, type Issue } from "@/lib/map/validate";
import { VO_EVENT_DECORS } from "@/lib/virtual-office/events";

import Preview from "./Preview";
import type { EditorStore } from "./store";
import { emptyMap } from "@/lib/map/empty";

type Cat = { entrance?: unknown; dirs: Dir[]; props: Record<string, unknown>; boxes?: (d: Dir, p: Record<string, unknown>) => { b: number[]; block?: boolean }[] };
const catOf = (type: string): Cat | undefined => (Object.hasOwn(CATALOG, type) ? (CATALOG as unknown as Record<string, Cat>)[type] : undefined);
const TYPES = Object.keys(CATALOG);
const G = 16;
const s16 = (v: number) => Math.round(v / G) * G;
const s8 = (v: number) => Math.round(v / 8) * 8;
const ROOM_COLOR: Record<string, string> = { work: "#6b95d6", meeting: "#e8955a", break: "#6dab50", free: "#f4c651", hall: "#a0a4ad" };
const TOOLS = ["room", "wall", "door", "item"] as const;
type Tool = (typeof TOOLS)[number];
type Sel = { k: "room"; id: string } | { k: "item"; id: string } | { k: "door"; id: string } | { k: "wall"; i: number } | null;
type H = { map: OfficeMap; past: string[]; future: string[]; key: string };

/** 階のbbox(部屋・壁・置き物)が1024を超えるか。超える編集は取り消す */
function tooBig(f: MapFloor): boolean {
  const xs: number[] = [], ys: number[] = [];
  for (const r of f.rooms) for (const [a, b, c, d] of r.rects) { xs.push(a, c); ys.push(b, d); }
  for (const w of f.walls) { (w.axis === "x" ? xs : ys).push(w.a, w.b); (w.axis === "x" ? ys : xs).push(w.at); }
  for (const i of f.items) { xs.push(i.x); ys.push(i.y); }
  return xs.length > 0 && (Math.max(...xs) - Math.min(...xs) > MAX_SPAN || Math.max(...ys) - Math.min(...ys) > MAX_SPAN);
}

function newId(map: OfficeMap): string {
  const used = new Set(map.floors.flatMap((f) => [f.id, ...f.rooms.map((r) => r.id), ...f.doors.map((d) => d.id), ...f.items.map((i) => i.id)]));
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6);
    if (id.length === 4 && !used.has(id)) return id;
  }
}

/** 置き物の足もと(全boxの外接)。boxのない置き物は小さい四角 */
function footprint(it: MapItem): [number, number, number, number] {
  const c = catOf(it.type);
  let bs: { b: number[] }[] = [];
  try { bs = c?.boxes?.(it.dir, { ...c.props, ...it.props }) ?? []; } catch { /* 不正なpropsは検証が拾う */ }
  if (bs.length === 0) return [it.x - 8, it.y - 8, it.x + 8, it.y + 8];
  return [it.x + Math.min(...bs.map((x) => x.b[0])), it.y + Math.min(...bs.map((x) => x.b[1])), it.x + Math.max(...bs.map((x) => x.b[3])), it.y + Math.max(...bs.map((x) => x.b[4]))];
}

const segDist = (px: number, py: number, w: { axis: "x" | "y"; at: number; a: number; b: number }) => {
  const [u, v] = w.axis === "x" ? [px, py] : [py, px];
  return Math.hypot(Math.max(w.a - u, 0, u - w.b), v - w.at);
};

const line = (ctx: CanvasRenderingContext2D, w: { axis: "x" | "y"; at: number; a: number; b: number }) => {
  ctx.beginPath();
  if (w.axis === "x") { ctx.moveTo(w.a, w.at); ctx.lineTo(w.b, w.at); } else { ctx.moveTo(w.at, w.a); ctx.lineTo(w.at, w.b); }
  ctx.stroke();
};

const box = "rounded border border-neutral-400 px-2 py-1";
const btn = "rounded border border-neutral-500 bg-white px-2 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40";
const btnOn = "rounded border border-blue-700 bg-blue-700 px-2 py-1 text-sm text-white";

export function EditorClient({ store, locale, backHref, previewSrc = "/editor/preview", autosave = false, sample }: { store: EditorStore; locale: Locale; backHref?: string; previewSrc?: string; autosave?: boolean; sample?: OfficeMap }) {
  const T = useCallback((k: string, v?: Record<string, string | number>) => tr(locale, k, v), [locale]);
  /** 名前の辞書にあればそれ、なければ記号のまま */
  const lab = useCallback((prefix: string, k: string) => { const s = tr(locale, prefix + k); return s === prefix + k ? k : s; }, [locale]);

  const [h, setH] = useState<H>({ map: emptyMap(), past: [], future: [], key: "" });
  const map = h.map;
  const [fi0, setFi] = useState(0);
  const fi = Math.min(fi0, map.floors.length - 1);
  const floor = map.floors[fi];
  const [tool, setTool] = useState<Tool>("room");
  const [sel, setSel] = useState<Sel>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [wallKind, setWallKind] = useState<string>(WALL_KINDS[0] ?? "");
  const [doorKind, setDoorKind] = useState<string>(DOOR_KINDS[0] ?? "");
  const [doorW, setDoorW] = useState(32);
  const [signPick, setSignPick] = useState(false);
  const [view, setView] = useState({ x: -32, y: -32, z: 1 });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [ghost, setGhost] = useState<{ k: "rect" | "wall"; r: number[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [dlg, setDlg] = useState<null | "publish" | "versions" | "sample">(null);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<null | { t: "pan" | "rect" | "wall" | "move"; sx: number; sy: number; x: number; y: number; id?: string; ox?: number; oy?: number; moved?: boolean }>(null);
  const space = useRef(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const dragSeq = useRef(0);

  /** 編集の入口。keyが前回と同じなら履歴を足さない(ドラッグや入力中の連続編集)。階が1024を超える編集は捨てる */
  const edit = useCallback((fn: (m: OfficeMap) => void, key = "") => {
    setH((s) => {
      const m = structuredClone(s.map);
      fn(m);
      if (m.floors.some(tooBig)) return s;
      const past = key && key === s.key ? s.past : [...s.past, JSON.stringify(s.map)].slice(-100);
      return { map: m, past, future: [], key };
    });
    setDirty(true);
  }, []);
  const undo = useCallback(() => {
    setH((s) => (s.past.length === 0 ? s : { map: JSON.parse(s.past[s.past.length - 1]), past: s.past.slice(0, -1), future: [...s.future, JSON.stringify(s.map)], key: "" }));
    setDirty(true);
  }, []);
  const redo = useCallback(() => {
    setH((s) => (s.future.length === 0 ? s : { map: JSON.parse(s.future[s.future.length - 1]), future: s.future.slice(0, -1), past: [...s.past, JSON.stringify(s.map)], key: "" }));
    setDirty(true);
  }, []);
  const load = useCallback((m: OfficeMap) => { edit((x) => { x.version = m.version; x.name = m.name; x.backdrop = m.backdrop; x.floors = m.floors; }); setFi(0); setSel(null); }, [edit]);
  const fl = (m: OfficeMap) => m.floors[fi];

  const issues = useMemo(() => validateMap(map), [map]);
  const seats = useMemo(() => { try { return hasErrors(issues) ? [] : seatsOf(map).filter((s: { floor: string }) => s.floor === floor.id); } catch { return []; } }, [map, issues, floor.id]);

  // ---- 描画 ----
  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { x: vx, y: vy, z } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#f5f3ee";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(z, z);
    ctx.translate(-vx, -vy);
    const x1 = vx + size.w / z, y1 = vy + size.h / z;
    if (z >= 0.4) {
      for (let x = Math.floor(vx / G) * G; x <= x1; x += G) { ctx.strokeStyle = x % 64 === 0 ? "#c9c5ba" : "#e3e0d7"; ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.moveTo(x, vy); ctx.lineTo(x, y1); ctx.stroke(); }
      for (let y = Math.floor(vy / G) * G; y <= y1; y += G) { ctx.strokeStyle = y % 64 === 0 ? "#c9c5ba" : "#e3e0d7"; ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.moveTo(vx, y); ctx.lineTo(x1, y); ctx.stroke(); }
    }
    ctx.strokeStyle = "#444"; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(0, y1); ctx.moveTo(vx, 0); ctx.lineTo(x1, 0); ctx.stroke();
    const bad = new Set(issues.filter((i) => i.level === "error" && (i.floor === floor.id || !i.floor)).map((i) => i.id));
    const warn = new Set(issues.filter((i) => i.level === "warning" && i.floor === floor.id).map((i) => i.id));
    const px = 12 / z;
    ctx.font = `${px}px sans-serif`; ctx.textBaseline = "top";
    for (const r of floor.rooms) {
      for (const [a, b, c2, d] of r.rects) {
        ctx.fillStyle = ROOM_COLOR[r.kind] ?? "#ccc"; ctx.globalAlpha = r.outdoor ? 0.18 : 0.35; ctx.fillRect(a, b, c2 - a, d - b); ctx.globalAlpha = 1;
        const on = sel?.k === "room" && sel.id === r.id;
        ctx.strokeStyle = bad.has(r.id) ? "#d00" : on ? "#0645ad" : warn.has(r.id) ? "#d98a00" : "#6b6b6b";
        ctx.lineWidth = (on || bad.has(r.id) ? 3 : 1) / z; ctx.strokeRect(a, b, c2 - a, d - b);
      }
      const [a, b] = r.rects[0] ?? [0, 0];
      ctx.fillStyle = "#222"; ctx.fillText(r.name, a + 3 / z, b + 3 / z);
      if (r.sign) { ctx.fillStyle = "#c00"; ctx.fillRect(r.sign[0] - 3, r.sign[1] - 3, 6, 6); }
    }
    floor.walls.forEach((w, i) => {
      ctx.strokeStyle = sel?.k === "wall" && sel.i === i ? "#0645ad" : w.kind === "none" ? "#aaa" : w.kind.startsWith("glass") || w.kind === "window" ? "#3aa" : "#333";
      ctx.lineWidth = 4; ctx.setLineDash(w.kind === "none" ? [6, 4] : []);
      line(ctx, w); ctx.setLineDash([]);
    });
    for (const d of floor.doors) {
      ctx.strokeStyle = sel?.k === "door" && sel.id === d.id ? "#0645ad" : "#e07b00"; ctx.lineWidth = 7;
      line(ctx, d);
    }
    for (const it of floor.items) {
      const [a, b, c2, d] = footprint(it);
      ctx.fillStyle = "#8a6a4a"; ctx.globalAlpha = 0.55; ctx.fillRect(a, b, c2 - a, d - b); ctx.globalAlpha = 1;
      const on = sel?.k === "item" && sel.id === it.id;
      ctx.strokeStyle = bad.has(it.id) ? "#d00" : on ? "#0645ad" : warn.has(it.id) ? "#d98a00" : "#4a3a2a"; ctx.lineWidth = (on || bad.has(it.id) ? 3 : 1) / z; ctx.strokeRect(a, b, c2 - a, d - b);
      ctx.fillStyle = "#111"; ctx.font = `${10 / z}px sans-serif`; ctx.fillText(lab("catalog.", it.type), a + 2 / z, b + 2 / z);
      ctx.fillStyle = "#fff"; ctx.fillRect(it.x - 1.5, it.y - 1.5, 3, 3); // 原点
    }
    for (const s of seats) { ctx.fillStyle = "#1a8a3a"; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1 / z; ctx.stroke(); }
    if (ghost) { ctx.strokeStyle = "#0645ad"; ctx.lineWidth = 2 / z; ctx.setLineDash([4 / z, 3 / z]); if (ghost.k === "rect") ctx.strokeRect(ghost.r[0], ghost.r[1], ghost.r[2] - ghost.r[0], ghost.r[3] - ghost.r[1]);
      else { ctx.beginPath(); ctx.moveTo(ghost.r[0], ghost.r[1]); ctx.lineTo(ghost.r[2], ghost.r[3]); ctx.stroke(); }
      ctx.setLineDash([]); }
  }, [view, size, floor, sel, issues, seats, ghost, lab]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const z = Math.min(4, Math.max(0.15, v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const wx = (e.clientX - r.left) / v.z + v.x, wy = (e.clientY - r.top) / v.z + v.y;
        return { z, x: wx - (e.clientX - r.left) / z, y: wy - (e.clientY - r.top) / z };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", wheel); };
  }, []);

  useEffect(() => {
    const warnLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warnLeave);
    return () => window.removeEventListener("beforeunload", warnLeave);
  }, [dirty]);

  // ---- 操作 ----
  const world = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / view.z + view.x, (e.clientY - r.top) / view.z + view.y];
  };
  const hitItem = (x: number, y: number) => [...floor.items].reverse().find((it) => { const [a, b, c, d] = footprint(it); return x >= a && x <= c && y >= b && y <= d; });
  const hitWall = (x: number, y: number) => floor.walls.findIndex((w) => segDist(x, y, w) <= Math.max(4, 6 / view.z));
  const hitDoor = (x: number, y: number) => floor.doors.find((d) => segDist(x, y, d) <= Math.max(4, 6 / view.z));
  const hitRoom = (x: number, y: number) => [...floor.rooms].reverse().find((r) => r.rects.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d));

  const onDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    const [x, y] = world(e);
    const base = { sx: e.clientX, sy: e.clientY, x, y };
    if (e.button === 1 || e.button === 2 || space.current) { drag.current = { ...base, t: "pan", ox: view.x, oy: view.y }; return; }
    if (signPick && sel?.k === "room") { edit((m) => { const r = fl(m).rooms.find((r) => r.id === sel.id); if (r) r.sign = [s8(x), s8(y)]; }); setSignPick(false); return; }
    if (tool === "room") drag.current = { ...base, t: "rect" };
    else if (tool === "wall") drag.current = { ...base, t: "wall" };
    else if (tool === "door") {
      const d = hitDoor(x, y);
      if (d) { setSel({ k: "door", id: d.id }); return; }
      const wi = hitWall(x, y);
      if (wi < 0) { setSel(null); return; }
      const w = floor.walls[wi];
      const u = w.axis === "x" ? x : y;
      const a = Math.min(Math.max(s16(u - doorW / 2), w.a), Math.max(w.a, w.b - doorW));
      const id = newId(map);
      edit((m) => { fl(m).doors.push({ id, axis: w.axis, at: w.at, a, b: Math.min(a + doorW, w.b), kind: doorKind }); });
      setSel({ k: "door", id });
    } else {
      const it = hitItem(x, y);
      if (it) { setSel({ k: "item", id: it.id }); drag.current = { ...base, t: "move", id: it.id, ox: it.x - x, oy: it.y - y }; dragSeq.current++; return; }
      const c = palette ? catOf(palette) : undefined;
      if (!palette || !c) { setSel(null); return; }
      const id = newId(map);
      edit((m) => { fl(m).items.push({ id, type: palette, x: s8(x), y: s8(y), dir: c.dirs[0], ...(Object.hasOwn(c, "entrance") ? { props: { entrance: true } } : {}) }); });
      setSel({ k: "item", id });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = world(e);
    const far = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4;
    if (d.t === "pan") setView((v) => ({ ...v, x: d.ox! - (e.clientX - d.sx) / v.z, y: d.oy! - (e.clientY - d.sy) / v.z }));
    else if (d.t === "rect") { if (far) setGhost({ k: "rect", r: [Math.min(Math.floor(d.x / G), Math.floor(x / G)) * G, Math.min(Math.floor(d.y / G), Math.floor(y / G)) * G, (Math.max(Math.floor(d.x / G), Math.floor(x / G)) + 1) * G, (Math.max(Math.floor(d.y / G), Math.floor(y / G)) + 1) * G] }); }
    else if (d.t === "wall") { if (far) setGhost({ k: "wall", r: wallSeg(d.x, d.y, x, y) }); }
    else if (d.t === "move") { d.moved = true; edit((m) => { const it = fl(m).items.find((i) => i.id === d.id); if (it) { it.x = s8(x + d.ox!); it.y = s8(y + d.oy!); } }, `drag${dragSeq.current}`); }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const g = ghost;
    setGhost(null);
    if (!d) return;
    const [x, y] = world(e);
    if (d.t === "rect") {
      if (g?.k === "rect") {
        const r = g.r as Rect;
        const target = sel?.k === "room" ? floor.rooms.find((q) => q.id === sel.id) : undefined;
        if (target) edit((m) => { fl(m).rooms.find((q) => q.id === target.id)?.rects.push(r); });
        else {
          const id = newId(map);
          edit((m) => { fl(m).rooms.push({ id, name: `${T("editor.room")} ${floor.rooms.length + 1}`, kind: "work", rects: [r] }); });
          setSel({ k: "room", id });
        }
      } else { const r = hitRoom(x, y); setSel(r ? { k: "room", id: r.id } : null); }
    } else if (d.t === "wall") {
      if (g?.k === "wall") { const [a, b, c, dd] = g.r; edit((m) => { fl(m).walls.push(a === c ? { axis: "y", at: a, a: Math.min(b, dd), b: Math.max(b, dd), kind: wallKind } : { axis: "x", at: b, a: Math.min(a, c), b: Math.max(a, c), kind: wallKind }); }); setSel({ k: "wall", i: floor.walls.length }); }
      else { const i = hitWall(x, y); setSel(i >= 0 ? { k: "wall", i } : null); }
    }
  };
  /** 頂点(16単位)から頂点へ。長いほうの軸に揃える */
  const wallSeg = (x0: number, y0: number, x1: number, y1: number): number[] => {
    const a = s16(x0), b = s16(y0);
    return Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? [a, b, s16(x1), b] : [a, b, a, s16(y1)];
  };

  const remove = useCallback(() => {
    if (!sel) return;
    const s = sel;
    edit((m) => {
      const f = m.floors[fi];
      if (s.k === "room") f.rooms = f.rooms.filter((r) => r.id !== s.id);
      else if (s.k === "item") f.items = f.items.filter((r) => r.id !== s.id);
      else if (s.k === "door") f.doors = f.doors.filter((r) => r.id !== s.id);
      else f.walls = f.walls.filter((_, i) => i !== s.i);
    });
    setSel(null);
  }, [sel, edit, fi]);
  const rotate = useCallback(() => {
    if (sel?.k !== "item") return;
    edit((m) => { const it = m.floors[fi].items.find((i) => i.id === sel.id); const c = it && catOf(it.type); if (it && c) it.dir = c.dirs[(c.dirs.indexOf(it.dir) + 1) % c.dirs.length]; });
  }, [sel, edit, fi]);

  // ---- 保存先(store) ----
  const save = useCallback(async () => {
    setBusy(true);
    const ok = await store.saveDraft(map).catch(() => false);
    setBusy(false);
    if (ok) setDirty(false);
    setMsg(T(ok ? "editor.saved" : "editor.saveFailed"));
    return ok;
  }, [map, T, store]);
  useEffect(() => {
    store.load().then((r) => { setH({ map: r.map, past: [], future: [], key: "" }); setLoaded(true); }).catch(() => setMsg(T("editor.loadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 最初の1回だけ読む
  }, []);
  useEffect(() => {
    if (!autosave || !dirty || !loaded) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [autosave, dirty, loaded, save]);
  const publish = async () => {
    if (!store.publish || !(await save())) return;
    setBusy(true);
    const r = await store.publish(map).catch(() => ({ ok: false as const }));
    setBusy(false);
    if (r.ok) { setMsg(T("editor.published", { id: String(r.id) })); setServerIssues(null); setDlg(null); }
    else if ("issues" in r && r.issues) setServerIssues(r.issues);
    else setMsg(T("editor.publishFailed"));
  };
  const openVersions = async () => {
    setDlg("versions");
    setVersions((await store.versions?.().catch(() => [])) ?? []);
  };
  const restore = async (id: number) => {
    if (!store.restore || !confirm(T("editor.restoreConfirm", { id }))) return;
    setBusy(true);
    const r = await store.restore(id).catch(() => ({ ok: false as const }));
    setBusy(false);
    if (r.ok) { load(r.map); setMsg(T("editor.restored", { id: String(r.id) })); setDlg(null); }
    else setMsg(T("editor.restoreFailed"));
  };
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: "application/json" }));
    a.download = `${map.name || "map"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { setMsg(T("editor.importBad")); return; }
    // 形が違う・禁止の鍵・2MB超は読み込まない。検証エラーが残る物は読み込んで、エラー一覧を見ながら直す
    if (!looksLikeMap(data)) { setMsg(T("editor.importBad")); return; }
    load(data);
    const n = validateMap(data).filter((i) => i.level === "error").length;
    setMsg(T("editor.imported", { n }));
    if (await store.saveDraft(data).catch(() => false)) setDirty(false);
  };

  // 「サンプルを開く」。下書きが空でなければ、ページ内のダイアログで確かめてから置き換える(window.confirmは使わない)
  const openSample = async () => {
    if (!sample) return;
    setDlg(null);
    load(structuredClone(sample));
    setMsg(T("editor.sampleOpened"));
    if (await store.saveDraft(sample).catch(() => false)) setDirty(false);
  };

  // ---- キーボード ----
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKey.current = (e) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "file", "button"].includes((el as HTMLInputElement).type));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
      if (typing || dlg) { if (e.key === "Escape") setDlg(null); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "Escape") { setSel(null); setSignPick(false); setPalette(null); }
      else if (e.key === " " && el.tagName !== "BUTTON") { e.preventDefault(); space.current = true; }
      else if (e.key === "+" || e.key === "=") setView((v) => ({ ...v, z: Math.min(4, v.z * 1.25) }));
      else if (e.key === "-") setView((v) => ({ ...v, z: Math.max(0.15, v.z / 1.25) }));
      else if (/^[1-4]$/.test(e.key)) setTool(TOOLS[Number(e.key) - 1]);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (sel?.k === "item") edit((m) => { const it = m.floors[fi].items.find((i) => i.id === sel.id); if (it) { it.x += dx * 8; it.y += dy * 8; } });
        else setView((v) => ({ ...v, x: v.x + (dx * 64) / v.z, y: v.y + (dy * 64) / v.z }));
      }
    };
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => onKey.current(e);
    const up = (e: KeyboardEvent) => { if (e.key === " ") space.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ---- 部品 ----
  const msgOf = (i: Issue) => T(i.key, { id: i.id ?? "", ...i.vars });
  const jump = (i: Issue) => {
    const fx = map.floors.findIndex((f) => f.id === i.floor);
    if (fx >= 0) setFi(fx);
    const f = map.floors[fx >= 0 ? fx : fi];
    if (i.id && f.items.some((x) => x.id === i.id)) setSel({ k: "item", id: i.id });
    else if (i.id && f.rooms.some((x) => x.id === i.id)) setSel({ k: "room", id: i.id });
    else if (i.id && f.doors.some((x) => x.id === i.id)) setSel({ k: "door", id: i.id });
  };
  const num = (v: number, on: (n: number) => void, step = 1) => (
    <input className={`${box} w-20`} type="number" step={step} value={v} onChange={(e) => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) on(n); }} />
  );
  const row = (label: string, el: React.ReactNode) => <label className="mt-2 flex items-center justify-between gap-2 text-sm"><span>{label}</span>{el}</label>;
  const kindSelect = (kinds: string[], prefix: string, value: string, on: (v: string) => void) =>
    kinds.length > 0 ? (
      <select className={box} value={value} onChange={(e) => on(e.currentTarget.value)}>{kinds.map((k) => <option key={k} value={k}>{lab(prefix, k)}</option>)}</select>
    ) : (
      <input className={`${box} w-32`} value={value} onChange={(e) => on(e.currentTarget.value)} />
    );

  const room = sel?.k === "room" ? floor.rooms.find((r) => r.id === sel.id) : undefined;
  const item = sel?.k === "item" ? floor.items.find((r) => r.id === sel.id) : undefined;
  const door = sel?.k === "door" ? floor.doors.find((r) => r.id === sel.id) : undefined;
  const wallIdx = sel?.k === "wall" ? sel.i : -1;
  const wall = floor.walls[wallIdx];
  const upd = <K extends "rooms" | "items" | "doors">(k: K, id: string, fn: (o: MapFloor[K][number]) => void, key?: string) =>
    edit((m) => { const o = (m.floors[fi][k] as { id: string }[]).find((x) => x.id === id); if (o) fn(o as MapFloor[K][number]); }, key);
  const problems = issues.filter((i) => i.level === "error"), warns = issues.filter((i) => i.level === "warning");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-300 p-2">
        {backHref && <a className="text-sm underline" href={backHref}>{T("common.back")}</a>}
        <strong>{T("editor.title")}</strong>
        <button className={btn} disabled={h.past.length === 0} onClick={undo} title="Ctrl/Cmd+Z">{T("editor.undo")}</button>
        <button className={btn} disabled={h.future.length === 0} onClick={redo} title="Shift+Ctrl/Cmd+Z">{T("editor.redo")}</button>
        <button className={btn} disabled={busy} onClick={() => void save()} title="Ctrl/Cmd+S">{T("editor.saveDraft")}{dirty ? " *" : ""}</button>
        {store.publish && <button className={btn} disabled={busy} onClick={() => { setServerIssues(null); setDlg("publish"); }}>{T("editor.publish")}</button>}
        {store.versions && <button className={btn} onClick={() => void openVersions()}>{T("editor.versions")}</button>}
        <button className={btn} onClick={exportJson}>{T("editor.export")}</button>
        <button className={btn} onClick={() => fileIn.current?.click()}>{T("editor.import")}</button>
        {sample && <button className={btn} onClick={() => (JSON.stringify(map) === JSON.stringify(emptyMap()) ? void openSample() : setDlg("sample"))}>{T("editor.openSample")}</button>}
        <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={(e) => { void importJson(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
        <span role="status" className="text-sm text-neutral-600">{msg}</span>
        <span className="ml-auto text-sm">
          <span className={problems.length ? "text-red-700" : ""}>{T("editor.errors", { n: problems.length })}</span> / {T("editor.warnings", { n: warns.length })}
        </span>
      </header>

      <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-300 p-2" aria-label={T("editor.floors")}>
        {map.floors.map((f, i) => <button key={f.id} className={i === fi ? btnOn : btn} onClick={() => { setFi(i); setSel(null); }}>{f.name || "-"}</button>)}
        <button className={btn} disabled={map.floors.length >= MAX_FLOORS} onClick={() => { edit((m) => { m.floors.push({ id: newId(m), name: `${m.floors.length + 1}F`, rooms: [], walls: [], doors: [], items: [] }); }); setFi(map.floors.length); setSel(null); }}>{T("editor.addFloor")}</button>
        <button className={btn} disabled={fi === 0} onClick={() => { edit((m) => { const [f] = m.floors.splice(fi, 1); m.floors.splice(fi - 1, 0, f); }); setFi(fi - 1); }}>{T("editor.floorUp")}</button>
        <button className={btn} disabled={fi >= map.floors.length - 1} onClick={() => { edit((m) => { const [f] = m.floors.splice(fi, 1); m.floors.splice(fi + 1, 0, f); }); setFi(fi + 1); }}>{T("editor.floorDown")}</button>
        <button className={btn} disabled={map.floors.length <= 1} onClick={() => { if (confirm(T("editor.deleteFloorConfirm", { name: floor.name }))) { edit((m) => { m.floors.splice(fi, 1); }); setFi(Math.max(0, fi - 1)); setSel(null); } }}>{T("editor.deleteFloor")}</button>
        <span className="mx-2 text-neutral-400">|</span>
        {TOOLS.map((k, i) => <button key={k} className={tool === k ? btnOn : btn} aria-pressed={tool === k} onClick={() => setTool(k)} title={String(i + 1)}>{T(`editor.tool.${k}`)}</button>)}
        {tool === "room" && <button className={btn} onClick={() => setSel(null)}>{T("editor.newRoom")}</button>}
        {tool === "wall" && kindSelect(WALL_KINDS, "editor.wallKind.", wallKind, setWallKind)}
        {tool === "door" && <>{kindSelect(DOOR_KINDS, "editor.doorKind.", doorKind, setDoorKind)}{num(doorW, setDoorW, 16)}</>}
        <span className="ml-auto text-xs text-neutral-500">{T("editor.help")}</span>
      </nav>

      <div className="flex min-h-0 flex-1">
        {tool === "item" && (
          <aside className="flex w-48 shrink-0 flex-col border-r border-neutral-300 p-2">
            <input className={box} placeholder={T("editor.filter")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)} aria-label={T("editor.filter")} />
            <ul className="mt-2 min-h-0 flex-1 overflow-auto text-sm">
              {TYPES.filter((k) => lab("catalog.", k).toLowerCase().includes(filter.toLowerCase()) || k.includes(filter.toLowerCase())).map((k) => (
                <li key={k}><button className={`w-full px-1 py-0.5 text-left ${palette === k ? "bg-blue-700 text-white" : "hover:bg-neutral-100"}`} aria-pressed={palette === k} onClick={() => setPalette(palette === k ? null : k)}>{lab("catalog.", k)}</button></li>
              ))}
            </ul>
          </aside>
        )}
        <div ref={wrap} className="relative min-w-0 flex-1 overflow-hidden">
          <canvas
            ref={canvas} width={size.w} height={size.h} tabIndex={0} aria-label={T("editor.canvas")}
            className="absolute inset-0 touch-none"
            style={{ cursor: signPick || (tool === "item" && palette) ? "crosshair" : "default" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <aside className="flex w-[30rem] shrink-0 flex-col border-l border-neutral-300">
          <div className="h-80 shrink-0 border-b border-neutral-300"><Preview src={previewSrc} map={map} blocked={problems.length ? T("editor.previewFix") : null} failed={T("editor.previewFailed")} /></div>
          <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
            {!sel && <>
              <h2 className="font-bold">{T("editor.map")}</h2>
              {row(T("editor.mapName"), <input className={`${box} w-48`} value={map.name} onChange={(e) => { const v = e.currentTarget.value; edit((m) => { m.name = v; }, "map-name"); }} />)}
              {row(T("editor.backdrop"), <select className={box} value={map.backdrop} onChange={(e) => { const v = e.currentTarget.value as OfficeMap["backdrop"]; edit((m) => { m.backdrop = v; }); }}><option value="city">{T("editor.backdrop.city")}</option><option value="countryside">{T("editor.backdrop.countryside")}</option></select>)}
              <h2 className="mt-4 font-bold">{T("editor.floor")}</h2>
              {row(T("editor.floorName"), <input className={`${box} w-48`} value={floor.name} onChange={(e) => { const v = e.currentTarget.value; edit((m) => { m.floors[fi].name = v; }, `floor-name-${fi}`); }} />)}
            </>}
            {room && <>
              <h2 className="font-bold">{T("editor.tool.room")}</h2>
              {row(T("editor.name"), <input className={`${box} w-48`} value={room.name} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { r.name = v; }, `r-${room.id}-name`); }} />)}
              {row(T("editor.roomKind"), <select className={box} value={room.kind} onChange={(e) => { const v = e.currentTarget.value as MapRoom["kind"]; upd("rooms", room.id, (r) => { r.kind = v; }); }}>{ROOM_KINDS.map((k) => <option key={k} value={k}>{T(`editor.roomKind.${k}`)}</option>)}</select>)}
              {row(T("editor.floorMaterial"), FLOOR_KINDS.length > 0
                ? <select className={box} value={room.floor ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { if (v) r.floor = v; else delete r.floor; }); }}><option value="">{T("editor.floorDefault")}</option>{FLOOR_KINDS.map((k: string) => <option key={k} value={k}>{lab("editor.floorKind.", k)}</option>)}</select>
                : <input className={`${box} w-32`} value={room.floor ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { if (v) r.floor = v; else delete r.floor; }, `r-${room.id}-floor`); }} />)}
              {row(T("editor.outdoor"), <input type="checkbox" checked={!!room.outdoor} onChange={(e) => { const v = e.currentTarget.checked; upd("rooms", room.id, (r) => { r.outdoor = v || undefined; }); }} />)}
              <div className="mt-2 flex items-center gap-1">
                <span>{T("editor.sign")}</span>
                {num(room.sign?.[0] ?? 0, (n) => upd("rooms", room.id, (r) => { r.sign = [n, r.sign?.[1] ?? 0]; }, `r-${room.id}-sx`), 8)}
                {num(room.sign?.[1] ?? 0, (n) => upd("rooms", room.id, (r) => { r.sign = [r.sign?.[0] ?? 0, n]; }, `r-${room.id}-sy`), 8)}
                <button className={signPick ? btnOn : btn} onClick={() => setSignPick(!signPick)}>{T("editor.pickSign")}</button>
                {room.sign && <button className={btn} onClick={() => upd("rooms", room.id, (r) => { delete r.sign; })}>x</button>}
              </div>
              <p className="mt-2">{T("editor.rects")}</p>
              <ul>{room.rects.map((r, i) => <li key={i} className="flex items-center justify-between"><span>{r.join(", ")}</span><button className={btn} disabled={room.rects.length <= 1} onClick={() => upd("rooms", room.id, (o) => { o.rects.splice(i, 1); })}>{T("editor.removeRect")}</button></li>)}</ul>
              <p className="mt-1 text-xs text-neutral-500">{T("editor.rectHint")}</p>
            </>}
            {wall && <>
              <h2 className="font-bold">{T("editor.tool.wall")}</h2>
              {row(T("editor.kind"), kindSelect(WALL_KINDS, "editor.wallKind.", wall.kind, (v) => edit((m) => { m.floors[fi].walls[wallIdx].kind = v; })))}
              <p className="mt-2">{wall.axis}: {wall.at} / {wall.a} - {wall.b}</p>
            </>}
            {door && <>
              <h2 className="font-bold">{T("editor.tool.door")}</h2>
              {row(T("editor.kind"), kindSelect(DOOR_KINDS, "editor.doorKind.", door.kind, (v) => upd("doors", door.id, (d) => { d.kind = v; })))}
              {row(T("editor.width"), num(door.b - door.a, (n) => upd("doors", door.id, (d) => { d.b = d.a + Math.max(8, n); }, `d-${door.id}-w`), 8))}
            </>}
            {item && (() => {
              const c = catOf(item.type);
              return <>
                <h2 className="font-bold">{lab("catalog.", item.type)}</h2>
                {row(T("editor.dir"), <select className={box} value={item.dir} onChange={(e) => { const v = e.currentTarget.value as Dir; upd("items", item.id, (o) => { o.dir = v; }); }}>{(c?.dirs ?? [item.dir]).map((d) => <option key={d} value={d}>{d}</option>)}</select>)}
                {row("x", num(item.x, (n) => upd("items", item.id, (o) => { o.x = n; }, `i-${item.id}-x`), 8))}
                {row("y", num(item.y, (n) => upd("items", item.id, (o) => { o.y = n; }, `i-${item.id}-y`), 8))}
                {row(T("editor.season"), <select className={box} value={item.season ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("items", item.id, (o) => { if (v) o.season = v; else delete o.season; }); }}><option value="">-</option>{VO_EVENT_DECORS.map((s) => <option key={s.id} value={s.id}>{T(`season.${s.id}`)}</option>)}</select>)}
                {Object.entries(c?.props ?? {}).map(([k, def]) => {
                  const v = item.props?.[k] ?? def;
                  const set = (x: unknown, key?: string) => upd("items", item.id, (o) => { o.props = { ...o.props, [k]: x }; }, key);
                  if (typeof def === "number") return <div key={k}>{row(lab("editor.prop.", k), num(typeof v === "number" ? v : def, (n) => set(n, `i-${item.id}-${k}`)))}</div>;
                  if (typeof def === "string") return <div key={k}>{row(lab("editor.prop.", k), <input className={`${box} w-40`} maxLength={40} value={typeof v === "string" ? v : def} onChange={(e) => set(e.currentTarget.value, `i-${item.id}-${k}`)} />)}</div>;
                  if (typeof def === "boolean") return <div key={k}>{row(lab("editor.prop.", k), <input type="checkbox" checked={v === true} onChange={(e) => set(e.currentTarget.checked)} />)}</div>;
                  return null;
                })}
              </>;
            })()}
            {sel && <button className={`${btn} mt-3`} onClick={remove}>{T("editor.delete")}</button>}

            <h2 className="mt-4 font-bold">{T("editor.problems")}</h2>
            {issues.length === 0 && <p className="text-green-800">{T("editor.noProblems")}</p>}
            <ul>{issues.map((i, n) => (
              <li key={n}><button className={`w-full text-left ${i.level === "error" ? "text-red-700" : "text-amber-700"}`} onClick={() => jump(i)}>
                [{map.floors.find((f) => f.id === i.floor)?.name ?? "-"}] {msgOf(i)}
              </button></li>
            ))}</ul>
          </div>
        </aside>
      </div>

      {dlg && (
        <div role="dialog" aria-modal="true" aria-label={T(dlg === "publish" ? "editor.publish" : dlg === "sample" ? "editor.openSample" : "editor.versions")} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setDlg(null)}>
          <div className="max-h-[80vh] w-[32rem] max-w-full overflow-auto rounded bg-white p-4 shadow" onClick={(e) => e.stopPropagation()}>
            {dlg === "publish" && <>
              <h2 className="font-bold">{T("editor.publishCheck")}</h2>
              {(serverIssues ?? issues).length === 0 ? <p className="mt-2 text-green-800">{T("editor.noProblems")}</p> : (
                <ul className="mt-2 text-sm">{(serverIssues ?? issues).map((i, n) => <li key={n} className={i.level === "error" ? "text-red-700" : "text-amber-700"}>[{i.level === "error" ? T("editor.error") : T("editor.warning")}] {msgOf(i)}</li>)}</ul>
              )}
              <p className="mt-2 text-xs text-neutral-500">{T("editor.publishNote")}</p>
              <div className="mt-3 flex gap-2">
                <button className={btnOn} disabled={busy || (serverIssues ?? issues).some((i) => i.level === "error")} onClick={() => void publish()} autoFocus>{T("editor.publishDo")}</button>
                <button className={btn} onClick={() => setDlg(null)}>{T("editor.close")}</button>
              </div>
            </>}
            {dlg === "sample" && <>
              <h2 className="font-bold">{T("editor.openSample")}</h2>
              <p className="mt-2 text-sm">{T("editor.sampleConfirm")}</p>
              <div className="mt-3 flex gap-2">
                <button className={btnOn} onClick={() => void openSample()} autoFocus>{T("editor.sampleDo")}</button>
                <button className={btn} onClick={() => setDlg(null)}>{T("editor.sampleCancel")}</button>
              </div>
            </>}
            {dlg === "versions" && <>
              <h2 className="font-bold">{T("editor.versions")}</h2>
              {versions.length === 0 && <p className="mt-2 text-sm">{T("editor.noVersions")}</p>}
              <ul className="mt-2 text-sm">{versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between border-b border-neutral-200 py-1">
                  <span>#{v.id} {new Date(v.createdAt).toLocaleString(locale)} {v.createdBy ?? ""}</span>
                  <button className={btn} disabled={busy} onClick={() => void restore(v.id)}>{T("editor.restore")}</button>
                </li>
              ))}</ul>
              <button className={`${btn} mt-3`} onClick={() => setDlg(null)}>{T("editor.close")}</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
