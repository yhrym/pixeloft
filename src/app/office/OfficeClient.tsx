"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import "@fontsource/dotgothic16/400.css";
import "@/engine/office.css";
import type { OfficeMap } from "@/engine/map.js";
import type { OfficeHandle, OfficeOptions, OfficePart, OfficeWeather } from "@/engine/office.js";
import { t as tr, type Locale } from "@/i18n";
import { canPush, subscribeToPush } from "@/lib/push-client";
import { withIdle } from "@/lib/virtual-office/last-touch";
import { setupPlugins } from "./plugins";
import type { VoAction, VoState } from "@/lib/virtual-office/types";

/** 画面の言語の文言(サーバーのページがt()で作って渡す) */
export type OfficeMsgs = { connect: string; error: string; pushDenied: string; pushSaveFailed: string };

/** HUDのメニューの項目(サーバーのページが言語に合わせたlabelで作って渡す)。postはPOSTして、終わったらthenへ移る */
export type OfficeMenuItem = { label: string; href?: string; post?: { path: string; form?: Record<string, string>; then: string } };

const OfficeStage = dynamic(() => import("./OfficeStage"), { ssr: false });

/** 見えている間のポーリングと、隠れている間のハートビート(15分来ないと離席中に見える) */
const POLL_MS = 4000;
const HEARTBEAT_MS = 60_000;

/** APIの呼び出し。失敗はサーバーの `{ error }`(受け取る人の言語)を message、HTTPのステータスを status にした Error。CSRFは同じオリジンの fetch で足りる */
async function request<T = VoState>(path: string, msgs: OfficeMsgs, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init, headers: { accept: "application/json", ...init?.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(msgs.connect);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // status はエンジンが見る(返事しようとした声かけがもう無い404など)
  if (!res.ok) throw Object.assign(new Error(typeof body.error === "string" ? body.error : msgs.error), { status: res.status });
  return body as T;
}

/** バーチャルオフィスの画面。描画とHUDはエンジン、ここはポーリングと操作の送信だけ */
export function OfficeClient({
  initial,
  weather,
  timeZone,
  workEndHour,
  map,
  appName,
  menu,
  vapidPublicKey,
  msgs,
  locale,
}: {
  initial: VoState;
  weather: OfficeWeather | null;
  timeZone: string;
  workEndHour: number;
  map: OfficeMap;
  appName: string;
  menu: OfficeMenuItem[];
  vapidPublicKey: string | null;
  msgs: OfficeMsgs;
  locale: Locale;
}) {
  const handleRef = useRef<OfficeHandle | null>(null);
  const latestState = useRef(initial);
  const refreshRef = useRef<() => void>(() => {});
  // プラグインの onState に状態を流す(エンジンを作ったあとに入る)
  const emitRef = useRef<(state: VoState) => void>(() => {});
  // みんなのパーツ: 開いたときと、state の partsVersion が変わったときに取り直してエンジンに渡す(4秒ごとの state には絵を入れない)
  const partsRef = useRef<OfficePart[] | null>(null);
  const partsVer = useRef(initial.partsVersion);
  const loadParts = useCallback(async () => {
    try {
      const res = await fetch("/api/office/parts", { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return;
      partsRef.current = (await res.json()) as OfficePart[];
      handleRef.current?.setParts(partsRef.current);
    } catch { /* 次に版が変わったときか、開き直したときに取り直す */ }
  }, []);
  useEffect(() => { void loadParts(); }, [loadParts]);
  // 最後に受け取った出来事のid。ポーリングにも操作にも付ける(付けないと直近15分の出来事が返り直す)
  const sinceRef = useRef(initial.lastEventId);
  const acceptState = useCallback((next: VoState) => {
    if (Date.parse(next.serverTime) < Date.parse(latestState.current.serverTime)) {
      refreshRef.current();
      return false;
    }
    latestState.current = next;
    if (next.partsVersion !== partsVer.current) { partsVer.current = next.partsVersion; void loadParts(); }
    sinceRef.current = Math.max(sinceRef.current, next.lastEventId);
    return true;
  }, [loadParts]);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let refreshRequested = false;
    let failures = 0;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    // 小窓(Picture-in-Picture)が開いていれば、タブが隠れていても見えている扱い
    const live = () => document.visibilityState === "visible" || !!handleRef.current?.miniOpen();
    const schedule = (ms: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    // 前の要求が終わってから次を予約する。失敗したら間隔を伸ばす
    async function tick() {
      if (stopped || running) return;
      if (!handleRef.current) return schedule(POLL_MS); // エンジンを読み込み中(反映先がない間に since を進めない)
      if (!live() && Date.now() - last < HEARTBEAT_MS) return schedule(HEARTBEAT_MS - (Date.now() - last));
      running = true;
      try {
        const state = await request(withIdle(`/api/office/state?since=${sinceRef.current}`), msgs, { signal: controller.signal });
        if (stopped) return;
        last = Date.now();
        failures = 0;
        if (acceptState(state)) { handleRef.current?.update(state); emitRef.current(state); }
        schedule(live() ? POLL_MS : HEARTBEAT_MS);
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
        failures += 1;
        schedule(Math.min(POLL_MS * 2 ** failures, 30_000));
      } finally {
        running = false;
        if (refreshRequested && !stopped) { refreshRequested = false; schedule(0); }
      }
    }

    const wake = () => {
      if (live()) schedule(0);
    };
    refreshRef.current = () => { if (running) refreshRequested = true; else schedule(0); };
    schedule(POLL_MS);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      refreshRef.current = () => {};
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [acceptState, msgs]);

  const send = useCallback(async (action: VoAction) => {
    const state = await request(`/api/office/action?since=${sinceRef.current}`, msgs, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    return acceptState(state) ? state : latestState.current;
  }, [acceptState, msgs]);

  // プラグインの操作。返ってきた state はすぐエンジンと onState に流す
  const pluginSend = useCallback(async (id: string, action: string, payload?: unknown) => {
    const res = await request<{ result: unknown; state?: unknown }>(`/api/office/plugins/${encodeURIComponent(id)}`, msgs, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if ("state" in res) { // nullを返したときも反映する(無いのはプラグインに state が無い・undefined・投げた・遅いとき)
      latestState.current = { ...latestState.current, plugins: { ...latestState.current.plugins, [id]: res.state } };
      handleRef.current?.setPluginState(id, res.state);
      emitRef.current(latestState.current);
    }
    return res.result;
  }, [msgs]);
  const pluginGet = useCallback((id: string, params?: Record<string, string>) =>
    request<unknown>(`/api/office/plugins/${encodeURIComponent(id)}?${new URLSearchParams(params)}`, msgs), [msgs]);

  const onHandle = useCallback((handle: OfficeHandle | null) => {
    handleRef.current = handle;
    if (handle && partsRef.current) handle.setParts(partsRef.current); // エンジンより先に取れていた分
  }, []);

  // 通知はHTTPS(かlocalhost)でPushManagerのある環境だけ。鍵が無ければ出さない
  const enablePush = vapidPublicKey && canPush()
    ? () => subscribeToPush(vapidPublicKey, { denied: msgs.pushDenied, saveFailed: msgs.pushSaveFailed })
    : undefined;
  // エンジンを作るとき(ブラウザの中だけ)に呼ぶ。プラグインの setup はその前に走らせ、menu・ボタン・dock を設定に入れる
  const makeOptions = () => {
    const p = setupPlugins({ locale, state: () => latestState.current, send: pluginSend, get: pluginGet });
    emitRef.current = p.emit;
    const options: OfficeOptions = {
      initial, weather, timeZone, workEndHour, send, t: (key, vars) => tr(locale, key, vars), enablePush, map, appName,
      menu: [
        ...menu.map(({ label, href, post }) => ({
          label,
          href,
          onClick: post ? () => { void fetch(post.path, { method: "POST", body: new URLSearchParams(post.form) }).finally(() => location.assign(post.then)); } : undefined,
        })),
        ...p.menu,
      ],
      itemButtons: p.itemButtons, onItemClick: p.onItemClick, dock: p.dock,
    };
    return { options, dispose: () => { p.dispose(); emitRef.current = () => {}; } };
  };

  return <OfficeStage make={makeOptions} onHandle={onHandle} />;
}
