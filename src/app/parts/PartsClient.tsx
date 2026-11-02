"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { setCustomParts } from "@/engine/sprites.js";
import type { PartKind } from "@/lib/parts/validate";
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
      <h1 className="text-xl">{m["parts.title"]}</h1>
      <p className="mt-1 text-sm text-neutral-600">{m["parts.sub"]}</p>
      <p className="mt-2"><Link className="underline" href="/">{m["parts.toOffice"]}</Link></p>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      {(["hair", "ot", "ac"] as PartKind[]).map((k) => (
        <section key={k} className="mt-5">
          <h2 className="flex items-center gap-3">{m[`parts.kind.${k}`]}<a className="text-sm underline" href={`/parts/new?kind=${k}`}>{m["parts.new"]}</a></h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {parts.filter((p) => p.kind === k).map((p) => (
              <li key={p.id} className="rounded border border-neutral-300 p-2" data-part={p.id}>
                <Thumb part={p} look={look} />
                <div className="mt-1 font-bold">{p.name}</div>
                <div className="text-xs text-neutral-600">{m["parts.by"].replace("{name}", p.createdByName)}</div>
                <div className="mt-1 flex gap-3 text-sm">
                  <a className="underline" href={`/parts/new?from=${p.id}`}>{m["parts.copyAndEdit"]}</a>
                  {(isAdmin || p.createdById === meId) && <>
                    <a className="underline" href={`/parts/${p.id}/edit`}>{m["parts.edit"]}</a>
                    <button type="button" className="underline" onClick={() => remove(p)}>{m["parts.delete"]}</button>
                  </>}
                </div>
              </li>
            ))}
            {parts.every((p) => p.kind !== k) && <li className="text-sm text-neutral-500">{m["parts.empty"]}</li>}
          </ul>
        </section>
      ))}
    </>
  );
}
