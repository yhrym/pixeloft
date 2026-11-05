"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOOR_KINDS, FLOOR_KINDS, WALL_KINDS } from "@/engine/catalog.js";
import { seatsOf } from "@/engine/map.js";
import type { Dir, MapFloor, MapRoom, OfficeMap, Rect } from "@/engine/map.js";
import { t as tr, type Locale } from "@/i18n";
import type { Version } from "./store";
import { hasErrors, looksLikeMap, MAX_FLOORS, ROOM_KINDS, validateMap, type Issue } from "@/lib/map/validate";
import { borderWalls, outerWalls } from "@/lib/map/walls";
import { VO_EVENT_DECORS } from "@/lib/virtual-office/events";

import "./editor.css";
import Preview from "./Preview";
import type { EditorStore } from "./store";
import { emptyMap } from "@/lib/map/empty";
import { drawEditor, pluginImg, pluginThumbs, type Thumbs } from "./draw";
import { CAT_ORDER, catKey, catOf, DIR_ANGLE, defaultSign, doorOn, footprint, G, handleAt, newId, ROOM_COLOR, s16, s8, segDist, TOOL_KEY, TOOLS, tooBig, TYPES, type Sel, type Tool } from "./shared";
import { snapOut } from "./snap";
import { Chips, DirArrow, Field, Icon, Menu, Section, Stepper, Switch, Thumb, Tip } from "./ui";

type H = { map: OfficeMap; past: string[]; future: string[]; key: string };
type Drag = null | { t: "pan" | "rect" | "wall" | "move" | "resize"; sx: number; sy: number; x: number; y: number; id?: string; ox?: number; oy?: number; ri?: number; cx?: 0 | 1; cy?: 0 | 1 };
type Dlg = null | "publish" | "versions" | "sample" | "help";

const CHECK_KEY = "pixeloft.editor.checklist";
const W_KEY = "pixeloft.editor.panelW", H_KEY = "pixeloft.editor.previewH";
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* 消せなくても動く */ } },
};

/** 右パネルの幅・プレビューの高さを変えるつまみ。大きさの状態は親が持ち、ここは操作と保存だけ */
function RzHandle({ a, el, label, now, min, clamp, onSize, onDrag }: { a: "w" | "h"; el: React.RefObject<HTMLElement | null>; label: string; now: number | null; min: number; clamp: (v: number) => number; onSize: (v: number | null) => void; onDrag: (on: boolean) => void }) {
  const key = a === "w" ? W_KEY : H_KEY;
  const d = useRef<{ p: number; s: number; v: number } | null>(null);
  const [on, setOn] = useState(false);
  const size = () => { const r = el.current!.getBoundingClientRect(); return a === "w" ? r.width : r.height; };
  const end = () => {
    if (!d.current) return;
    ls.set(key, String(d.current.v)); d.current = null; setOn(false); onDrag(false);
    document.body.style.cursor = ""; document.body.style.userSelect = "";
  };
  const reset = () => { onSize(null); ls.del(key); };
  return <div role="separator" tabIndex={0} data-on={on} title={label} aria-label={label} aria-orientation={a === "w" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuenow={now ?? undefined}
    className={`pxe-rz pxe-rz-${a} ${a === "w" ? "max-[899px]:hidden" : ""}`}
    onPointerDown={(e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const s = size(); d.current = { p: a === "w" ? e.clientX : e.clientY, s, v: s };
      setOn(true); onDrag(true); document.body.style.cursor = a === "w" ? "col-resize" : "row-resize"; document.body.style.userSelect = "none";
    }}
    onPointerMove={(e) => { const c = d.current; if (!c) return; c.v = clamp(a === "w" ? c.s + c.p - e.clientX : c.s + e.clientY - c.p); onSize(c.v); }}
    onPointerUp={end} onPointerCancel={end} onDoubleClick={reset}
    onKeyDown={(e) => {
      // 画面全体のキー処理(図面のパン・置き物の移動)にも拾われないよう止める
      const step = e.key === (a === "w" ? "ArrowLeft" : "ArrowDown") ? 16 : e.key === (a === "w" ? "ArrowRight" : "ArrowUp") ? -16 : 0;
      if (e.key === "Enter") reset();
      else if (step) { const v = clamp(size() + step); onSize(v); ls.set(key, String(v)); }
      else return;
      e.preventDefault(); e.stopPropagation();
    }} />;
}

export function EditorClient({ store, locale, backHref, docsHref, previewSrc = "/editor/preview", autosave = false, sample, thumbsBase = "/" }: { store: EditorStore; locale: Locale; backHref?: string; docsHref?: string; previewSrc?: string; autosave?: boolean; sample?: OfficeMap; thumbsBase?: string }) {
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
  const [ghostDir, setGhostDir] = useState<Dir | null>(null);
  const [search, setSearch] = useState("");
  const [closedCats, setClosedCats] = useState<Record<string, boolean>>({ season: true });
  const [hl, setHl] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [wallKind, setWallKind] = useState<string>(WALL_KINDS[0] ?? "");
  const [borderKind, setBorderKind] = useState<string>(WALL_KINDS.includes("glass") ? "glass" : (WALL_KINDS[0] ?? ""));
  const [doorKind, setDoorKind] = useState<string>(DOOR_KINDS[0] ?? "");
  const [doorW, setDoorW] = useState(32);
  const [signPick, setSignPick] = useState(false);
  const [view, setView] = useState({ x: -32, y: -32, z: 1 });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [ghost, setGhost] = useState<{ k: "rect" | "wall"; r: number[] } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [dragType, setDragType] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [longMsg, setLongMsg] = useState(false); // 案内文だけ長く出す
  const [dlg, setDlg] = useState<Dlg>(null);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [secProps, setSecProps] = useState(true);
  const [secChecks, setSecChecks] = useState(true);
  const [big, setBig] = useState(false);
  const [panelW, setPanelW] = useState<number | null>(null);
  const [previewH, setPreviewH] = useState<number | null>(null);
  const [resizing, setResizing] = useState<"w" | "h" | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [done4, setDone4] = useState(false);
  const [thumbs, setThumbs] = useState<Thumbs | null>(null);
  const [plugReady, setPlugReady] = useState(0);
  const fitRef = useRef<() => void>(() => {});

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag>(null);
  const space = useRef(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const dragSeq = useRef(0);
  const popInput = useRef<HTMLInputElement>(null);
  const paletteBox = useRef<HTMLDivElement>(null);

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
  const load = useCallback((m: OfficeMap) => { setTimeout(() => fitRef.current(), 30); if (m.floors.some((f) => f.rooms.length)) setTool("select"); edit((x) => { x.version = m.version; x.name = m.name; x.backdrop = m.backdrop; x.floors = m.floors; }); setFi(0); setSel(null); setPop(null); }, [edit]);
  const fl = (m: OfficeMap) => m.floors[fi];

  const issues = useMemo(() => validateMap(map), [map]);
  const seats = useMemo(() => { try { return hasErrors(issues) ? [] : seatsOf(map).filter((s: { floor: string }) => s.floor === floor.id); } catch { return []; } }, [map, issues, floor.id]);
  const problems = issues.filter((i) => i.level === "error"), warns = issues.filter((i) => i.level === "warning");

  // ---- サムネイル(なくても動く) ----
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const meta = (await (await fetch(`${thumbsBase}catalog-thumbs.json`)).json()) as { size: number; cols: number; ids: string[] };
        if (!Array.isArray(meta.ids) || !(meta.size > 0) || !(meta.cols > 0)) return;
        const img = new Image();
        img.src = `${thumbsBase}catalog-thumbs.png`;
        await img.decode();
        if (!dead) setThumbs({ img, size: meta.size, cols: meta.cols, idx: new Map(meta.ids.map((id, i) => [id, i])) });
      } catch { /* 画像がなければ中立のアイコンで出す */ }
    })();
    return () => { dead = true; };
  }, [thumbsBase]);
  // プラグインが同梱したサムネイルは、読み終わったら図面を描き直す
  useEffect(() => {
    let dead = false;
    void Promise.all(Object.keys(pluginThumbs).map((id) => pluginImg(id)!.decode().catch(() => {}))).then(() => { if (!dead) setPlugReady(1); });
    return () => { dead = true; };
  }, []);

  // ---- 描画 ----
  const snap: [number, number] | null = cursor && (tool === "room" || tool === "wall") ? [s16(cursor[0]), s16(cursor[1])] : cursor && tool === "item" && palette ? [s8(cursor[0]), s8(cursor[1])] : null;
  const hitItem = (x: number, y: number) => [...floor.items].reverse().find((it) => { const [a, b, c, d] = footprint(it); return x >= a && x <= c && y >= b && y <= d; });
  // マス目単位の当たり判定。細い物(ホワイトボードなど)も乗っているマスのどこでも掴める
  const hitItemCell = (x: number, y: number) => [...floor.items].reverse().find((it) => { const [a, b, c, d] = snapOut(footprint(it), G); return x >= a && x < c && y >= b && y < d; });
  const hitWall = (x: number, y: number) => floor.walls.findIndex((w) => segDist(x, y, w) <= Math.max(4, 6 / view.z));
  const hitDoor = (x: number, y: number) => floor.doors.find((d) => segDist(x, y, d) <= Math.max(4, 6 / view.z));
  const hitRoom = (x: number, y: number) => [...floor.rooms].reverse().find((r) => r.rects.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d));
  const hitAny = (x: number, y: number): Sel => {
    const it = hitItem(x, y); if (it) return { k: "item", id: it.id };
    const d = hitDoor(x, y); if (d) return { k: "door", id: d.id };
    const w = hitWall(x, y); if (w >= 0) return { k: "wall", i: w };
    const ic = hitItemCell(x, y); if (ic) return { k: "item", id: ic.id };
    const r = hitRoom(x, y); return r ? { k: "room", id: r.id } : null;
  };
  // パレット選択中は空きマスに置けるよう、マス目の判定は使わない
  const hitItemTool = (x: number, y: number) => hitItem(x, y) ?? (palette ? undefined : hitItemCell(x, y));
  const hover: Sel = !cursor ? null : tool === "select" ? hitAny(...cursor) : tool === "item" ? ((i) => (i ? { k: "item" as const, id: i.id } : null))(hitItemTool(...cursor)) : tool === "room" ? ((r) => (r ? { k: "room" as const, id: r.id } : null))(hitRoom(...cursor)) : tool === "wall" ? ((i) => (i >= 0 ? { k: "wall" as const, i } : null))(hitWall(...cursor)) : ((d) => (d ? { k: "door" as const, id: d.id } : null))(hitDoor(...cursor));
  const doorGhost = (() => {
    if (tool !== "door" || !cursor || hitDoor(...cursor)) return null;
    const wi = hitWall(...cursor);
    return wi < 0 ? null : { ...doorOn(floor.walls[wi], cursor[0], cursor[1], doorW), ok: true };
  })();
  const ghostType = dragType ?? (tool === "item" ? palette : null);
  const ghostC = ghostType ? catOf(ghostType) : undefined;
  const itemGhost = ghostType && ghostC && cursor ? { type: ghostType, dir: ghostDir && ghostC.dirs.includes(ghostDir) ? ghostDir : ghostC.dirs[0], x: s8(cursor[0]), y: s8(cursor[1]) } : null;

  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const bad = new Set(issues.filter((i) => i.level === "error" && (i.floor === floor.id || !i.floor)).map((i) => i.id ?? ""));
    const warn = new Set(issues.filter((i) => i.level === "warning" && i.floor === floor.id).map((i) => i.id ?? ""));
    drawEditor(ctx, { w: size.w, h: size.h, dpr, view, floor, sel, hover, bad, warn, flash, seats, thumbs, lab: (ty) => lab("catalog.", ty), ghost, snap, itemGhost, doorGhost });
    // hover・snap・itemGhost・doorGhostはcursorから決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, dpr, floor, sel, issues, seats, ghost, lab, thumbs, plugReady, flash, cursor, tool, palette, dragType, ghostDir, doorW]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const z = Math.min(4, Math.max(0.15, v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const wx = (r.right - e.clientX) / v.z + v.x, wy = (e.clientY - r.top) / v.z + v.y;
        return { z, x: wx - (r.right - e.clientX) / z, y: wy - (e.clientY - r.top) / z };
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

  useEffect(() => { if (!msg) return; const timer = setTimeout(() => { setLongMsg(false); setMsg(""); }, longMsg ? 8000 : 4000); return () => clearTimeout(timer); }, [msg, longMsg]);
  useEffect(() => { if (pop) setTimeout(() => { popInput.current?.focus(); popInput.current?.select(); }, 0); }, [pop]);
  useEffect(() => { if (hl.size) paletteBox.current?.querySelector("[data-hl]")?.scrollIntoView({ block: "center" }); }, [hl]);
  useEffect(() => { if (!hl.size) return; const timer = setTimeout(() => setHl(new Set()), 4000); return () => clearTimeout(timer); }, [hl]);
  useEffect(() => { if (!flash.size) return; const timer = setTimeout(() => setFlash(new Set()), 2500); return () => clearTimeout(timer); }, [flash]);

  // ---- 操作 ----
  const world = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(r.right - e.clientX) / view.z + view.x, (e.clientY - r.top) / view.z + view.y];
  };
  const placeItem = (type: string, x: number, y: number) => {
    const c = catOf(type);
    if (!c) return;
    const id = newId(map);
    const dir = ghostDir && c.dirs.includes(ghostDir) ? ghostDir : c.dirs[0];
    edit((m) => { fl(m).items.push({ id, type, x, y, dir, ...(Object.hasOwn(c, "entrance") ? { props: { entrance: true } } : {}) }); });
    setSel({ k: "item", id });
  };
  const wallSeg = (x0: number, y0: number, x1: number, y1: number): number[] => {
    const a = s16(x0), b = s16(y0);
    return Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? [a, b, s16(x1), b] : [a, b, a, s16(y1)];
  };

  const onDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    setPop(null);
    const [x, y] = world(e);
    const base = { sx: e.clientX, sy: e.clientY, x, y };
    if (e.button === 1 || e.button === 2 || space.current) { drag.current = { ...base, t: "pan", ox: view.x, oy: view.y }; return; }
    if (signPick && sel?.k === "room") { edit((m) => { const r = fl(m).rooms.find((r) => r.id === sel.id); if (r) r.sign = [s8(x), s8(y)]; }); setSignPick(false); return; }
    const selRoom = sel?.k === "room" ? floor.rooms.find((r) => r.id === sel.id) : undefined;
    const hnd = selRoom && (tool === "select" || tool === "room") ? handleAt(selRoom, x, y, view.z) : null;
    if (selRoom && hnd) { dragSeq.current++; drag.current = { ...base, t: "resize", id: selRoom.id, ...hnd }; return; }
    if (tool === "select") {
      const s = hitAny(x, y);
      setSel(s);
      if (s?.k === "item") { const it = floor.items.find((i) => i.id === s.id)!; drag.current = { ...base, t: "move", id: it.id, ox: it.x - x, oy: it.y - y }; dragSeq.current++; }
    } else if (tool === "room") drag.current = { ...base, t: "rect" };
    else if (tool === "wall") drag.current = { ...base, t: "wall" };
    else if (tool === "door") {
      const d = hitDoor(x, y);
      if (d) { setSel({ k: "door", id: d.id }); return; }
      const wi = hitWall(x, y);
      if (wi < 0) { setSel(null); return; }
      const id = newId(map);
      edit((m) => { fl(m).doors.push({ id, ...doorOn(floor.walls[wi], x, y, doorW), kind: doorKind }); });
      setSel({ k: "door", id });
    } else {
      const it = hitItemTool(x, y);
      if (it) { setSel({ k: "item", id: it.id }); drag.current = { ...base, t: "move", id: it.id, ox: it.x - x, oy: it.y - y }; dragSeq.current++; return; }
      if (!palette || !catOf(palette)) { setSel(null); return; }
      placeItem(palette, s8(x), s8(y));
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = world(e);
    setCursor([x, y]);
    const d = drag.current;
    if (!d) return;
    const far = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4;
    if (d.t === "pan") setView((v) => ({ ...v, x: d.ox! + (e.clientX - d.sx) / v.z, y: d.oy! - (e.clientY - d.sy) / v.z }));
    else if (d.t === "rect") { if (far) setGhost({ k: "rect", r: [Math.min(Math.floor(d.x / G), Math.floor(x / G)) * G, Math.min(Math.floor(d.y / G), Math.floor(y / G)) * G, (Math.max(Math.floor(d.x / G), Math.floor(x / G)) + 1) * G, (Math.max(Math.floor(d.y / G), Math.floor(y / G)) + 1) * G] }); }
    else if (d.t === "wall") { if (far) setGhost({ k: "wall", r: wallSeg(d.x, d.y, x, y) }); }
    else if (d.t === "move") { if (far) edit((m) => { const it = fl(m).items.find((i) => i.id === d.id); if (it) { it.x = s8(x + d.ox!); it.y = s8(y + d.oy!); } }, `drag${dragSeq.current}`); }
    else if (d.t === "resize") {
      edit((m) => {
        const r = fl(m).rooms.find((q) => q.id === d.id)?.rects[d.ri!];
        if (!r) return;
        const nx = s16(x), ny = s16(y);
        if (d.cx ? nx > r[0] : nx < r[2]) r[d.cx ? 2 : 0] = nx;
        if (d.cy ? ny > r[1] : ny < r[3]) r[d.cy ? 3 : 1] = ny;
      }, `resize${dragSeq.current}`);
    }
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
        const target = e.shiftKey && sel?.k === "room" ? floor.rooms.find((q) => q.id === sel.id) : undefined;
        if (target) edit((m) => { fl(m).rooms.find((q) => q.id === target.id)?.rects.push(r); });
        else {
          const id = newId(map);
          const n = map.floors.reduce((a, f) => a + f.rooms.length, 0) + 1;
          edit((m) => { fl(m).rooms.push({ id, name: `${T("editor.room")} ${n}`, kind: "work", rects: [r], sign: defaultSign(r) }); });
          setSel({ k: "room", id });
          setPop(id);
        }
      } else { const r = hitRoom(x, y); setSel(r ? { k: "room", id: r.id } : null); }
    } else if (d.t === "wall") {
      if (g?.k === "wall") { const [a, b, c, dd] = g.r; edit((m) => { fl(m).walls.push(a === c ? { axis: "y", at: a, a: Math.min(b, dd), b: Math.max(b, dd), kind: wallKind } : { axis: "x", at: b, a: Math.min(a, c), b: Math.max(a, c), kind: wallKind }); }); setSel({ k: "wall", i: floor.walls.length }); }
      else { const i = hitWall(x, y); setSel(i >= 0 ? { k: "wall", i } : null); }
    }
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
    setPop(null);
  }, [sel, edit, fi]);
  const rotate = useCallback((by = 1) => {
    if (sel?.k === "item") {
      edit((m) => { const it = m.floors[fi].items.find((i) => i.id === sel.id); const c = it && catOf(it.type); if (it && c) it.dir = c.dirs[(c.dirs.indexOf(it.dir) + by + c.dirs.length) % c.dirs.length]; });
    } else if (palette) {
      const c = catOf(palette);
      if (c) setGhostDir((g) => c.dirs[(Math.max(0, c.dirs.indexOf(g ?? c.dirs[0])) + by + c.dirs.length) % c.dirs.length]);
    }
  }, [sel, palette, edit, fi]);
  const duplicate = useCallback(() => {
    if (sel?.k !== "item") return;
    const src = floor.items.find((i) => i.id === sel.id);
    if (!src) return;
    const id = newId(map);
    edit((m) => { m.floors[fi].items.push({ ...structuredClone(src), id, x: src.x + G, y: src.y + G }); });
    setSel({ k: "item", id });
  }, [sel, floor, map, edit, fi]);
  const zoomBy = (f: number) => setView((v) => { const z = Math.min(4, Math.max(0.15, v.z * f)); const cx = v.x + size.w / 2 / v.z, cy = v.y + size.h / 2 / v.z; return { z, x: cx - size.w / 2 / z, y: cy - size.h / 2 / z }; });
  const fit = () => {
    const xs: number[] = [], ys: number[] = [];
    for (const r of floor.rooms) for (const q of r.rects) { xs.push(q[0], q[2]); ys.push(q[1], q[3]); }
    for (const it of floor.items) { const [a, b, c, d] = footprint(it); xs.push(a, c); ys.push(b, d); }
    if (!xs.length) { setView({ x: -32, y: -32, z: 1 }); return; }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const z = Math.min(2, Math.max(0.15, Math.min((size.w - 80) / (x1 - x0), (size.h - 80) / (y1 - y0))));
    setView({ z, x: x0 - (size.w / z - (x1 - x0)) / 2, y: y0 - (size.h / z - (y1 - y0)) / 2 });
  };
  useEffect(() => { fitRef.current = fit; });
  const centerOn = (x: number, y: number) => setView((v) => ({ ...v, x: x - size.w / 2 / v.z, y: y - size.h / 2 / v.z }));

  // 壁のまとめ引き(どちらも1回のundoで戻る)
  const autoOuter = () => { edit((m) => { m.floors[fi].walls = outerWalls(m.floors[fi]); }); setMsg(T("editor.walls.outerDone")); };
  const autoBorder = () => {
    const next = borderWalls(floor, borderKind);
    if (next.length === floor.walls.length) { setMsg(T("editor.walls.none")); return; }
    edit((m) => { m.floors[fi].walls = borderWalls(m.floors[fi], borderKind); });
    setMsg(T("editor.walls.borderDone", { n: next.length - floor.walls.length }));
  };

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
    store.load().then((r) => {
      setH({ map: r.map, past: [], future: [], key: "" });
      setLoaded(true);
      setTimeout(() => fitRef.current(), 30);
      const f = r.map.floors ?? [];
      const steps = [f.some((x) => x.rooms.length), f.some((x) => x.items.some((i) => i.props?.entrance === true)), f.some((x) => x.items.some((i) => catOf(i.type)?.seats))];
      setFresh(steps.filter(Boolean).length < 3);
      if (steps[0]) setTool("select"); // 部屋のあるマップは選択から始める(空なら部屋を描くところから)
      setDismissed(ls.get(CHECK_KEY) === "1");
    }).catch(() => setMsg(T("editor.loadFailed")));
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
    if (r.ok) { setMsg(T("editor.published", { id: String(r.id) })); setServerIssues(null); setDlg(null); setDone4(true); }
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
    setDone4(true);
    // ブラウザ版だけ、書き出したJSONの使い道を案内する
    if (!store.publish) { setLongMsg(true); setMsg(T("editor.exportedHint")); }
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

  // ---- 右パネルの大きさ変更 ----
  useEffect(() => { // 保存値はマウント後に読む(SSRとの不一致を避ける)
    const n = (k: string) => { const t = ls.get(k), v = Number(t); return t !== null && t !== "" && Number.isFinite(v) ? Math.round(v) : null; };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存値の読み込みはマウント後の1回だけ
    setPanelW(n(W_KEY)); setPreviewH(n(H_KEY));
  }, []);
  const clampW = (v: number) => Math.round(Math.max(368, Math.min(v, window.innerWidth - 600)));
  const clampH = (v: number) => Math.round(Math.max(200, Math.min(v, Math.max(200, (asideRef.current?.clientHeight ?? 0) - 120))));

  // ---- キーボード ----
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKey.current = (e) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "file", "button"].includes((el as HTMLInputElement).type));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
      if (e.key === "Escape") { if (dlg) setDlg(null); else if (big) setBig(false); else if (pop) setPop(null); else { setSel(null); setSignPick(false); setPalette(null); } return; }
      if (typing || dlg || el.closest("[data-pxe-modal]")) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (k === "r") rotate(e.shiftKey ? 1 : -1); // 反転した平面では順方向(x+→y+)が反時計回りに見えるので、Rは-1で時計回りにする
      else if (e.key === "?") setDlg("help");
      else if (e.key === " " && el.tagName !== "BUTTON") { e.preventDefault(); space.current = true; }
      else if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-") zoomBy(1 / 1.25);
      else if (k === "v" || e.key === "1") setTool("select");
      else if (/^[2-5]$/.test(e.key)) setTool(TOOLS[Number(e.key) - 1]);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        // x+は画面の左なので左右キーは符号を反転
        const dx = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0, dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
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

  // ---- 検証の修正ボタン ----
  const msgOf = (i: Issue) => T(i.key, { id: i.id ?? "", ...i.vars });
  const select = (fx: number, s: Sel) => {
    if (fx >= 0) setFi(fx);
    setSel(s);
    const f = map.floors[fx >= 0 ? fx : fi];
    if (s?.k === "item") { const o = f.items.find((x) => x.id === s.id); if (o) centerOn(o.x, o.y); }
    else if (s?.k === "room") { const r = f.rooms.find((x) => x.id === s.id)?.rects[0]; if (r) centerOn((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); }
    else if (s?.k === "door") { const o = f.doors.find((x) => x.id === s.id); if (o) centerOn(o.axis === "x" ? (o.a + o.b) / 2 : o.at, o.axis === "x" ? o.at : (o.a + o.b) / 2); }
  };
  const jump = (i: Issue) => {
    const fx = map.floors.findIndex((f) => f.id === i.floor);
    const f = map.floors[fx >= 0 ? fx : fi];
    if (i.id && f.items.some((x) => x.id === i.id)) select(fx, { k: "item", id: i.id });
    else if (i.id && f.rooms.some((x) => x.id === i.id)) select(fx, { k: "room", id: i.id });
    else if (i.id && f.doors.some((x) => x.id === i.id)) select(fx, { k: "door", id: i.id });
    else if (fx >= 0) setFi(fx);
  };
  const entranceTypes = useMemo(() => TYPES.filter((k) => catOf(k)?.entrance), []);
  const showEntrances = () => {
    setTool("item"); setPalette(null); setSearch(""); setHl(new Set(entranceTypes));
    setClosedCats((c) => { const n = { ...c }; for (const k of entranceTypes) delete n[catKey(k)]; return n; });
  };
  const fixOf = (i: Issue): { label: string; run: () => void } | null => {
    const fx = map.floors.findIndex((f) => f.id === i.floor);
    const f = map.floors[fx >= 0 ? fx : fi];
    if (i.key === "map.err.noEntrance") return { label: T("editor.fix.entrance"), run: () => { if (fx >= 0) setFi(fx); showEntrances(); } };
    if (i.key === "map.warn.roomNoDoor" && i.id) return { label: T("editor.fix.door"), run: () => { select(fx, { k: "room", id: i.id! }); setTool("door"); } };
    if (i.key === "map.warn.signOutside" && i.id) return { label: T("editor.fix.sign"), run: () => { select(fx, { k: "room", id: i.id! }); setTool("select"); } };
    if (i.key === "map.err.itemOverlap" && i.id && i.vars?.other) { const o = String(i.vars.other); return { label: T("editor.fix.other"), run: () => { select(fx, { k: "item", id: o }); setTool("select"); setFlash(new Set([i.id!, o])); } }; }
    if (i.key === "map.err.roomOverlap" && i.id) { const o = f.rooms.find((r) => r.name === i.vars?.other && r.id !== i.id); if (o) return { label: T("editor.fix.other"), run: () => { select(fx, { k: "room", id: o.id }); setTool("select"); setFlash(new Set([i.id!, o.id])); } }; }
    return null;
  };

  // ---- 部品 ----
  const upd = <K extends "rooms" | "items" | "doors">(k: K, id: string, fn: (o: MapFloor[K][number]) => void, key?: string) =>
    edit((m) => { const o = (m.floors[fi][k] as { id: string }[]).find((x) => x.id === id); if (o) fn(o as MapFloor[K][number]); }, key);
  const room = sel?.k === "room" ? floor.rooms.find((r) => r.id === sel.id) : undefined;
  const item = sel?.k === "item" ? floor.items.find((r) => r.id === sel.id) : undefined;
  const door = sel?.k === "door" ? floor.doors.find((r) => r.id === sel.id) : undefined;
  const wallIdx = sel?.k === "wall" ? sel.i : -1;
  const wall = floor.walls[wallIdx];
  const kindOpts = (kinds: string[], prefix: string) => kinds.map((k) => ({ v: k, text: lab(prefix, k) }));
  const roomKindOpts = ROOM_KINDS.map((k) => ({ v: k, text: T(`editor.roomKind.${k}`), icon: k, color: ROOM_COLOR[k] }));
  const kindSelect = (kinds: string[], prefix: string, value: string, on: (v: string) => void, label: string) =>
    kinds.length > 0 ? (
      <select className="pxe-input" aria-label={label} value={value} onChange={(e) => on(e.currentTarget.value)}>{kinds.map((k) => <option key={k} value={k}>{lab(prefix, k)}</option>)}</select>
    ) : (
      <input className="pxe-input" aria-label={label} value={value} onChange={(e) => on(e.currentTarget.value)} />
    );

  // パレット: カテゴリ別・検索つき
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const by = new Map<string, string[]>();
    for (const k of TYPES) {
      if (q && !lab("catalog.", k).toLowerCase().includes(q) && !k.includes(q)) continue;
      const c = catKey(k);
      by.set(c, [...(by.get(c) ?? []), k]);
    }
    const order = [...CAT_ORDER, ...[...by.keys()].filter((c) => !CAT_ORDER.includes(c) && c !== "other"), "other"];
    return order.filter((c) => by.has(c)).map((c) => [c, by.get(c)!] as const);
  }, [search, lab]);
  const catName = (c: string) => lab("editor.cat.", c);

  // はじめてのチェックリスト
  const hasRoom = map.floors.some((f) => f.rooms.length > 0);
  const hasEntrance = map.floors.some((f) => f.items.some((i) => i.props?.entrance === true && catOf(i.type)?.entrance));
  const hasDesk = map.floors.some((f) => f.items.some((i) => catOf(i.type)?.seats));
  const steps: { done: boolean; text: string; run: () => void }[] = [
    { done: hasRoom, text: T("editor.check.room"), run: () => setTool("room") },
    { done: hasEntrance, text: T("editor.check.entrance"), run: showEntrances },
    { done: hasDesk, text: T("editor.check.desk"), run: () => { setTool("item"); setSearch(""); setClosedCats((c) => ({ ...c, desk: false })); setPalette("desk-island"); } },
    store.publish
      ? { done: done4, text: T("editor.check.publish"), run: () => { setServerIssues(null); setDlg("publish"); } }
      : { done: done4, text: T("editor.check.export"), run: exportJson },
  ];
  const showCheck = loaded && fresh && !dismissed && !steps.every((s) => s.done);

  const popRoom = pop ? floor.rooms.find((r) => r.id === pop) : undefined;
  const popPos = (() => {
    const rc = popRoom?.rects[0];
    if (!rc) return { left: 0, top: 0 };
    return { left: Math.min(Math.max(8, size.w - (rc[2] - view.x) * view.z), Math.max(8, size.w - 300)), top: Math.min(Math.max(8, (rc[3] - view.y) * view.z + 10), Math.max(8, size.h - 250)) };
  })();

  const issueList = (list: Issue[], withFix: boolean) => list.map((i, n) => {
    const fix = withFix ? fixOf(i) : null;
    return (
      <li key={n} className={`pxe-issue ${i.level}`}>
        <Icon n={i.level === "error" ? "error" : "warn"} size={16} className="mt-0.5" />
        {withFix
          ? <button className="body" onClick={() => jump(i)}>{map.floors.length > 1 && <b>[{map.floors.find((f) => f.id === i.floor)?.name ?? "-"}] </b>}{msgOf(i)}</button>
          : <span className="body">{msgOf(i)}</span>}
        {fix && <button className="pxe-btn pxe-btn-sm shrink-0" onClick={fix.run}>{fix.label}</button>}
      </li>
    );
  });

  const hint = tool === "item" && palette ? T("editor.hint.itemPicked", { name: lab("catalog.", palette) }) : T(`editor.hint.${tool}`);
  const saveState = busy ? "busy" : dirty ? "dirty" : "saved";
  const canPublish = !!store.publish;

  return (
    <div className="pxe fixed inset-0 z-50 flex flex-col" lang={locale}>
      <p role="note" className="hidden bg-amber-100 px-3 py-2 text-sm text-amber-900 max-[899px]:block">{T("editor.mobileNotice")}</p>

      {/* ---- 上のバー ---- */}
      <header className="pxe-top flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        {backHref && <Tip text={T("common.back")} side="bottom"><a className="pxe-iconbtn" href={backHref} aria-label={T("common.back")}><Icon n="back" /></a></Tip>}
        <span className="pxe-wordmark mr-1 select-none" aria-hidden="true">Pixeloft</span>
        <span className="mx-1 hidden h-5 w-px bg-[var(--line)] sm:block" />
        <input className="pxe-namein" aria-label={T("editor.mapName")} placeholder={T("editor.unnamed")} maxLength={40} value={map.name} onChange={(e) => { const v = e.currentTarget.value; edit((m) => { m.name = v; }, "map-name"); }} />
        <button className={`pxe-save ${saveState}`} disabled={busy || !dirty} onClick={() => void save()} title={saveState === "saved" && !canPublish ? T("editor.saveState.savedLocalHint") : "Ctrl/Cmd+S"} data-state={saveState}>{T(saveState === "saved" && !canPublish ? "editor.saveState.savedLocal" : `editor.saveState.${saveState}`)}</button>
        <span className="mx-1 hidden h-5 w-px bg-[var(--line)] sm:block" />
        <Tip text={T("editor.undo")} keys="Ctrl+Z" side="bottom"><button className="pxe-iconbtn" disabled={h.past.length === 0} onClick={undo} aria-label={T("editor.undo")}><Icon n="undo" /></button></Tip>
        <Tip text={T("editor.redo")} keys="Shift+Ctrl+Z" side="bottom"><button className="pxe-iconbtn" disabled={h.future.length === 0} onClick={redo} aria-label={T("editor.redo")}><Icon n="redo" /></button></Tip>

        <div className="ml-auto flex items-center gap-2">
          <button className={`pxe-pill ${problems.length ? "error" : warns.length ? "warning" : "ok"}`} onClick={() => { setRightOpen(true); setSecChecks(true); }} title={T("editor.panel.checks")} data-testid="badge">
            <Icon n={problems.length ? "error" : warns.length ? "warn" : "ok"} size={13} />
            {problems.length || warns.length ? <>{T("editor.errors", { n: problems.length })}<span className="opacity-50">/</span>{T("editor.warnings", { n: warns.length })}</> : T("editor.noProblems")}
          </button>
          {canPublish && <button className="pxe-btn pxe-btn-primary" disabled={busy} onClick={() => { setServerIssues(null); setDlg("publish"); }}><Icon n="send" size={15} />{T("editor.publish")}</button>}
          {!canPublish && <button className="pxe-btn pxe-btn-primary" onClick={exportJson}><Icon n="download" size={15} />{T("editor.export")}</button>}
          <Menu trigger={({ toggle, open }) => <button className="pxe-iconbtn" aria-label={T("editor.menu")} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon n="more" /></button>}>
            {(close) => <>
              {store.versions && <button role="menuitem" onClick={() => { close(); void openVersions(); }}><Icon n="history" size={16} />{T("editor.versions")}</button>}
              <button role="menuitem" onClick={() => { close(); exportJson(); }}><Icon n="download" size={16} />{T("editor.export")}</button>
              <button role="menuitem" onClick={() => { close(); fileIn.current?.click(); }}><Icon n="upload" size={16} />{T("editor.import")}</button>
              {sample && <button role="menuitem" onClick={() => { close(); if (JSON.stringify(map) === JSON.stringify(emptyMap())) void openSample(); else setDlg("sample"); }}><Icon n="folder" size={16} />{T("editor.openSample")}</button>}
              {docsHref && <a role="menuitem" href={docsHref}><Icon n="help" size={16} />{T("editor.docs")}</a>}
              <hr />
              <button role="menuitem" onClick={() => { close(); setDlg("help"); }}><Icon n="help" size={16} />{T("editor.shortcuts")}<span className="pxe-kbd ml-auto">?</span></button>
            </>}
          </Menu>
        </div>
        <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={(e) => { void importJson(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      </header>

      <div className="flex min-h-0 flex-1 max-[899px]:flex-col max-[899px]:overflow-auto">
        {/* ---- 道具のレール ---- */}
        <nav className="pxe-rail flex shrink-0 flex-col items-center gap-1 p-2 max-[899px]:flex-row max-[899px]:justify-center max-[899px]:border-b max-[899px]:border-r-0" aria-label={T("editor.tools")}>
          {TOOLS.map((k) => (
            <Tip key={k} text={T(`editor.tool.${k}`)} keys={TOOL_KEY[k]}>
              <button className="pxe-tool" aria-pressed={tool === k} aria-label={T(`editor.tool.${k}`)} data-tool={k} onClick={() => setTool(k)}>
                <Icon n={k} size={20} />
                <span>{T(`editor.toolShort.${k}`)}</span>
              </button>
            </Tip>
          ))}
        </nav>

        {/* ---- 部品パレット ---- */}
        <aside className="pxe-panel flex w-60 shrink-0 flex-col border-r border-[var(--line)] max-[899px]:h-56 max-[899px]:w-full max-[899px]:border-b max-[899px]:border-r-0">
          <div className="p-3 pb-2">
            <div className="pxe-search">
              <Icon n="search" size={16} />
              <input className="pxe-input" placeholder={T("editor.searchItems")} aria-label={T("editor.filter")} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
            </div>
          </div>
          <div ref={paletteBox} className="pxe-scroll min-h-0 flex-1 overflow-auto px-3 pb-3" data-testid="palette">
            {groups.length === 0 && <p className="pxe-hint mt-4 text-center">{T("editor.noMatch")}</p>}
            {groups.map(([c, list]) => {
              const open = !!search.trim() || !closedCats[c];
              return (
                <div key={c} data-cat={c}>
                  <button className="pxe-cathead" aria-expanded={open} onClick={() => setClosedCats((s) => ({ ...s, [c]: open }))}>
                    <Icon n={open ? "down" : "right"} size={14} />{catName(c)}<span className="n">{list.length}</span>
                  </button>
                  {open && (
                    <div className="pxe-cards">
                      {list.map((k) => (
                        <button
                          key={k} className={`pxe-card ${hl.has(k) ? "hl" : ""}`} aria-pressed={tool === "item" && palette === k} draggable data-type={k} {...(hl.has(k) ? { "data-hl": "1" } : {})}
                          title={lab("catalog.", k)}
                          onClick={() => { if (tool === "item" && palette === k) setPalette(null); else { setPalette(k); setTool("item"); } }}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", k); e.dataTransfer.effectAllowed = "copy"; setDragType(k); }}
                          onDragEnd={() => setDragType(null)}
                        >
                          <Thumb id={k} sheet={thumbs} base={thumbsBase} size={56} />
                          <span>{lab("catalog.", k)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ---- 真ん中: 階のタブ・キャンバス・ヒント ---- */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col max-[899px]:flex-none">
          <div className="pxe-floors flex flex-wrap items-center gap-1 px-3 py-1.5" role="tablist" aria-label={T("editor.floors")}>
            {map.floors.map((f, i) => (
              <span key={f.id} role="presentation" className="inline-flex">
                {renaming === i ? (
                  <span className="pxe-floortab" aria-selected="true">
                    <input autoFocus aria-label={T("editor.floorName")} value={f.name} maxLength={40} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { const v = e.currentTarget.value; edit((m) => { m.floors[i].name = v; }, `floor-name-${i}`); }} onBlur={() => setRenaming(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRenaming(null); }} />
                  </span>
                ) : (
                  <button role="tab" className="pxe-floortab" aria-selected={i === fi} title={T("editor.floorRenameHint")} onClick={() => { setFi(i); setSel(null); setPop(null); }} onDoubleClick={() => { setFi(i); setRenaming(i); }}>{f.name || "-"}</button>
                )}
              </span>
            ))}
            <Tip text={T("editor.addFloor")} side="bottom">
              <button className="pxe-iconbtn" style={{ width: 30, height: 30 }} aria-label={T("editor.addFloor")} disabled={map.floors.length >= MAX_FLOORS} onClick={() => { edit((m) => { m.floors.push({ id: newId(m), name: `${m.floors.length + 1}F`, rooms: [], walls: [], doors: [], items: [] }); }); setFi(map.floors.length); setSel(null); }}><Icon n="plus" size={16} /></button>
            </Tip>
            <Menu align="left" trigger={({ toggle }) => <button className="pxe-iconbtn" style={{ width: 30, height: 30 }} aria-label={T("editor.floorMenu")} onClick={toggle}><Icon n="more" size={16} /></button>}>
              {(close) => <>
                <button role="menuitem" onClick={() => { close(); setRenaming(fi); }}>{T("editor.floorRename")}</button>
                <button role="menuitem" disabled={fi === 0} onClick={() => { close(); edit((m) => { const [f] = m.floors.splice(fi, 1); m.floors.splice(fi - 1, 0, f); }); setFi(fi - 1); }}>{T("editor.floorLeft")}</button>
                <button role="menuitem" disabled={fi >= map.floors.length - 1} onClick={() => { close(); edit((m) => { const [f] = m.floors.splice(fi, 1); m.floors.splice(fi + 1, 0, f); }); setFi(fi + 1); }}>{T("editor.floorRight")}</button>
                <hr />
                <button role="menuitem" disabled={map.floors.length <= 1} className="text-[var(--err)]" onClick={() => { close(); if (confirm(T("editor.deleteFloorConfirm", { name: floor.name }))) { edit((m) => { m.floors.splice(fi, 1); }); setFi(Math.max(0, fi - 1)); setSel(null); } }}><Icon n="trash" size={16} />{T("editor.deleteFloor")}</button>
              </>}
            </Menu>
            {tool === "wall" && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5" data-testid="tool-options">
                <div className="w-28">{kindSelect(WALL_KINDS, "editor.wallKind.", wallKind, setWallKind, T("editor.walls.kind"))}</div>
                <span className="mx-1 h-5 w-px bg-[var(--line)]" />
                <button className="pxe-btn pxe-btn-sm" onClick={autoOuter} disabled={!floor.rooms.length}><Icon n="wand" size={15} />{T("editor.walls.outer")}</button>
                <div className="w-24">{kindSelect(WALL_KINDS, "editor.wallKind.", borderKind, setBorderKind, T("editor.walls.borderKind"))}</div>
                <button className="pxe-btn pxe-btn-sm" onClick={autoBorder} disabled={floor.rooms.length < 2}><Icon n="wand" size={15} />{T("editor.walls.border")}</button>
              </div>
            )}
            {tool === "door" && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5" data-testid="tool-options">
                <span className="pxe-label !mb-0">{T("editor.kind")}</span>
                <div className="w-36">{kindSelect(DOOR_KINDS, "editor.doorKind.", doorKind, setDoorKind, T("editor.kind"))}</div>
                <span className="pxe-label !mb-0 ml-1">{T("editor.width")}</span>
                <Stepper label={T("editor.width")} value={doorW} onChange={setDoorW} step={16} min={16} />
              </div>
            )}
          </div>

          <div
            ref={wrap} data-view={`${view.x},${view.y},${view.z}`} className="relative min-h-0 min-w-0 flex-1 overflow-hidden max-[899px]:h-[60vh] max-[899px]:flex-none"
            onDragOver={(e) => { if (dragType) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setCursor(world(e)); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCursor(null); }}
            onDrop={(e) => { const ty = e.dataTransfer.getData("text/plain") || dragType; setDragType(null); if (!ty || !catOf(ty)) return; e.preventDefault(); const [x, y] = world(e); placeItem(ty, s8(x), s8(y)); }}
          >
            <canvas
              ref={canvas} width={Math.round(size.w * dpr)} height={Math.round(size.h * dpr)} tabIndex={0} aria-label={T("editor.canvas")}
              className="absolute inset-0 h-full w-full touch-none"
              style={{ cursor: signPick || tool === "item" && palette || tool === "room" || tool === "wall" ? "crosshair" : tool === "door" && doorGhost ? "copy" : "default" }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setCursor(null)} onContextMenu={(e) => e.preventDefault()}
            />

            {/* 部屋を描いた直後の小さなポップオーバー */}
            {popRoom && (
              <div className="pxe-popover absolute z-20 w-72 p-3" style={popPos} role="dialog" aria-label={T("editor.pop.title")} data-pxe-modal data-testid="room-pop" onPointerDown={(e) => e.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between"><b>{T("editor.pop.title")}</b><button className="pxe-iconbtn" style={{ width: 26, height: 26 }} aria-label={T("editor.close")} onClick={() => setPop(null)}><Icon n="x" size={15} /></button></div>
                <input ref={popInput} className="pxe-input" aria-label={T("editor.name")} maxLength={40} value={popRoom.name} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", popRoom.id, (r) => { r.name = v; }, `r-${popRoom.id}-name`); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPop(null); canvas.current?.focus(); } }} />
                <div className="mt-3"><Chips label={T("editor.roomKind")} value={popRoom.kind} options={roomKindOpts} onChange={(v) => upd("rooms", popRoom.id, (r) => { r.kind = v as MapRoom["kind"]; })} /></div>
                <div className="mt-3 flex items-center justify-between">
                  <Switch label={T("editor.outdoor")} checked={!!popRoom.outdoor} onChange={(v) => upd("rooms", popRoom.id, (r) => { r.outdoor = v || undefined; })} />
                  <button className="pxe-btn pxe-btn-primary pxe-btn-sm" onClick={() => { setPop(null); canvas.current?.focus(); }}>{T("editor.pop.ok")}<kbd>Enter</kbd></button>
                </div>
              </div>
            )}

            {/* はじめてのチェックリスト */}
            {showCheck && (
              <div className="pxe-floattool absolute bottom-3 left-3 w-64 p-2.5" data-testid="checklist">
                <div className="mb-1 flex items-center justify-between px-1"><b>{T("editor.check.title")}</b><button className="pxe-iconbtn" style={{ width: 26, height: 26 }} aria-label={T("editor.check.dismiss")} title={T("editor.check.dismiss")} onClick={() => { setDismissed(true); ls.set(CHECK_KEY, "1"); }}><Icon n="x" size={15} /></button></div>
                {steps.map((s, n) => (
                  <button key={n} className={`pxe-check ${s.done ? "done" : ""}`} onClick={s.run} data-done={s.done ? "1" : "0"}>
                    <span className="dot">{s.done ? <Icon n="check" size={12} sw={3} /> : <span className="text-[10px] font-bold text-[var(--navy)]">{n + 1}</span>}</span>
                    <span className="t">{s.text}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="pxe-zoom absolute bottom-3 right-3">
              <Tip text={T("editor.zoomOut")} side="top"><button className="pxe-iconbtn" style={{ width: 30, height: 30 }} aria-label={T("editor.zoomOut")} onClick={() => zoomBy(1 / 1.25)}><Icon n="minus" size={16} /></button></Tip>
              <span className="pct" aria-live="off">{Math.round(view.z * 100)}%</span>
              <Tip text={T("editor.zoomIn")} side="top"><button className="pxe-iconbtn" style={{ width: 30, height: 30 }} aria-label={T("editor.zoomIn")} onClick={() => zoomBy(1.25)}><Icon n="plus" size={16} /></button></Tip>
              <Tip text={T("editor.zoomFit")} side="top"><button className="pxe-iconbtn" style={{ width: 30, height: 30 }} aria-label={T("editor.zoomFit")} onClick={fit}><Icon n="fit" size={16} /></button></Tip>
            </div>
          </div>

          <div className="pxe-hintbar flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2" data-testid="hint"><Icon n={tool} size={15} className="text-[var(--navy)]" />{hint}</span>
            <span className="ml-auto flex items-center gap-3 text-[11.5px] text-[var(--ink2)]" aria-label={T("editor.legend")}>
              {ROOM_KINDS.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className="pxe-dot" style={{ background: ROOM_COLOR[k] }} />{T(`editor.roomKind.${k}`)}</span>)}
            </span>
          </div>
        </div>

        {/* ---- 右のパネル ---- */}
        {!rightOpen ? (
          <aside className="pxe-panel flex w-11 shrink-0 flex-col items-center gap-2 border-l border-[var(--line)] py-2 max-[899px]:hidden">
            <Tip text={T("editor.panel.show")} side="bottom"><button className="pxe-iconbtn" aria-label={T("editor.panel.show")} onClick={() => setRightOpen(true)}><Icon n="panel" /></button></Tip>
          </aside>
        ) : (
          <aside ref={asideRef} style={panelW !== null ? { "--pw": `${panelW}px` } as React.CSSProperties : undefined} className={`pxe-panel relative flex w-[var(--pw,23rem)] shrink-0 flex-col border-l border-[var(--line)] min-[900px]:max-w-[calc(100vw-600px)] min-[900px]:min-w-[23rem] max-[899px]:w-full max-[899px]:border-l-0 max-[899px]:border-t ${resizing ? "pxe-resizing" : ""}`}>
            <RzHandle a="w" el={asideRef} label={T("editor.resize.w")} now={panelW ?? 368} min={368} clamp={clampW} onSize={setPanelW} onDrag={(on) => setResizing(on ? "w" : null)} />
            {big && <div className="fixed inset-0 z-[74] bg-[rgba(20,26,44,.55)]" onClick={() => setBig(false)} />}
            <div ref={previewRef} style={!big && previewH !== null ? { height: previewH } : undefined} className={`pxe-preview relative shrink-0 ${big ? "big" : previewH === null ? "h-[clamp(280px,45vh,520px)]" : "max-h-[calc(100vh-200px)]"}`} data-testid="preview">
              <Preview src={previewSrc} map={map} blocked={problems.length ? T("editor.previewFix") : null} failed={T("editor.previewFailed")} />
              {!big && <RzHandle a="h" el={previewRef} label={T("editor.resize.h")} now={previewH} min={200} clamp={clampH} onSize={setPreviewH} onDrag={(on) => setResizing(on ? "h" : null)} />}
              <div className="pxe-previewbar flex gap-1.5">
                <button className="pxe-btn pxe-btn-sm" onClick={() => setBig((v) => !v)} aria-pressed={big}><Icon n={big ? "shrink" : "expand"} size={14} />{T(big ? "editor.preview.close" : "editor.preview.expand")}</button>
                {!big && <button className="pxe-iconbtn bg-white/90" style={{ width: 28, height: 28 }} aria-label={T("editor.panel.hide")} title={T("editor.panel.hide")} onClick={() => setRightOpen(false)}><Icon n="panel" size={15} /></button>}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <Section icon="sliders" cls={secProps ? "min-h-0 flex-1" : "shrink-0"} title={T("editor.panel.props")} open={secProps} onToggle={() => setSecProps((v) => !v)}>
                {!sel && <>
                  <Field label={T("editor.backdrop")}><Chips label={T("editor.backdrop")} value={map.backdrop} options={[{ v: "city", text: T("editor.backdrop.city") }, { v: "countryside", text: T("editor.backdrop.countryside") }]} onChange={(v) => edit((m) => { m.backdrop = v; })} /></Field>
                  <Field label={T("editor.floorName")}><input className="pxe-input" value={floor.name} maxLength={40} onChange={(e) => { const v = e.currentTarget.value; edit((m) => { m.floors[fi].name = v; }, `floor-name-${fi}`); }} /></Field>
                  <p className="pxe-hint mt-4">{T("editor.nothing")}</p>
                </>}
                {room && <>
                  <PropHead icon="room" title={T("editor.tool.room")} />
                  <Field label={T("editor.name")}><input className="pxe-input" maxLength={40} value={room.name} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { r.name = v; }, `r-${room.id}-name`); }} /></Field>
                  <Field label={T("editor.roomKind")}><Chips label={T("editor.roomKind")} value={room.kind} options={roomKindOpts} onChange={(v) => upd("rooms", room.id, (r) => { r.kind = v as MapRoom["kind"]; })} /></Field>
                  <Field label={T("editor.outdoor")}><Switch label={T("editor.outdoorHint")} checked={!!room.outdoor} onChange={(v) => upd("rooms", room.id, (r) => { r.outdoor = v || undefined; })} /></Field>
                  <div className="pxe-group"><h3>{T("editor.group.look")}</h3>
                    <Field label={T("editor.floorMaterial")}>
                      {FLOOR_KINDS.length > 0
                        ? <select className="pxe-input" value={room.floor ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { if (v) r.floor = v; else delete r.floor; }); }}><option value="">{T("editor.floorDefault")}</option>{FLOOR_KINDS.map((k: string) => <option key={k} value={k}>{lab("editor.floorKind.", k)}</option>)}</select>
                        : <input className="pxe-input" value={room.floor ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("rooms", room.id, (r) => { if (v) r.floor = v; else delete r.floor; }, `r-${room.id}-floor`); }} />}
                    </Field>
                  </div>
                  <div className="pxe-group"><h3>{T("editor.sign")}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Stepper label="x" value={(room.sign ?? defaultSign(room.rects[0]))[0]} step={8} onChange={(n) => upd("rooms", room.id, (r) => { r.sign = [n, (r.sign ?? defaultSign(r.rects[0]))[1]]; }, `r-${room.id}-sx`)} />
                      <Stepper label="y" value={(room.sign ?? defaultSign(room.rects[0]))[1]} step={8} onChange={(n) => upd("rooms", room.id, (r) => { r.sign = [(r.sign ?? defaultSign(r.rects[0]))[0], n]; }, `r-${room.id}-sy`)} />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className={`pxe-btn pxe-btn-sm ${signPick ? "pxe-btn-primary" : ""}`} onClick={() => setSignPick(!signPick)}>{T("editor.pickSign")}</button>
                      {room.sign && <button className="pxe-btn pxe-btn-sm" onClick={() => upd("rooms", room.id, (r) => { delete r.sign; })}>{T("editor.signClear")}</button>}
                    </div>
                  </div>
                  <div className="pxe-group"><h3>{T("editor.rects")}</h3>
                    <ul className="mt-2">{room.rects.map((r, i) => <li key={i} className="flex items-center justify-between py-0.5 text-[12px] text-[var(--ink2)]"><span>{r[2] - r[0]} × {r[3] - r[1]} <span className="text-[var(--ink3)]">({r[0]}, {r[1]})</span></span><button className="pxe-iconbtn" style={{ width: 26, height: 26 }} aria-label={T("editor.removeRect")} disabled={room.rects.length <= 1} onClick={() => upd("rooms", room.id, (o) => { o.rects.splice(i, 1); })}><Icon n="x" size={14} /></button></li>)}</ul>
                    <p className="pxe-hint">{T("editor.rectHint2")}</p>
                  </div>
                </>}
                {wall && <>
                  <PropHead icon="wall" title={T("editor.tool.wall")} />
                  <Field label={T("editor.kind")}><Chips label={T("editor.kind")} value={wall.kind} options={kindOpts(WALL_KINDS, "editor.wallKind.")} onChange={(v) => edit((m) => { m.floors[fi].walls[wallIdx].kind = v; })} /></Field>
                  <p className="pxe-hint mt-3">{T("editor.length")}: {wall.b - wall.a}</p>
                </>}
                {door && <>
                  <PropHead icon="door" title={T("editor.tool.door")} />
                  <Field label={T("editor.kind")}><Chips label={T("editor.kind")} value={door.kind} options={kindOpts(DOOR_KINDS, "editor.doorKind.")} onChange={(v) => upd("doors", door.id, (d) => { d.kind = v; })} /></Field>
                  <Field label={T("editor.width")}><Stepper label={T("editor.width")} value={door.b - door.a} step={8} min={8} onChange={(n) => upd("doors", door.id, (d) => { d.b = d.a + Math.max(8, n); }, `d-${door.id}-w`)} /></Field>
                </>}
                {item && (() => {
                  const c = catOf(item.type);
                  const dirs = c?.dirs ?? [item.dir];
                  return <>
                    <div className="mt-3 flex items-center gap-3"><Thumb id={item.type} sheet={thumbs} base={thumbsBase} size={52} /><div><b className="text-[14px]">{lab("catalog.", item.type)}</b><div className="pxe-hint !mt-0">{catName(catKey(item.type))}</div></div></div>
                    <Field label={T("editor.dir")}>
                      <div className="flex items-center gap-2">
                        <button className="pxe-iconbtn border-[var(--line)]" aria-label={T("editor.rotateL")} title={`${T("editor.rotateL")} (Shift+R)`} disabled={dirs.length < 2} onClick={() => rotate(1)}><Icon n="rotccw" /></button>
                        <DirArrow angle={DIR_ANGLE[item.dir] ?? 0} />
                        <button className="pxe-iconbtn border-[var(--line)]" aria-label={T("editor.rotateR")} title={`${T("editor.rotateR")} (R)`} disabled={dirs.length < 2} onClick={() => rotate(-1)}><Icon n="rotcw" /></button>
                      </div>
                    </Field>
                    <div className="pxe-group"><h3>{T("editor.group.position")}</h3>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <Field label="x"><Stepper label="x" value={item.x} step={8} onChange={(n) => upd("items", item.id, (o) => { o.x = n; }, `i-${item.id}-x`)} /></Field>
                        <Field label="y"><Stepper label="y" value={item.y} step={8} onChange={(n) => upd("items", item.id, (o) => { o.y = n; }, `i-${item.id}-y`)} /></Field>
                      </div>
                    </div>
                    <div className="pxe-group"><h3>{T("editor.group.settings")}</h3>
                      <Field label={T("editor.season")}><select className="pxe-input" value={item.season ?? ""} onChange={(e) => { const v = e.currentTarget.value; upd("items", item.id, (o) => { if (v) o.season = v; else delete o.season; }); }}><option value="">-</option>{VO_EVENT_DECORS.map((s) => <option key={s.id} value={s.id}>{T(`season.${s.id}`)}</option>)}</select></Field>
                      {Object.entries(c?.props ?? {}).map(([k, def]) => {
                        const v = item.props?.[k] ?? def;
                        const set = (x: unknown, key?: string) => upd("items", item.id, (o) => { o.props = { ...o.props, [k]: x }; }, key);
                        if (typeof def === "number") return <Field key={k} label={lab("editor.prop.", k)}><Stepper label={lab("editor.prop.", k)} value={typeof v === "number" ? v : def} onChange={(n) => set(n, `i-${item.id}-${k}`)} /></Field>;
                        if (typeof def === "string") return <Field key={k} label={lab("editor.prop.", k)}><input className="pxe-input" maxLength={40} value={typeof v === "string" ? v : def} onChange={(e) => set(e.currentTarget.value, `i-${item.id}-${k}`)} /></Field>;
                        if (typeof def === "boolean") return <Field key={k} label={lab("editor.prop.", k)}><Switch label={v === true ? T("editor.on") : T("editor.off")} checked={v === true} onChange={(b) => set(b)} /></Field>;
                        return null;
                      })}
                    </div>
                  </>;
                })()}
                {sel && (
                  <div className="mt-4 flex gap-2">
                    {item && <button className="pxe-btn" onClick={duplicate}><Icon n="copy" size={15} />{T("editor.dup")}<kbd className="!bg-[var(--bg)] !text-[var(--ink2)] !border-[var(--line)]">Ctrl+D</kbd></button>}
                    <button className="pxe-btn pxe-btn-danger" onClick={remove}><Icon n="trash" size={15} />{T("editor.delete")}</button>
                  </div>
                )}
              </Section>
              <Section icon="shield" cls="shrink-0 max-h-[45%]" title={T("editor.panel.checks")} open={secChecks} onToggle={() => setSecChecks((v) => !v)}
                badge={<span className="flex gap-1">{problems.length > 0 && <span className="pxe-pill error">{problems.length}</span>}{warns.length > 0 && <span className="pxe-pill warning">{warns.length}</span>}</span>}>
                {issues.length === 0 && <p className="pxe-issue" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon n="ok" size={16} />{T("editor.noProblems")}</p>}
                <ul data-testid="issues">{issueList(issues, true)}</ul>
              </Section>
            </div>
          </aside>
        )}
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-14 z-[90] flex justify-center">{msg && <span className="pxe-toast">{msg}</span>}</div>

      {dlg && (
        <div role="dialog" aria-modal="true" data-pxe-modal aria-label={T(dlg === "publish" ? "editor.publish" : dlg === "sample" ? "editor.openSample" : dlg === "help" ? "editor.shortcuts" : "editor.versions")} className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(20,26,44,.5)] p-4" onClick={() => setDlg(null)}>
          <div className="pxe-dialog max-h-[85vh] w-[34rem] max-w-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            {dlg === "publish" && <>
              <h2 className="text-base font-bold">{T("editor.publishCheck")}</h2>
              {(serverIssues ?? issues).length === 0 ? <p className="pxe-issue mt-3" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon n="ok" size={16} />{T("editor.noProblems")}</p> : <ul className="mt-2">{issueList(serverIssues ?? issues, false)}</ul>}
              <p className="pxe-hint mt-3">{T("editor.publishNote")}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button className="pxe-btn" onClick={() => setDlg(null)}>{T("editor.close")}</button>
                <button className="pxe-btn pxe-btn-primary" disabled={busy || (serverIssues ?? issues).some((i) => i.level === "error")} onClick={() => void publish()} autoFocus><Icon n="send" size={15} />{T("editor.publishDo")}</button>
              </div>
            </>}
            {dlg === "sample" && <>
              <h2 className="text-base font-bold">{T("editor.openSample")}</h2>
              <p className="mt-2">{T("editor.sampleConfirm")}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button className="pxe-btn" onClick={() => setDlg(null)}>{T("editor.sampleCancel")}</button>
                <button className="pxe-btn pxe-btn-primary" onClick={() => void openSample()} autoFocus>{T("editor.sampleDo")}</button>
              </div>
            </>}
            {dlg === "versions" && <>
              <h2 className="text-base font-bold">{T("editor.versions")}</h2>
              {versions.length === 0 && <p className="pxe-hint mt-3">{T("editor.noVersions")}</p>}
              <ul className="mt-2">{versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-2">
                  <span><b>#{v.id}</b> <span className="text-[var(--ink2)]">{new Date(v.createdAt).toLocaleString(locale)} {v.createdBy ?? ""}</span></span>
                  <button className="pxe-btn pxe-btn-sm" disabled={busy} onClick={() => void restore(v.id)}>{T("editor.restore")}</button>
                </li>
              ))}</ul>
              <div className="mt-4 flex justify-end"><button className="pxe-btn" onClick={() => setDlg(null)}>{T("editor.close")}</button></div>
            </>}
            {dlg === "help" && <>
              <div className="flex items-center justify-between"><h2 className="text-base font-bold">{T("editor.shortcuts")}</h2><button className="pxe-iconbtn" aria-label={T("editor.close")} onClick={() => setDlg(null)}><Icon n="x" /></button></div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
                {([
                  ...TOOLS.map((k) => [T(`editor.tool.${k}`), k === "select" ? "V / 1" : TOOL_KEY[k]] as const),
                  [T("editor.sc.rotate"), "R / Shift+R"], [T("editor.sc.delete"), "Delete"], [T("editor.sc.nudge"), "← ↑ ↓ →"],
                  [T("editor.undo"), "Ctrl/Cmd+Z"], [T("editor.redo"), "Shift+Ctrl/Cmd+Z"], [T("editor.saveDraft"), "Ctrl/Cmd+S"], [T("editor.dup"), "Ctrl/Cmd+D"],
                  [T("editor.sc.zoom"), "+ / - / Wheel"], [T("editor.sc.pan"), "Space + Drag"], [T("editor.sc.shift"), "Shift + Drag"], [T("editor.sc.esc"), "Esc"], [T("editor.shortcuts"), "?"],
                ] as const).map(([a, b]) => <div key={a + b} className="contents"><span>{a}</span><span className="justify-self-end"><span className="pxe-kbd">{b}</span></span></div>)}
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

function PropHead({ icon, title }: { icon: string; title: string }) {
  return <div className="mt-3 flex items-center gap-2 text-[14px] font-bold text-[var(--navy)]"><Icon n={icon} size={18} />{title}</div>;
}
