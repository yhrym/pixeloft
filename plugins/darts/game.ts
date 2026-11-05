/**
 * ダーツの進行(保存や通信に触らない純粋関数)。状態は台ごと(置き物のid)。
 * 1人=カウントアップ(3ラウンド・合計点)、2〜4人=301(ぴったり0で上がり・下回ったらバスト・8ラウンドで残りが少ない人)。
 */
import { DART_TURN_MS, type DartHit } from "./board.ts";

/** 失敗。keyはplugin.darts.err.…の文言のキー(409で返す) */
export class GameError extends Error {
  key: string;
  constructor(key: string) {
    super(key);
    this.key = key;
  }
}

export type Standing = { userId: string; name: string; seatId: string }[];
export type DartsGame = {
  id: string;
  mode: "countup" | "301";
  /** 投げる順。scoreは301なら残り・カウントアップなら合計。roundsは終わったラウンドごとの点(バストは0) */
  players: { userId: string; name: string; score: number; rounds: number[] }[];
  /** 今投げる人(playersの添字) */
  turn: number;
  round: number;
  /** カウントアップは3・301は8 */
  maxRounds: number;
  /** 今のターンに投げた矢(0〜2本。3本目・バスト・上がりでターンが進んで空になる) */
  darts: DartHit[];
  /** 次に投げる矢の通し番号(二重送信を弾く。ゲームの中で0から) */
  throwIndex: number;
  /** 今のターンの締め切り(ms) */
  turnEndsAt: number;
};
export type Machine = {
  id: string;
  game: DartsGame | null;
  /** いちばん新しい矢(演出用)。bustはその矢でバストした */
  lastThrow: { gameId: string; index: number; userId: string; hit: DartHit; bust: boolean } | null;
  lastTurn: { gameId: string; userId: string; darts: DartHit[]; total: number; bust: boolean } | null;
  /** 直前に終わったゲーム(次が始まるまで)。winnerUserIdsは301の勝者 */
  result: { gameId: string; mode: DartsGame["mode"]; players: { userId: string; name: string; score: number }[]; winnerUserIds: string[] } | null;
};
export type Ranking = { userId: string; name: string; score: number }[];
/** dateは設定のタイムゾーンの日付。日付が変わったら台もランキングも作り直す */
export type DartsStore = { date: string; machines: Record<string, Machine>; ranking: Ranking };
export type DartsView = { machines: (Machine & { standing: Standing })[]; ranking: Ranking };

/** 立ち位置の数(1台あたり) */
export const STAND_COUNT = 4;
const RANKING_MAX = 10;

const changed = () => new GameError("plugin.darts.err.changed");
const sum = (darts: DartHit[]) => darts.reduce((n, d) => n + d.score, 0);

const blank = (id: string): Machine => ({ id, game: null, lastThrow: null, lastTurn: null, result: null });
export const emptyStore = (date: string): DartsStore => ({ date, machines: {}, ranking: [] });
const machineOf = (store: DartsStore, id: string) => (store.machines[id] ??= blank(id));

/** 保存してある値。その日のものでなければ空から */
export function storeOf(raw: unknown, date: string): DartsStore {
  const v = raw as Partial<DartsStore> | null | undefined;
  return v?.date === date && v.machines && v.ranking ? (v as DartsStore) : emptyStore(date);
}

/** 立ち位置にいる人を台ごとに席の番号順で。席のidは`<置き物のid>-<番号>` */
export function standingOf(itemIds: string[], rows: { userId: string; seatId: string | null; name: string }[]): Record<string, Standing> {
  const out: Record<string, Standing> = {};
  for (const id of itemIds) {
    out[id] = [];
    for (let n = 1; n <= STAND_COUNT; n++) {
      const seatId = `${id}-${n}`, r = rows.find((p) => p.seatId === seatId);
      if (r) out[id].push({ userId: r.userId, name: r.name, seatId });
    }
  }
  return out;
}

function addRanking(store: DartsStore, entry: Ranking[number]) {
  const old = store.ranking.find((r) => r.userId === entry.userId);
  if (old && old.score >= entry.score) return;
  // 新しい記録は後ろに足してから安定ソートするので、同点は先に出した人が上
  store.ranking = [...store.ranking.filter((r) => r.userId !== entry.userId), entry].sort((a, b) => b.score - a.score).slice(0, RANKING_MAX);
}

function finish(store: DartsStore, m: Machine, g: DartsGame, winners?: string[]) {
  const players = g.players.map(({ userId, name, score }) => ({ userId, name, score }));
  let winnerUserIds: string[] = [];
  if (g.mode === "301") {
    const least = Math.min(...players.map((p) => p.score));
    // 全員が301のまま(誰も点を取らずに8ラウンド)なら勝ちなし
    winnerUserIds = winners ?? (least === 301 ? [] : players.filter((p) => p.score === least).map((p) => p.userId));
  } else if (m.lastThrow?.gameId === g.id) {
    // 1本も投げずに時間切れで終わったカウントアップはランキングに入れない
    for (const p of players) addRanking(store, p);
  }
  m.result = { gameId: g.id, mode: g.mode, players, winnerUserIds };
  m.game = null;
}

/** 今の人のターンを終えて次の人へ。atは次のターンの締め切りの起点 */
function endTurn(store: DartsStore, m: Machine, g: DartsGame, at: number, bust = false, won = false) {
  const p = g.players[g.turn];
  const total = bust ? 0 : sum(g.darts);
  m.lastTurn = { gameId: g.id, userId: p.userId, darts: g.darts, total, bust };
  p.rounds.push(total);
  g.darts = [];
  if (won) return finish(store, m, g, [p.userId]);
  g.turnEndsAt = at + DART_TURN_MS;
  if (++g.turn >= g.players.length) {
    g.turn = 0;
    g.round++;
  }
  if (g.round > g.maxRounds) finish(store, m, g);
}

/** 立ち位置を離れた人をゲームから外す。自分の番の人が抜けたら次の人へ。0人なら結果なしで終わり、301で1人ならその人の勝ち */
function dropLeavers(store: DartsStore, m: Machine, standing: Standing, now: number) {
  const g = m.game;
  if (!g) return;
  const here = new Set(standing.map((s) => s.userId));
  const kept = g.players.filter((p) => here.has(p.userId));
  if (kept.length === g.players.length) return;
  if (kept.length === 0) {
    m.game = null;
    return;
  }
  const current = g.players[g.turn];
  if (here.has(current.userId)) g.turn = kept.indexOf(current);
  else {
    const next = g.players.slice(g.turn + 1).find((p) => here.has(p.userId));
    g.turn = next ? kept.indexOf(next) : 0;
    if (!next) g.round++;
    g.darts = [];
    g.turnEndsAt = now + DART_TURN_MS;
  }
  g.players = kept;
  if (g.mode === "301" && kept.length === 1) finish(store, m, g, [kept[0].userId]);
  else if (g.round > g.maxRounds) finish(store, m, g);
}

/** 抜けた人を外してから、締め切りを過ぎたターンを残りの矢MISS(位置なし・的には出さない)で進める。誰も見ていない間の分は締め切り+45秒ずつまとめて */
export function syncDarts(store: DartsStore, standing: Record<string, Standing>, now: number) {
  for (const m of Object.values(store.machines)) {
    dropLeavers(store, m, standing[m.id] ?? [], now);
    while (m.game && now >= m.game.turnEndsAt) {
      const g = m.game;
      g.throwIndex += 3 - g.darts.length;
      endTurn(store, m, g, g.turnEndsAt);
    }
  }
}

const requireStanding = (standing: Standing, userId: string) => {
  if (!standing.some((s) => s.userId === userId)) throw new GameError("plugin.darts.err.notStanding");
};

/** その台の立ち位置にいる人が始める。立っている人(席の番号順)がプレイヤー */
export function startGame(store: DartsStore, machine: string, userId: string, standing: Standing, now: number, id: string) {
  requireStanding(standing, userId);
  const m = machineOf(store, machine);
  if (m.game) throw new GameError("plugin.darts.err.busy");
  const countup = standing.length === 1;
  m.game = {
    id,
    mode: countup ? "countup" : "301",
    players: standing.map(({ userId, name }) => ({ userId, name, score: countup ? 0 : 301, rounds: [] })),
    turn: 0,
    round: 1,
    maxRounds: countup ? 3 : 8,
    darts: [],
    throwIndex: 0,
    turnEndsAt: now + DART_TURN_MS,
  };
  m.result = null;
}

/** 自分の番に1本。hitは手ぶれを足して判定した当たり */
export function throwDart(store: DartsStore, machine: string, userId: string, standing: Standing, sent: { gameId: string; throwIndex: number }, hit: DartHit, now: number) {
  requireStanding(standing, userId);
  const m = machineOf(store, machine);
  const g = m.game;
  if (!g || g.id !== sent.gameId) throw changed();
  const p = g.players[g.turn];
  if (p.userId !== userId) throw new GameError("plugin.darts.err.notYourTurn");
  if (sent.throwIndex !== g.throwIndex) throw changed();
  const is301 = g.mode === "301";
  const left = p.score - hit.score;
  const bust = is301 && left < 0;
  const won = is301 && left === 0;
  m.lastThrow = { gameId: g.id, index: g.throwIndex++, userId, hit, bust };
  // バストはそのターンに投げた分を残りに戻す
  if (bust) p.score += sum(g.darts);
  else p.score = is301 ? left : p.score + hit.score;
  g.darts.push(hit);
  if (bust || won || g.darts.length === 3) endTurn(store, m, g, now, bust, won);
}

/** 画面に返す形。置き物のある台だけ、立っている人を付ける */
export function viewDarts(store: DartsStore, standing: Record<string, Standing>): DartsView {
  return { machines: Object.keys(standing).map((id) => ({ ...(store.machines[id] ?? blank(id)), standing: standing[id] })), ranking: store.ranking };
}
