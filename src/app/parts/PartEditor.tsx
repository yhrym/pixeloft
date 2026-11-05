"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PAL, mkMap, setCustomParts } from "@/engine/sprites.js";
import { ACC_X_MIN, ACC_Y_MAX, ACC_Y_MIN, allowedChars, HAIR_PAD_MAX, HAIR_Y_MIN, NAME_MAX, ROLE_CHARS, validatePart, copyName, type PartKind } from "@/lib/parts/validate";
import { drawSitting, H, layout, S, W, X0, Y0, type Look, type Msgs, type PartView } from "./lib";

type Data = { pad?: number; x?: number; y?: number; hat?: boolean; f: string[]; b?: string[] | null };
const DRAFT = "draft";
const blank = (w: number, rows: number) => Array.from({ length: rows }, () => ".".repeat(w));
const fit = (rows: string[], w: number, n: number) => Array.from({ length: n }, (_, i) => (rows[i] ?? "").slice(0, w).padEnd(w, "."));
/** 左右の余白がd列ふえた(負なら減った)ときの行 */
const pad = (r: string, d: number) => (d >= 0 ? ".".repeat(d) + r + ".".repeat(d) : r.slice(-d, r.length + d));

/** from: コピー元(新規として保存する。絵と名前の初期値だけ使う) */
export function PartEditor({ kind, part, from, parts, look, m }: { kind: PartKind; part: PartView | null; from?: PartView | null; parts: PartView[]; look: Look; m: Msgs }) {
  const seed = part ?? from;
  const init = (seed?.data ?? {}) as Data;
  const [name, setName] = useState(part?.name ?? (from ? copyName(m["parts.copyName"], from.name) : ""));
  const [hairPad, setHairPad] = useState(init.pad ?? 0);
  const [accX, setAccX] = useState(init.x ?? 0);
  const [y, setY] = useState(init.y ?? (kind === "hair" ? 0 : kind === "ac" ? 6 : 12));
  const [hat, setHat] = useState(!!init.hat);
  const [hasBack, setHasBack] = useState(kind !== "ac" || !seed || !!init.b);
  const lay0 = layout(kind, { pad: init.pad ?? 0, x: init.x ?? 0, y: 0 });
  const [f, setF] = useState(() => fit(init.f ?? [], lay0.w, lay0.rows));
  const [b, setB] = useState(() => fit(init.b ?? [], lay0.w, lay0.rows));
  const [side, setSide] = useState<"f" | "b">("f");
  const [tool, setTool] = useState<"pencil" | "eraser" | "pick">("pencil");
  const [color, setColor] = useState(kind === "ot" ? "C" : kind === "hair" ? "H" : "K");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const main = useRef<HTMLCanvasElement>(null), pvF = useRef<HTMLCanvasElement>(null), pvB = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const lay = layout(kind, { pad: hairPad, x: accX, y });
  const data = useMemo((): Data => {
    // 下の空行は削って保存する(1行は残す)
    const trim = (rows: string[]) => { let n = rows.length; while (n > 1 && /^\.*$/.test(rows[n - 1])) n--; return kind === "ot" ? rows : rows.slice(0, n); };
    if (kind === "hair") return { pad: hairPad, y, f: trim(f), b: trim(b) };
    if (kind === "ot") return { f, b };
    return { x: accX, y, hat, f: trim(f), b: hasBack ? trim(b) : null };
  }, [kind, hairPad, accX, y, hat, hasBack, f, b]);

  // 自分の体の上に、描きかけのパーツを着せて見せる(ほかのパーツは今あるものを使う)
  const worn = useMemo(() => ({ ...look, [kind]: `u:${DRAFT}` }), [look, kind]);
  useEffect(() => {
    const others = parts.filter((p) => p.id !== part?.id).map((p) => ({ id: p.id, kind: p.kind, data: p.data }));
    setCustomParts([...others, { id: DRAFT, kind, data }]);
    if (main.current) drawSitting(main.current, worn, side === "b", S, "#ccd8e2");
    if (pvF.current) drawSitting(pvF.current, worn, false, 3, "#ccd8e2");
    if (pvB.current) drawSitting(pvB.current, worn, true, 3, "#ccd8e2");
  }, [data, worn, parts, part, kind, side]);

  const rows = side === "f" ? f : b, setRows = side === "f" ? setF : setB;
  const cellAt = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const u = Math.floor(((e.clientX - r.left) / r.width) * W) + X0 - lay.ox, v = Math.floor(((e.clientY - r.top) / r.height) * H) + Y0 - lay.oy;
    return u >= 0 && u < lay.w && v >= 0 && v < lay.rows ? { u, v } : null;
  };
  const paint = (e: React.PointerEvent) => {
    const c = cellAt(e); if (!c) return;
    if (tool === "pick") { const ch = rows[c.v][c.u]; if (ch === ".") setTool("eraser"); else { setColor(ch); setTool("pencil"); } drawing.current = false; return; }
    const ch = tool === "eraser" ? "." : color;
    if (rows[c.v][c.u] === ch) return;
    setRows(rows.map((r, i) => (i === c.v ? r.slice(0, c.u) + ch + r.slice(c.u + 1) : r)));
  };
  // はみ出しの幅を変えたら、両側に列を足す・削る
  const resize = (d: number) => { setF(f.map((r) => pad(r, d))); setB(b.map((r) => pad(r, d))); };
  const roles = [...ROLE_CHARS[kind], ..."SsK"];
  const fixed = [...allowedChars(kind)].filter((c) => !roles.includes(c));
  const map = mkMap(look) as Record<string, string>;
  const swatch = (ch: string) => (
    <button key={ch} type="button" title={ch} aria-label={ch} aria-pressed={tool === "pencil" && color === ch} onClick={() => { setColor(ch); setTool("pencil"); }}
      style={{ width: 24, height: 24, border: "2px solid #241c2b", outline: tool === "pencil" && color === ch ? "2px solid #f5c851" : "none", background: (PAL as Record<string, string>)[map[ch] ?? ch] }} />
  );

  async function save() {
    const body = { kind, name, data };
    const v = validatePart(body);
    if (!v.ok) { setError(m[v.error.key]?.replace("{max}", String(NAME_MAX)) ?? v.error.key); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(part ? `/api/office/parts/${part.id}` : "/api/office/parts", { method: part ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v.part) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(j.error ?? m["parts.network"]); setBusy(false); return; }
      location.assign("/parts");
    } catch { setError(m["parts.network"]); setBusy(false); }
  }

  const num = "pg-input pg-num";
  const btn = () => "pg-seg-btn";
  return (
    <div className="pg-card pg-ed">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="pg-seg">
          <button type="button" className={btn()} aria-pressed={side === "f"} onClick={() => setSide("f")}>{m["parts.front"]}</button>
          {hasBack && <button type="button" className={btn()} aria-pressed={side === "b"} onClick={() => setSide("b")}>{m["parts.back"]}</button>}
          </div>
          <div className="pg-seg">
          {(["pencil", "eraser", "pick"] as const).map((t) => <button key={t} type="button" className={btn()} aria-pressed={tool === t} onClick={() => setTool(t)}>{m[`parts.tool.${t}`]}</button>)}
                    </div>
          <button type="button" className="pg-btn pg-btn-sm" onClick={() => setRows(blank(lay.w, lay.rows))}>{m["parts.clear"]}</button>
          {hasBack && <button type="button" className="pg-btn pg-btn-sm" onClick={() => setB(f)}>{m["parts.copy"]}</button>}
        </div>
        <div className="relative inline-block touch-none select-none" style={{ width: W * S, height: H * S, cursor: tool === "pick" ? "crosshair" : "cell" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; paint(e); }}
          onPointerMove={(e) => { if (drawing.current) paint(e); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }}>
          <canvas ref={main} data-testid="part-canvas" style={{ width: W * S, height: H * S, imageRendering: "pixelated", display: "block" }} />
          {/* マス目と、描けるはんいの枠 */}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.12) 1px, transparent 1px)", backgroundSize: `${S}px ${S}px` }} />
          <div className="pointer-events-none absolute" style={{ left: (lay.ox - X0) * S, top: (lay.oy - Y0) * S, width: lay.w * S, height: lay.rows * S, outline: "2px dashed #d33" }} />
        </div>
        <p className="pg-hint">{m["parts.hint"]}</p>
      </div>
      <div className="pg-ed-side">
        <label className="pg-field"><span className="pg-label">{m["parts.name"]}</span><input className="pg-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} /></label>
        <div>
          <div className="pg-label">{m["parts.roleColors"]}</div>
          <div className="mt-1 flex flex-wrap gap-1">{roles.map(swatch)}</div>
          <div className="pg-label" style={{ marginTop: 10 }}>{m["parts.fixedColors"]}</div>
          <div className="mt-1 flex max-w-72 flex-wrap gap-1">{fixed.map(swatch)}</div>
        </div>
        {kind === "hair" && (
          <div className="pg-row">
            <label>{m["parts.pad"]}<input className={num} type="number" min={0} max={HAIR_PAD_MAX} value={hairPad} onChange={(e) => { const n = Math.max(0, Math.min(HAIR_PAD_MAX, Math.round(+e.target.value || 0))); resize(n - hairPad); setHairPad(n); }} /></label>
            <label>{m["parts.y"]}<input className={num} type="number" min={HAIR_Y_MIN} max={0} value={y} onChange={(e) => setY(Math.max(HAIR_Y_MIN, Math.min(0, Math.round(+e.target.value || 0))))} /></label>
          </div>
        )}
        {kind === "ac" && (
          <div className="space-y-2 pg-ed-ac"><div className="pg-row">
            <label>{m["parts.pad"]}<input className={num} type="number" min={0} max={-ACC_X_MIN} value={-accX} onChange={(e) => { const n = -Math.max(0, Math.min(-ACC_X_MIN, Math.round(+e.target.value || 0))); resize(accX - n); setAccX(n); }} /></label>
            <label>{m["parts.y"]}<input className={num} type="number" min={ACC_Y_MIN} max={ACC_Y_MAX} value={y} onChange={(e) => setY(Math.max(ACC_Y_MIN, Math.min(ACC_Y_MAX, Math.round(+e.target.value || 0))))} /></label>
            </div><div><label><input type="checkbox" checked={hat} onChange={(e) => setHat(e.target.checked)} /> {m["parts.hat"]}</label></div>
            <div><label><input type="checkbox" checked={hasBack} onChange={(e) => { setHasBack(e.target.checked); if (!e.target.checked) setSide("f"); }} /> {m["parts.hasBack"]}</label></div>
          </div>
        )}
        <div>
          <div className="pg-label">{m["parts.preview"]}</div>
          <div className="mt-1 flex gap-2"><canvas ref={pvF} style={{ imageRendering: "pixelated" }} /><canvas ref={pvB} style={{ imageRendering: "pixelated" }} /></div>
        </div>
        {error && <p role="alert" className="pg-error">{error}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={save} className="pg-btn pg-btn-primary disabled:opacity-50">{busy ? m["parts.saving"] : m["parts.save"]}</button>
          <a className="pg-btn" href="/parts">{m["parts.toList"]}</a>
        </div>
      </div>
    </div>
  );
}
