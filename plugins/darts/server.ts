import { randomInt, randomUUID } from "node:crypto";
import type { PluginCtx, PluginServer } from "@/plugins/types";
import { DART_AIM_LIMIT, scoreAt } from "./board.ts";
import { GameError, standingOf, startGame, storeOf, syncDarts, throwDart, viewDarts, type DartsStore, type Standing } from "./game.ts";

const KEY = "darts";
/** 手ぶれの標準偏差(mm) */
const JITTER_MM = 6;

/** 手ぶれ(正規分布)。Box–Mullerで2つ同時に作る */
export function jitter(): [number, number] {
  const u = () => randomInt(1, 2 ** 48) / 2 ** 48;
  const r = JITTER_MM * Math.sqrt(-2 * Math.log(u()));
  const t = 2 * Math.PI * u();
  return [r * Math.cos(t), r * Math.sin(t)];
}

/** 置き物ごとの立ち位置にいる人。離席中の人は立っていない扱い(ゲームからも抜ける) */
async function standing(ctx: PluginCtx) {
  const [items, people] = await Promise.all([ctx.items(), ctx.people()]);
  return standingOf(items.map((i) => i.id), people.filter((p) => p.seatId && !p.away).map((p) => ({ userId: p.id, name: p.name, seatId: p.seatId! })));
}

/** 台の中身かランキングがある(日付が古くても) */
const hasContent = (v: unknown) => {
  const s = v as Partial<DartsStore> | null | undefined;
  return !!s?.ranking?.length || !!Object.values(s?.machines ?? {}).some((m) => m.game || m.lastThrow || m.lastTurn || m.result);
};

/** 抜けた人・締め切りを進めて保存してから、fnで1手進める。保存の順番はstore.updateが守る */
async function run(ctx: PluginCtx, machine: string, fn: (s: DartsStore, st: Standing) => void) {
  try {
    await ctx.store.update(KEY, async (cur) => {
      const st = await standing(ctx);
      if (!Object.hasOwn(st, machine)) ctx.fail(400, "vo.err.badRequest");
      const s = storeOf(cur, ctx.date);
      syncDarts(s, st, ctx.now.getTime());
      fn(s, st[machine]);
      return s;
    });
  } catch (e) {
    if (e instanceof GameError) ctx.fail(409, e.key);
    throw e;
  }
}

const obj = (p: unknown) => (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
const machineOf = (ctx: PluginCtx, p: Record<string, unknown>) => (typeof p.machine === "string" && p.machine.length <= 200 ? p.machine : ctx.fail(400, "vo.err.badRequest"));
const aim = (ctx: PluginCtx, v: unknown) => (typeof v === "number" && Math.abs(v) <= DART_AIM_LIMIT ? v : ctx.fail(400, "vo.err.badRequest"));

const server: PluginServer = {
  /** 4秒ごとに人ごとに呼ばれる。ロックなしで読み、時間切れ・抜けた人・日付の作り直しで変わるときだけ保存する */
  state: async (ctx) => {
    const st = await standing(ctx);
    const raw = await ctx.store.get(KEY);
    const store = storeOf(raw, ctx.date);
    const before = JSON.stringify(store);
    syncDarts(store, st, ctx.now.getTime());
    const write = JSON.stringify(store) !== before || (store !== raw && hasContent(raw));
    const view = write
      ? viewDarts(
          (await ctx.store.update(KEY, (cur) => {
            const s = storeOf(cur, ctx.date);
            syncDarts(s, st, ctx.now.getTime());
            return s;
          })) as DartsStore,
          st,
        )
      : viewDarts(store, st);
    // 持ち時間の残りをサーバーの時計に合わせるため、いまの時刻(ms)を付ける
    return { ...view, now: ctx.now.getTime() };
  },
  actions: {
    start: async (ctx, payload) => {
      const machine = machineOf(ctx, obj(payload));
      await run(ctx, machine, (s, st) => startGame(s, machine, ctx.user.id, st, ctx.now.getTime(), randomUUID()));
    },
    throw: async (ctx, payload) => {
      const p = obj(payload), machine = machineOf(ctx, p);
      const gameId = typeof p.gameId === "string" && p.gameId && p.gameId.length <= 100 ? p.gameId : ctx.fail(400, "vo.err.badRequest");
      const throwIndex = typeof p.throwIndex === "number" && Number.isInteger(p.throwIndex) && p.throwIndex >= 0 ? p.throwIndex : ctx.fail(400, "vo.err.badRequest");
      const x = aim(ctx, p.x), y = aim(ctx, p.y);
      const [dx, dy] = jitter();
      await run(ctx, machine, (s, st) => throwDart(s, machine, ctx.user.id, st, { gameId, throwIndex }, scoreAt(x + dx, y + dy), ctx.now.getTime()));
    },
  },
};
export default server;
