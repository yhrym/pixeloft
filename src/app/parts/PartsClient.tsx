"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { setCustomParts } from "@/engine/sprites.js";
import type { PartKind } from "@/lib/parts/validate";
import { Wordmark } from "../components";
import { drawBody, type Look, type Msgs, type PartView } from "./lib";

function Thumb({ part, look }: { part: PartView; look: Look }) {
  const f = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // 髪型を見せるときは小物を外す(帽子で隠れないように)
    const worn = { ...look, [part.kind]: `u:${part.id}`, ...(part.kind === "hair" ? { ac: "none" } : null) };
    if (f.current) drawBody(f.current, worn, false, 3);
    if (b.current) drawBody(b.current, worn, true, 3);
  }, [part, look]);
  return <div className="flex gap-1"><canvas ref={f} style={{ imageRendering: "pixelated" }} /><canvas ref={b} style={{ imageRendering: "pixelated" }} /></div>;
}

export function PartsClient({ parts: initial, look, meId, isAdmin, m }: { parts: PartView[]; look: Look; meId: string; isAdmin: boolean; m: Msgs }) {
  const [parts, setParts] = useState(initial);
  const [error, setError] = useState("");
  // サムネイルより先に、全部のパーツをエンジンに登録する(自分が着ているパーツも見えるように)
  setCustomParts(parts.map((p) => ({ id: p.id, kind: p.kind, data: p.data })));

  async function remove(p: PartView) {
    if (!confirm(m["parts.deleteConfirm"].replace("{name}", p.name))) return;
    const res = await fetch(`/api/office/parts/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setParts((cur) => cur.filter((x) => x.id !== p.id));
    else setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? m["parts.network"]);
  }
  return (
    <>
      <div className="pg-bar"><Wordmark /><Link className="pg-back" href="/">{"← "}{m["parts.toOffice"]}</Link></div>
      <h1 className="pg-title">{m["parts.title"]}</h1>
      <p className="pg-sub">{m["parts.sub"]}</p>
      {error && <p role="alert" className="pg-error">{error}</p>}
      {(["hair", "ot", "ac"] as PartKind[]).map((k) => (
        <section key={k} className="pg-card">
          <h2 className="flex items-center justify-between gap-3">{m[`parts.kind.${k}`]}<a className="pg-btn pg-btn-sm" href={`/parts/new?kind=${k}`}>{m["parts.new"]}</a></h2>
          <ul className="pg-parts">
            {parts.filter((p) => p.kind === k).map((p) => (
              <li key={p.id} className="pg-part" data-part={p.id}>
                <Thumb part={p} look={look} />
                <div className="pg-part-name">{p.name}</div>
                <div className="pg-hint" style={{ marginTop: 0 }}>{m["parts.by"].replace("{name}", p.createdByName)}</div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <a className="pg-link" href={`/parts/new?from=${p.id}`}>{m["parts.copyAndEdit"]}</a>
                  {(isAdmin || p.createdById === meId) && <>
                    <a className="pg-link" href={`/parts/${p.id}/edit`}>{m["parts.edit"]}</a>
                    <button type="button" className="pg-link pg-link-danger" onClick={() => remove(p)}>{m["parts.delete"]}</button>
                  </>}
                </div>
              </li>
            ))}
            {parts.every((p) => p.kind !== k) && <li className="pg-muted">{m["parts.empty"]}</li>}
          </ul>
        </section>
      ))}
    </>
  );
}
