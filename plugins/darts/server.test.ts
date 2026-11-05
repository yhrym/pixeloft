import assert from "node:assert/strict";
import test from "node:test";
import type { PluginCtx, PluginPerson } from "@/plugins/types";
import { makeStore } from "../../src/lib/plugins/store.ts";
import { VoError } from "../../src/lib/virtual-office/presence.ts";
import { makeTestCtx, memoryDb } from "../../src/plugins/testing.ts";
import { scoreAt, DART_TURN_MS } from "./board.ts";
import type { DartsView } from "./game.ts";
import server, { jitter } from "./server.ts";

const t0 = Date.parse("2026-11-01T03:00:00Z");
const date = "2026-11-01";
/** 偽のctx。保存は本物のstoreにメモリのDB(DBへの書き込みをsavesに数える)、人と置き物は引数のとおり */
function world(items: string[], people: PluginPerson[]) {
  const db = memoryDb(), save = db.save, w = { saves: 0, people, date, now: t0 };
  db.save = async (p, k, v) => { w.saves++; await save(p, k, v); };
  const store = makeStore("darts", db);
  const ctx = (userId: string): PluginCtx => makeTestCtx({
    user: { id: userId, name: userId, isAdmin: false }, now: new Date(w.now), date: w.date, store,
    people: async () => w.people,
    items: async () => items.map((id) => ({ id, type: "darts:machine", floor: "f1", x: 0, y: 0, dir: "y+" as const, props: {} })),
  });
  const state = async (u: string) => (await server.state!(ctx(u))) as DartsView & { now: number };
  const act = async (u: string, name: string, payload: unknown) => { await server.actions![name](ctx(u), payload); };
  return { w, store, state, act };
}
const person = (id: string, seatId: string | null, away = false): PluginPerson => ({ id, name: id.toUpperCase(), room: "r", seatId, away });
const rejects = (p: Promise<unknown>, status: number, key?: string) => assert.rejects(p, (e: unknown) => e instanceof VoError && e.status === status && (!key || e.message === key));

test("台ごとの立ち位置・開始・投げる(手ぶれはサーバー)・二重送信・変わったときだけ保存", async () => {
  const { w, state, act } = world(["A", "B"], [person("b", "A-2"), person("a", "A-1"), person("c", "B-1"), person("x", "desk-1")]);
  const first = await state("a");
  assert.deepEqual(first.machines.map((m) => [m.id, m.standing.map((p) => [p.userId, p.name])]), [["A", [["a", "A"], ["b", "B"]]], ["B", [["c", "C"]]]]);
  assert.equal(first.now, t0);
  assert.equal(w.saves, 0);

  await rejects(act("c", "start", { machine: "A" }), 409, "plugin.darts.err.notStanding");
  await act("b", "start", { machine: "A" });
  const g = (await state("a")).machines[0].game!;
  assert.deepEqual([g.mode, g.players.map((p) => p.userId), g.turn], ["301", ["a", "b"], 0]);
  // 別の台は別に遊べる
  await act("c", "start", { machine: "B" });
  assert.equal((await state("a")).machines[1].game!.mode, "countup");

  await rejects(act("b", "throw", { machine: "A", gameId: g.id, throwIndex: 0, x: 0, y: 0 }), 409, "plugin.darts.err.notYourTurn");
  const saves = w.saves;
  const aim = { machine: "A", gameId: g.id, throwIndex: 0, x: 0, y: -103 };
  w.now = t0 + 500;
  await act("a", "throw", aim);
  await rejects(act("a", "throw", aim), 409, "plugin.darts.err.changed");
  assert.equal(w.saves, saves + 1);
  const m = (await state("a")).machines[0];
  const hit = m.lastThrow!.hit;
  assert.notDeepEqual([hit.x, hit.y], [0, -103]);
  assert.deepEqual(hit, scoreAt(hit.x, hit.y));
  assert.equal(m.game!.players[0].score, 301 - hit.score);

  // 読むだけなら保存しない。締め切りを過ぎたらstateで進んで保存される
  assert.equal(w.saves, saves + 1);
  w.now = t0 + DART_TURN_MS;
  const moved = await state("a");
  assert.deepEqual([moved.machines[0].game!.turn, w.saves], [1, saves + 2]);
  // aが立ち位置を離れたら301はbの勝ち
  w.people = [person("b", "A-2"), person("c", "B-1")];
  w.now += 1;
  const ended = (await state("b")).machines[0];
  assert.deepEqual([ended.game, ended.result!.winnerUserIds], [null, ["b"]]);
});

test("離席中の人は立っていない扱いで、ゲーム中なら抜ける", async () => {
  const { w, state, act } = world(["A"], [person("a", "A-1"), person("b", "A-2"), person("c", "A-3", true)]);
  await act("a", "start", { machine: "A" });
  const s = (await state("a")).machines[0];
  assert.deepEqual([s.standing.map((p) => p.userId), s.game!.players.map((p) => p.userId)], [["a", "b"], ["a", "b"]]);
  w.people = [person("a", "A-1"), person("b", "A-2", true)];
  const e = (await state("a")).machines[0];
  assert.deepEqual([e.standing.map((p) => p.userId), e.game, e.result!.winnerUserIds], [["a"], null, ["a"]]);
});

test("日付が変わったら台もランキングも作り直す(中身があれば保存、無ければ保存しない)", async () => {
  const { w, store, state, act } = world(["A"], [person("a", "A-1")]);
  await state("a");
  assert.equal(w.saves, 0);
  await act("a", "start", { machine: "A" });
  await store.set("darts", { ...((await store.get("darts")) as object), ranking: [{ userId: "a", name: "A", score: 99 }] });
  const saves = w.saves;
  w.date = "2026-11-02";
  const next = await state("a");
  assert.deepEqual([next.machines[0].game, next.ranking], [null, []]);
  assert.deepEqual([((await store.get("darts")) as { date: string }).date, w.saves], ["2026-11-02", saves + 1]);
  await state("a");
  assert.equal(w.saves, saves + 1);
});

test("payloadは信用しない: 置き物にない台・型や範囲が違うものは400", async () => {
  const { act, state } = world(["A"], [person("a", "A-1")]);
  await act("a", "start", { machine: "A" });
  const g = (await state("a")).machines[0].game!;
  const ok = { machine: "A", gameId: g.id, throwIndex: 0, x: -250, y: 12.5 };
  await rejects(act("a", "start", { machine: "Z" }), 400);
  await rejects(act("a", "start", null), 400);
  await rejects(act("a", "start", { machine: 1 }), 400);
  for (const v of [{ machine: "Z" }, { gameId: "" }, { gameId: 1 }, { throwIndex: -1 }, { throwIndex: 1.5 }, { x: 250.1 }, { y: -251 }, { x: NaN }, { y: Infinity }, { x: "1" }]) await rejects(act("a", "throw", { ...ok, ...v }), 400);
  await act("a", "throw", ok);
});

test("手ぶれ: 平均0・標準偏差6mmの正規分布", () => {
  const xs: number[] = [];
  for (let i = 0; i < 5000; i++) xs.push(...jitter());
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.3, `mean=${mean}`);
  assert.ok(Math.abs(sd - 6) < 0.3, `sd=${sd}`);
});
