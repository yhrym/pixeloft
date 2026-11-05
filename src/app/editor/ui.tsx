"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { pluginThumbs, type Thumbs } from "./draw";

const P: Record<string, string[]> = {
  select: ["M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"],
  room: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 12h6", "M15 12h6", "M12 3v6", "M12 15v6"],
  wall: ["M3 3h18v18H3z", "M3 9h18", "M3 15h18", "M12 3v6", "M7.5 9v6", "M16.5 9v6", "M12 15v6"],
  door: ["M13 4h3a2 2 0 0 1 2 2v14", "M2 20h3", "M13 20h9", "M10 12v.01", "M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"],
  item: ["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", "M3.3 7 12 12l8.7-5", "M12 22V12"],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  redo: ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"],
  more: ["M12 12h.01", "M19 12h.01", "M5 12h.01"],
  search: ["m21 21-4.34-4.34", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
  down: ["m6 9 6 6 6-6"], right: ["m9 18 6-6-6-6"], left: ["m15 18-6-6 6-6"],
  plus: ["M5 12h14", "M12 5v14"], minus: ["M5 12h14"],
  x: ["M18 6 6 18", "M6 6l12 12"], check: ["M20 6 9 17l-5-5"],
  warn: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  error: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 8v4", "M12 16h.01"],
  ok: ["M21.801 10A10 10 0 1 1 17 3.335", "m9 11 3 3L22 4"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  copy: ["M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  rotcw: ["M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5"],
  rotccw: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  expand: ["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"],
  shrink: ["M8 3v3a2 2 0 0 1-2 2H3", "M21 8h-3a2 2 0 0 1-2-2V3", "M3 16h3a2 2 0 0 1 2 2v3", "M16 21v-3a2 2 0 0 1 2-2h3"],
  panel: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M15 3v18"],
  arrow: ["M12 19V5", "m5 12 7-7 7 7"],
  work: ["M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", "M20 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"],
  meeting: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  break: ["M10 2v2", "M14 2v2", "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"],
  free: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M8 14s1.5 2 4 2 4-2 4-2", "M9 9h.01", "M15 9h.01"],
  hall: ["m18 8 4 4-4 4", "M2 12h20", "m6 8-4 4 4 4"],
  sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  help: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  history: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  folder: ["m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"],
  send: ["M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z", "m21.854 2.147-10.94 10.939"],
  wand: ["m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72", "m14 7 3 3", "M5 6v4", "M19 14v4", "M10 2v2", "M7 8H3", "M21 16h-4", "M11 3H9"],
  save: ["M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", "M7 3v4a1 1 0 0 0 1 1h7"],
  back: ["m12 19-7-7 7-7", "M19 12H5"],
  sliders: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  shield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z", "m9 12 2 2 4-4"],
  fit: ["M15 3h6v6", "M9 21H3v-6", "m21 3-7 7", "m3 21 7-7"],
  pointer: ["M12 5v14", "m19 12-7 7-7-7"],
};

export function Icon({ n, size = 18, className = "", sw = 2 }: { n: string; size?: number; className?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      {(P[n] ?? P.item).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** 向きの矢印(画面上の向き) */
export function DirArrow({ angle, size = 28 }: { angle: number; size?: number }) {
  return (
    <span className="pxe-dirbox" style={{ width: size * 1.6, height: size * 1.6 }} aria-hidden="true">
      <span style={{ display: "inline-flex", transform: `rotate(${angle}deg)` }}><Icon n="arrow" size={size} sw={2.4} /></span>
    </span>
  );
}

/** サムネイル(スプライト)。なければ・idがなければ中立のアイコン */
export function Thumb({ id, sheet, base, size = 48 }: { id: string; sheet: Omit<Thumbs, "img"> | null; base: string; size?: number }) {
  const i = sheet?.idx.get(id);
  if (i === undefined && Object.hasOwn(pluginThumbs, id)) return <span className="pxe-thumb" aria-hidden="true" style={{ width: size, height: size, backgroundImage: `url(${pluginThumbs[id]})`, backgroundSize: "100% 100%" }} />;
  if (!sheet || i === undefined) return <span className="pxe-thumb pxe-thumb-empty" style={{ width: size, height: size }}><Icon n="item" size={size * 0.42} /></span>;
  const k = size / sheet.size;
  return (
    <span
      className="pxe-thumb" aria-hidden="true"
      style={{ width: size, height: size, backgroundImage: `url(${base}catalog-thumbs.png)`, backgroundSize: `${sheet.cols * size}px auto`, backgroundPosition: `${-(i % sheet.cols) * sheet.size * k}px ${-Math.floor(i / sheet.cols) * sheet.size * k}px` }}
    />
  );
}

export function Tip({ text, keys, children, side = "right" }: { text: string; keys?: string; children: ReactNode; side?: "right" | "bottom" | "top" }) {
  return (
    <span className="pxe-tipwrap">
      {children}
      <span role="tooltip" className={`pxe-tip pxe-tip-${side}`}>{text}{keys && <kbd>{keys}</kbd>}</span>
    </span>
  );
}

export function Section({ icon, title, badge, open, onToggle, children, cls = "" }: { icon: string; title: string; badge?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; cls?: string }) {
  return (
    <section className={`pxe-sec ${cls} flex flex-col`}>
      <button className="pxe-sechead" onClick={onToggle} aria-expanded={open}>
        <Icon n={open ? "down" : "right"} size={14} />
        <Icon n={icon} size={16} />
        <span className="flex-1 text-left">{title}</span>
        {badge}
      </button>
      {open && <div className="pxe-scroll min-h-0 flex-1 overflow-auto px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="pxe-field">
      <div className="pxe-label">{label}</div>
      <div>{children}</div>
      {hint && <p className="pxe-hint">{hint}</p>}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; label: string }) {
  const set = (n: number) => onChange(min !== undefined ? Math.max(min, n) : n);
  return (
    <span className="pxe-stepper">
      <button type="button" aria-label={`${label} -`} onClick={() => set(value - step)}><Icon n="minus" size={14} /></button>
      <input aria-label={label} type="number" step={step} value={value} onChange={(e) => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) set(n); }} />
      <button type="button" aria-label={`${label} +`} onClick={() => set(value + step)}><Icon n="plus" size={14} /></button>
    </span>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; text: string; icon?: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={`pxe-chip ${value === o.v ? "on" : ""}`} onClick={() => onChange(o.v)}>
          {o.icon && <span className="pxe-chip-ico" style={o.color ? { color: o.color } : undefined}><Icon n={o.icon} size={15} /></span>}
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="pxe-switch" onClick={() => onChange(!checked)}>
      <span className="pxe-switch-track"><span className="pxe-switch-knob" /></span>
      <span>{label}</span>
    </button>
  );
}

/** メニュー(外をクリック・Escで閉じる) */
export function Menu({ trigger, children, align = "right" }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && <div role="menu" className={`pxe-menu ${align === "right" ? "right-0" : "left-0"}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
