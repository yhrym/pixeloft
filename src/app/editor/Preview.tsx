"use client";

import { useEffect, useRef, useState } from "react";
import type { OfficeMap } from "@/engine/map.js";

/** 本番と同じエンジンで描く(iframeの中。./preview)。mapが変わって500msたったら描き直す。blocked: エラーがあって描かない理由 */
export default function Preview({ src, map, blocked, failed }: { src: string; map: OfficeMap; blocked: string | null; failed: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const state = useRef({ ready: false, map, blocked });
  const [error, setError] = useState(false);

  useEffect(() => {
    const post = () => {
      const s = state.current;
      if (s.ready && !s.blocked) frame.current?.contentWindow?.postMessage({ type: "map", map: s.map }, location.origin);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "ready") { state.current.ready = true; post(); }
      else if (e.data?.type === "result") setError(!e.data.ok);
    };
    window.addEventListener("message", onMessage);
    state.current = { ...state.current, map, blocked };
    const timer = setTimeout(post, 500);
    return () => { clearTimeout(timer); window.removeEventListener("message", onMessage); };
  }, [map, blocked]);

  return (
    <div className="relative h-full w-full bg-neutral-200">
      <iframe ref={frame} src={src} title="preview" className="h-full w-full border-0" />
      {(blocked || error) && <p className="absolute inset-x-0 top-1 bg-white/90 text-center text-sm text-red-700">{blocked ?? failed}</p>}
    </div>
  );
}
