import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import type { PluginApi } from "@/plugins/types";
import { DART_RINGS, DART_SECTORS, scoreAt, type DartHit } from "./board.ts";
import type { DartsView, Machine, Standing } from "./game.ts";
import "./darts.css";

type Tr = PluginApi["t"];
type Send = (action: string, payload?: unknown) => Promise<unknown>;
type Mach = Machine & { standing: Standing };

/** 照準の揺れと矢の演出の数(むずかしさはここだけで変える)。揺れは三角波(一定の速さ)。狙ってもブルに入るのは数回に1回くらい */
const AIM = {
  /** 振れ幅(±mm)。的の外(MISS)まで振る */
  amp: DART_RINGS.doubleOut + 20,
  /** 1往復のms。線ごとにこの間でランダム(始まりの位置と向きもランダム) */
  periodMin: 1200,
  periodMax: 1500,
  /** 矢が飛ぶms */
  flyMs: 300,
};
/** 的の絵: SIZE×SIZEのバッファに±200mmを描き、CSSで拡大(pixelated)。RIMは数字の輪の外(mm) */
const SIZE = 120;
const SCALE = SIZE / 400;
const RIM = 196;
const INK = "#221f2c", CREAM = "#f0e8d6", RED = "#d24e4b", GREEN = "#6dab50", SURROUND = "#3e3a4a", BG = "#37486f";
/** 3×5の数字(engine/monitor-scene.jsのdigitsと同じ) */
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

type Sweep = { t0: number; u0: number; period: number };
type Aim = { gameId: string; throwIndex: number; phase: "x" | "y" | "send"; x: number; y: number; sweep: Sweep };
type Flight = { key: string; from: { x: number; y: number }; to: DartHit; start: number; own: boolean };

const newSweep = (t0: number): Sweep => ({ t0, u0: Math.random(), period: AIM.periodMin + Math.random() * (AIM.periodMax - AIM.periodMin) });
/** 三角波。u0が0〜0.5なら右(下)へ、0.5〜1なら左(上)へ動き始める */
function sweepAt(s: Sweep, t: number) {
  const u = (((s.u0 + (t - s.t0) / s.period) % 1) + 1) % 1;
  return AIM.amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u);
}
const toPx = (mm: number) => Math.min(SIZE - 2, Math.max(1, Math.floor(SIZE / 2 + mm * SCALE)));

let boardCache: HTMLCanvasElement | null = null;
/** 的の絵(1回だけ描く)。区画の色は判定(scoreAt)そのもので決めるので、絵と点がずれない */
function boardImage() {
  if (boardCache) return boardCache;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d")!;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = (i + 0.5 - SIZE / 2) / SCALE, y = (j + 0.5 - SIZE / 2) / SCALE, r = Math.hypot(x, y), { label } = scoreAt(x, y);
    const dark = (DART_SECTORS as readonly number[]).indexOf(Number(label.slice(1))) % 2 === 0; // 20の区画が黒
    g.fillStyle = r > RIM ? BG : label === "MISS" ? SURROUND : label === "BULL" ? (r <= 6.35 ? RED : GREEN) : label[0] === "S" ? (dark ? INK : CREAM) : dark ? RED : GREEN;
    g.fillRect(i, j, 1, 1);
  }
  g.fillStyle = CREAM;
  DART_SECTORS.forEach((n, k) => {
    const a = (k * Math.PI) / 10, r = ((DART_RINGS.doubleOut + RIM) / 2) * SCALE, text = String(n);
    const left = Math.round(SIZE / 2 + r * Math.sin(a) - (text.length * 4 - 1) / 2), top = Math.round(SIZE / 2 - r * Math.cos(a) - 2.5);
    [...text].forEach((d, di) => [...DIGITS[Number(d)]].forEach((bit, b) => { if (bit === "1") g.fillRect(left + di * 4 + (b % 3), top + Math.floor(b / 3), 1, 1); }));
  });
  return (boardCache = c);
}
/** 刺さった矢(k倍。飛んでいる間は大きい)。先は白い点に黒い縁、右上に黒い縁の羽根(黒い区画・赤い輪の上でも見える) */
function drawDart(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  const px = toPx(x), py = toPx(y);
  const dot = (dx: number, dy: number, size: number, color: string) => { g.fillStyle = color; g.fillRect(px + dx * k, py + dy * k, size * k, size * k); };
  dot(2, -6, 5, INK);
  dot(3, -5, 3, "#f4c651");
  dot(-1, -1, 3, INK);
  dot(0, 0, 1, "#fbf9f3");
}
/** 照準の線(縦=左右の位置・横=上下の位置)。動いている線は黄色、止めた線は白 */
function drawLine(g: CanvasRenderingContext2D, vertical: boolean, mm: number, color: string) {
  const p = toPx(mm);
  g.fillStyle = INK;
  if (vertical) g.fillRect(p - 1, 0, 3, SIZE); else g.fillRect(0, p - 1, SIZE, 3);
  g.fillStyle = color;
  if (vertical) g.fillRect(p, 0, 1, SIZE); else g.fillRect(0, p, SIZE, 1);
}

/** 立ち位置にいる間だけ出す窓。台は置き物ごと(席のidは<置き物のid>-<番号>) */
function Root({ api }: { api: PluginApi }) {
  const [snap, setSnap] = useState(() => ({ view: api.state() as (DartsView & { now: number }) | undefined, at: Date.now() }));
  useEffect(() => api.onState((s) => setSnap({ view: s as (DartsView & { now: number }) | undefined, at: Date.now() })), [api]);
  const { view } = snap, seatId = api.me().seatId;
  const machine = seatId && view?.machines.find((m) => seatId.startsWith(m.id + "-") && /^\d+$/.test(seatId.slice(m.id.length + 1)));
  if (!view || !machine) return null;
  return <DartsWindow key={machine.id} machine={machine} ranking={view.ranking} meId={api.me().id} serverNow={view.now} receivedAt={snap.at} send={api.send} t={api.t} />;
}

function DartsWindow({ machine, ranking, meId, serverNow, receivedAt, send, t }: { machine: Mach; ranking: DartsView["ranking"]; meId: string; serverNow: number; receivedAt: number; send: Send; t: Tr }) {
  const { lastThrow } = machine;
  const throwKey = lastThrow ? `${lastThrow.gameId}:${lastThrow.index}` : "";
  const [landedKey, setLandedKey] = useState(throwKey);
  const [open, setOpen] = useState(true);
  // 矢が飛んでいる間(的に届くまで)は、投げる前の台(スロット・点・番・結果)を見せ、届いてから新しい値に替える。畳んでいる間は飛ばさない
  const flying = open && !!lastThrow && landedKey !== throwKey;
  const [shown, setShown] = useState(machine);
  if (!flying && shown !== machine) setShown(machine);
  const { game, lastTurn, result, standing } = flying ? shown : machine;
  const [aimState, setAim] = useState<Aim | null>(null);
  const [busy, setBusy] = useState(false);
  // 失敗は送ったときのゲームに付けて、ゲームが替わったら出さない(ほぼ同時に開始して409でも、自分も参加者に入っている)
  const [error, setError] = useState<{ text: string; gameId?: string } | null>(null);
  const errorText = error && error.gameId === game?.id ? error.text : "";
  const myTurn = game?.players[game.turn]?.userId === meId;
  // 番が変わった・持ち時間切れで矢が進んだら、揺れている照準は捨てる
  const aim = aimState && game && myTurn && aimState.gameId === game.id && aimState.throwIndex === game.throwIndex ? aimState : null;
  const meStanding = standing.some((s) => s.userId === meId);
  const nameOf = (userId: string) => userId === meId ? t("plugin.darts.you") : t("plugin.darts.who", { name: [...(game?.players ?? []), ...(result?.players ?? []), ...standing].find((p) => p.userId === userId)?.name ?? t("plugin.darts.someone") }); // 離席・席を移って抜けた人の最後の矢も名前で

  // 持ち時間の残り。サーバーの時刻(state.now)に、受け取ってからの経過を足す
  const [ticked, setTicked] = useState(0);
  const gameId = game?.id;
  useEffect(() => {
    if (!gameId) return;
    const timer = setInterval(() => setTicked(Date.now()), 500);
    return () => clearInterval(timer);
  }, [gameId]);
  const secondsLeft = game ? Math.max(0, Math.ceil((game.turnEndsAt - (serverNow + Math.max(0, ticked - receivedAt))) / 1000)) : 0;

  // 的に刺したまま見せる矢: 今のターン、空なら直前のターン(同じゲームの)
  const stuck = useMemo(() => (game?.darts.length ? game.darts : lastTurn && lastTurn.gameId === (game?.id ?? result?.gameId) ? lastTurn.darts : []), [game, lastTurn, result]);

  // 新しい矢(自分の応答でもポーリングでも)が来たら飛ばす。自分が投げた矢は止めた照準から、ほかの人の矢は少し下から
  const seenThrow = useRef(throwKey);
  const sentAim = useRef<{ key: string; x: number; y: number } | null>(null);
  const flightRef = useRef<Flight | null>(null);
  useEffect(() => {
    if (!lastThrow || throwKey === seenThrow.current) return;
    seenThrow.current = throwKey;
    const own = sentAim.current?.key === throwKey ? sentAim.current : null;
    flightRef.current = { key: throwKey, from: own ?? { x: lastThrow.hit.x, y: lastThrow.hit.y + 60 }, to: lastThrow.hit, start: performance.now(), own: !!own };
  }, [throwKey, lastThrow]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    let frame = 0;
    const render = (now: number) => {
      const f = flightRef.current, p = f ? Math.min(1, (now - f.start) / AIM.flyMs) : 1;
      g.drawImage(boardImage(), 0, 0);
      for (const d of stuck) if (!(f && p < 1 && d.x === f.to.x && d.y === f.to.y)) drawDart(g, d.x, d.y, 1);
      if (aim) {
        drawLine(g, true, aim.phase === "x" ? sweepAt(aim.sweep, now) : aim.x, aim.phase === "x" ? "#f4c651" : "#fbf9f3");
        if (aim.phase !== "x") drawLine(g, false, aim.phase === "y" ? sweepAt(aim.sweep, now) : aim.y, aim.phase === "y" ? "#f4c651" : "#fbf9f3");
      }
      if (f && p < 1) {
        if (f.own) { drawLine(g, true, f.from.x, "#fbf9f3"); drawLine(g, false, f.from.y, "#fbf9f3"); }
        const e = 1 - (1 - p) ** 2;
        drawDart(g, f.from.x + (f.to.x - f.from.x) * e, f.from.y + (f.to.y - f.from.y) * e, p < 0.5 ? 3 : p < 0.8 ? 2 : 1);
      }
      if (f && p >= 1) { flightRef.current = null; setLandedKey(f.key); }
      if ((aim && aim.phase !== "send") || (f && p < 1)) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [stuck, aim, throwKey, open]);

  const run = async (action: string, payload: unknown) => {
    const sentIn = game?.id;
    setBusy(true);
    setError(null);
    try {
      await send(action, payload);
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : t("plugin.darts.genericError"), gameId: sentIn });
    } finally {
      setBusy(false);
      setAim(null);
    }
  };
  /** 投げる→縦の線を止める→横の線を止めて投げる。tはイベントの時刻(performance.nowと同じ基準)。押した瞬間の位置で止める */
  const advance = (t: number) => {
    if (!game || !myTurn || busy || flying) return;
    if (!aim) { setError(null); setAim({ gameId: game.id, throwIndex: game.throwIndex, phase: "x", x: 0, y: 0, sweep: newSweep(t) }); return; }
    if (aim.phase === "x") { setAim({ ...aim, phase: "y", x: sweepAt(aim.sweep, t), sweep: newSweep(t) }); return; }
    if (aim.phase !== "y") return;
    const x = Math.round(aim.x * 10) / 10, y = Math.round(sweepAt(aim.sweep, t) * 10) / 10;
    setAim({ ...aim, phase: "send", y });
    sentAim.current = { key: `${game.id}:${game.throwIndex}`, x, y };
    void run("throw", { machine: machine.id, gameId: game.id, throwIndex: game.throwIndex, x, y });
  };
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; });
  // 窓はエンジンの#appの中。#appのpointerdownは地図のドラッグ、wheelは拡大なので止める。
  // 止めるとReactのonPointerDownも届かないので、照準(的と投げるボタン)の押した瞬間はここで受ける(clickは離したときで遅い)
  const bind = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      if (e.button === 0 && e.target instanceof Element && e.target.closest("[data-aim]")) advanceRef.current(e.timeStamp);
    };
    const wheel = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", down);
    el.addEventListener("wheel", wheel);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("wheel", wheel); };
  }, []);
  // 窓の中にフォーカスがあるときだけSpace・Enterで止める(ページ全体のSpaceはチャットが使う)。ボタンの上はボタン自身のclickに任せる。
  // 押しっぱなしのキーリピートは捨てる(Enterはリピートのたびにボタンのclickが出て、照準が0.5秒で投げまで進んだ)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    if (e.repeat) { e.preventDefault(); return; }
    if (e.target instanceof HTMLButtonElement || !myTurn) return;
    e.preventDefault();
    advance(e.timeStamp);
  };


  const title = t("plugin.darts.title");
  if (!open) {
    return (
      <section ref={bind} className="vo-darts is-mini" aria-label={title}>
        <button type="button" className="vo-darts-open" onClick={() => setOpen(true)} aria-label={t("plugin.darts.openAria")}>
          {title}{myTurn && <b>{t("plugin.darts.yourTurn")}</b>}<span aria-hidden="true">▸</span>
        </button>
      </section>
    );
  }

  // 時間切れ: 直前のターンが3本そろわずに終わった(バスト・301の上がりではない)。今のターンにまだ矢がなければ、前の矢の代わりにこれを出す
  const timedOut = lastTurn && lastTurn.gameId === (game?.id ?? result?.gameId) && !game?.darts.length && !lastTurn.bust && lastTurn.darts.length < 3
    && !(result?.gameId === lastTurn.gameId && result.winnerUserIds.includes(lastTurn.userId) && result.players.find((p) => p.userId === lastTurn.userId)?.score === 0)
    ? (lastTurn.userId === meId ? t("plugin.darts.timeoutMe") : t("plugin.darts.timeoutOther", { who: nameOf(lastTurn.userId) })) : "";
  const throwNow = !timedOut && lastThrow && lastThrow.gameId === (game?.id ?? result?.gameId) && landedKey === throwKey ? lastThrow : null;
  // 結果の並び: 301は勝った人が先頭、あとは残りの少ない順。カウントアップは点の高い順
  const ranked = result ? [...result.players].sort((a, b) => result.mode === "301"
    ? Number(result.winnerUserIds.includes(b.userId)) - Number(result.winnerUserIds.includes(a.userId)) || a.score - b.score
    : b.score - a.score) : [];
  const n = standing.length;
  const startLabel = n <= 1 ? t("plugin.darts.startSolo") : t("plugin.darts.startN", { n });
  const startButton = meStanding && n <= 4 && (
    <button type="button" className="pbtn go vo-darts-big" disabled={busy} onClick={() => void run("start", { machine: machine.id })}>{startLabel}</button>
  );
  const resultText = result && !game ? t("plugin.darts.resultEnd", { text: result.mode === "301"
    ? result.winnerUserIds.length ? t("plugin.darts.resultWin", { who: result.winnerUserIds.map(nameOf).join(" / ") }) : ""
    : t("plugin.darts.resultScore", { who: nameOf(ranked[0]?.userId ?? ""), n: ranked[0]?.score ?? 0 }) }) : "";
  const announce = resultText || timedOut || (throwNow ? t("plugin.darts.throwAnnounce", { who: nameOf(throwNow.userId), label: throwNow.hit.label, score: throwNow.hit.score }) + (throwNow.bust ? " " + t("plugin.darts.bustWord") : "") : "");

  return (
    <section ref={bind} className="vo-darts" aria-label={title} tabIndex={-1} onKeyDown={onKey}>
      <div className="vo-darts-head">
        <h2>{title}</h2>
        <button type="button" className="pbtn sm ghost" onClick={() => setOpen(false)} aria-label={t("plugin.darts.closeAria")} title={t("plugin.darts.closeTitle")}>×</button>
      </div>
      <div className="vo-darts-body">
        {game && (
          <p className="vo-darts-turn">
            <b className={myTurn ? "me" : ""}>{myTurn ? t("plugin.darts.yourTurn") : t("plugin.darts.turnOf", { who: nameOf(game.players[game.turn]?.userId ?? "") })}</b>
            <span>{t("plugin.darts.round")} <i>{game.round}/{game.maxRounds}</i></span>
            <span>{t("plugin.darts.timeLeft", { s: secondsLeft })}</span>
          </p>
        )}
        <canvas ref={canvasRef} className="vo-darts-board" width={SIZE} height={SIZE} data-aim tabIndex={myTurn ? 0 : -1}
          aria-label={myTurn ? t("plugin.darts.boardAimAria") : t("plugin.darts.boardAria")} />
        <p className="vo-darts-hit">
          {timedOut ? <span className="vo-darts-timeout">{timedOut}</span>
            : throwNow ? <><small>{nameOf(throwNow.userId)}</small><b>{throwNow.hit.label} {throwNow.hit.score}</b>{throwNow.bust && <em>BUST</em>}</> : <small>{game ? t("plugin.darts.waitingDart") : ""}</small>}
        </p>
        {game && (
          <ol className="vo-darts-slots" aria-label={t("plugin.darts.slotsAria")}>
            {[0, 1, 2].map((i) => {
              const d = game.darts[i];
              return <li key={i} className={d ? "" : "empty"}>{d ? <><b>{d.label}</b>{d.score}</> : t("plugin.darts.slot", { n: i + 1 })}</li>;
            })}
          </ol>
        )}
        {myTurn && game && (
          <>
            <button type="button" className="pbtn go vo-darts-big" data-aim aria-disabled={busy || flying} onClick={(e) => { if (e.detail === 0) advance(e.timeStamp); }}>
              {!aim ? t("plugin.darts.throwBtn", { n: game.darts.length + 1 }) : aim.phase === "x" ? t("plugin.darts.stopX") : aim.phase === "y" ? t("plugin.darts.stopY") : t("plugin.darts.throwing")}
            </button>
            <p className="vo-darts-help">
              {!aim ? t("plugin.darts.help1") : aim.phase === "x" ? t("plugin.darts.help2") : t("plugin.darts.help3")}
              {aim && aim.phase !== "send" && " " + t("plugin.darts.helpKeys")}
            </p>
          </>
        )}
        {game ? (
          <>
            {!game.players.some((p) => p.userId === meId) && <p className="vo-darts-note">{t("plugin.darts.waitingNext")}</p>}
            <ol className="vo-darts-players" aria-label={t("plugin.darts.scoreAria")}>
              {game.players.map((p, i) => (
                <li key={p.userId} className={[i === game.turn && "now", p.userId === meId && "me"].filter(Boolean).join(" ")}>
                  <span className="nm">{i === game.turn && <span aria-hidden="true">▶ </span>}{p.userId === meId ? t("plugin.darts.you") : p.name}</span>
                  <span className="pt"><small>{game.mode === "301" ? t("plugin.darts.remain") : t("plugin.darts.total")}</small><b>{p.score}</b></span>
                  <span className="vo-darts-rounds" style={{ gridTemplateColumns: `repeat(${game.maxRounds}, 1fr)` }}>
                    {Array.from({ length: game.maxRounds }, (_, r) => {
                      const bust = r === p.rounds.length - 1 && lastTurn?.bust && lastTurn.gameId === game.id && lastTurn.userId === p.userId;
                      return <span key={r} title={t("plugin.darts.roundTitle", { n: r + 1 })} className={bust ? "bust" : ""}>{bust ? "BUST" : p.rounds[r] ?? ""}</span>;
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : result ? (
          <div className="vo-darts-box">
            <h3>{t("plugin.darts.endTitle", { mode: result.mode === "301" ? "301" : t("plugin.darts.modeCountup") })}</h3>
            {result.mode === "301" ? (
              <>
                {result.winnerUserIds.length > 0 && <p className="vo-darts-win">{t("plugin.darts.winBang", { who: result.winnerUserIds.map(nameOf).join(" / ") })}</p>}
                <ol className="vo-darts-rank">
                  {ranked.map((p) => (
                    <li key={p.userId} className={p.userId === meId ? "me" : ""}><i>{result.winnerUserIds.includes(p.userId) ? "★" : ""}</i><span>{p.userId === meId ? t("plugin.darts.you") : p.name}</span><b><small>{t("plugin.darts.remain")}</small>{p.score}</b></li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="vo-darts-win">{t("plugin.darts.scoreOf", { who: nameOf(ranked[0]?.userId ?? "") })} <b>{ranked[0]?.score ?? 0}</b></p>
            )}
            <h3>{t("plugin.darts.rankingTitle")}</h3>
            {ranking.length ? (
              <ol className="vo-darts-rank">
                {ranking.slice(0, 10).map((r, i) => (
                  <li key={r.userId} className={r.userId === meId ? "me" : ""}><i>{i + 1}</i><span>{r.userId === meId ? t("plugin.darts.you") : r.name}</span><b>{r.score}</b></li>
                ))}
              </ol>
            ) : <p className="vo-darts-note">{t("plugin.darts.noRecords")}</p>}
            {startButton && <h3>{t("plugin.darts.nextGame")}</h3>}
            {startButton}
          </div>
        ) : (
          <div className="vo-darts-box">
            <h3>{t("plugin.darts.standingTitle", { n })}</h3>
            <ul className="vo-darts-standing">{standing.map((s) => <li key={s.userId} className={s.userId === meId ? "me" : ""}>{s.userId === meId ? t("plugin.darts.you") : s.name}</li>)}</ul>
            {startButton}
            {startButton && <p className="vo-darts-help">{t("plugin.darts.startHint")}</p>}
          </div>
        )}
        {errorText && <p className="vo-darts-error" role="alert">{errorText}</p>}
        {!game?.players.some((p) => p.userId === meId) && <p className="vo-darts-rule">{t("plugin.darts.rule")}</p>}
      </div>
      <p className="vo-darts-sr" aria-live="polite" aria-atomic="true">{announce}</p>
    </section>
  );
}

export default function setup(api: PluginApi) {
  const host = document.createElement("div");
  api.dock.append(host);
  const root = createRoot(host);
  root.render(<Root api={api} />);
  api.onItemClick("darts:machine", api.t("plugin.darts.howto"), () => {
    const d = api.dialog(api.t("plugin.darts.title"));
    d.body.textContent = api.t("plugin.darts.howtoBody");
  });
  return () => queueMicrotask(() => root.unmount()); // dispose はReactのeffectの後片付け中に呼ばれるので、同期のunmountは警告になる
}
