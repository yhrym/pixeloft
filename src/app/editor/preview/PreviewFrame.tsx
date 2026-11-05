"use client";

import { useEffect, useRef } from "react";
import "@fontsource/dotgothic16/400.css";
import "@/engine/office.css";
import type { OfficeMap } from "@/engine/map.js";
import type { OfficeCamera, OfficeHandle } from "@/engine/office.js";
import { t, type Locale } from "@/i18n";
import type { VoState } from "@/lib/virtual-office/types";

/** 在室者のいない状態。プレビューは見た目を見るだけ */
const emptyState = (): VoState => ({
  serverTime: new Date().toISOString(), date: "2000-01-01", meId: "", people: [], messages: [], events: [], lastEventId: 0, meetUrls: {},
  autoLeftAt: null, talkingUserIds: [], talkingRooms: [], emotes: [], isAdmin: true, season: null, partsVersion: 0,
});

/** 親(エディタ)からpostMessageで受け取ったマップを、前のものをdestroyしてから描き直す */
export function PreviewFrame({ locale }: { locale: Locale }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let handle: OfficeHandle | null = null;
    let camera: OfficeCamera | undefined;
    let root: HTMLDivElement | null = null;
    const clear = () => {
      try { handle?.destroy(); } catch { /* 途中で失敗したマウントの後始末 */ }
      root?.remove();
      handle = root = null;
    };
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent || e.data?.type !== "map") return;
      try { camera = handle?.camera(); } catch { /* 前のマウントが壊れていたら全体から */ }
      clear();
      try {
        const { mountOffice } = await import("@/engine/office.js");
        root = document.createElement("div");
        host.current!.appendChild(root);
        handle = mountOffice(root, { map: e.data.map as OfficeMap, appName: "Pixeloft", initial: emptyState(), weather: null, send: () => Promise.reject(new Error("preview")), timeOfDay: "day", weatherKind: "sunny", preview: true, camera, t: (key, vars) => t(locale, key, vars) });
        parent.postMessage({ type: "result", ok: true }, location.origin);
      } catch {
        // shortcut: エンジンが描けない形のマップはメッセージだけ出す
        clear();
        parent.postMessage({ type: "result", ok: false }, location.origin);
      }
    };
    window.addEventListener("message", onMessage);
    parent.postMessage({ type: "ready" }, location.origin);
    return () => { window.removeEventListener("message", onMessage); clear(); };
  }, [locale]);
  return <div ref={host} className="vo-page" />;
}
