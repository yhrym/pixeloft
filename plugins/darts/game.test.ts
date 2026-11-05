import assert from "node:assert/strict";
import test from "node:test";
import { DART_TURN_MS, scoreAt } from "./board.ts";
import { emptyStore, GameError, standingOf, startGame, storeOf, syncDarts, throwDart, viewDarts, type Standing } from "./game.ts";

type Store = ReturnType<typeof emptyStore>;
const date = "2026-11-01";
const M = "m1";
const hit = (score: number) => ({ x: 0, y: 0, score, label: `S${score}` });
const stand = (...ids: string[]): Standing => ids.map((userId, i) => ({ userId, name: userId, seatId: `${M}-${i + 1}` }));
const sy = (s: Store, st: Standing, now: number) => syncDarts(s, { [M]: st }, now);
/** 今の番の人が今のthrowIndexで投げる */
const shoot = (s: Store, st: Standing, score: number, now = 0, m = M) => {
  const g = s.machines[m].game!;
  throwDart(s, m, g.players[g.turn].userId, st, { gameId: g.id, throwIndex: g.throwIndex }, hit(score), now);
};
const conflict = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof GameError);
const at = (deg: number, r: number) => scoreAt(r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180));

test("scoreAt: 区画の向き・ブル・トリプル・ダブル・MISSの境目", () => {
  assert.equal(scoreAt(0, -50).label, "S20");
  assert.equal(scoreAt(50, 0).label, "S6");
  assert.equal(scoreAt(0, 50).label, "S3");
  assert.equal(scoreAt(-50, 0).label, "S11");
  assert.equal(at(8.9, 50).label, "S20");
  assert.equal(at(9.1, 50).label, "S1");
  assert.equal(at(-9.1, 50).label, "S5");
  assert.deepEqual(scoreAt(0, 0), { x: 0, y: 0, score: 50, label: "BULL" });
  assert.equal(scoreAt(0, -16).score, 50);
  assert.equal(scoreAt(0, -16.01).label, "S20");
  assert.equal(scoreAt(0, -98.9).label, "S20");
  assert.deepEqual([scoreAt(0, -99).label, scoreAt(0, -99).score], ["T20", 60]);
  assert.equal(scoreAt(0, -107).label, "T20");
  assert.equal(scoreAt(0, -107.1).label, "S20");
  assert.equal(scoreAt(0, -161.9).label, "S20");
  assert.deepEqual([scoreAt(0, -162).label, scoreAt(0, -162).score], ["D20", 40]);
  assert.equal(scoreAt(0, -170).label, "D20");
  assert.deepEqual([scoreAt(0, -170.1).label, scoreAt(0, -170.1).score], ["MISS", 0]);
});

test("立ち位置: 置き物の席(<id>-<番号>)ごと、席の番号順。ほかの席・5番以降は入らない", () => {
  const rows = [
    { userId: "c", seatId: "m2-2", name: "C" }, { userId: "b", seatId: "m1-3", name: "B" }, { userId: "a", seatId: "m1-1", name: "A" },
    { userId: "x", seatId: "desk-1", name: "X" }, { userId: "y", seatId: "m1-5", name: "Y" }, { userId: "z", seatId: null, name: "Z" },
  ];
  assert.deepEqual(standingOf(["m1", "m2", "m3"], rows), {
    m1: [{ userId: "a", name: "A", seatId: "m1-1" }, { userId: "b", name: "B", seatId: "m1-3" }],
    m2: [{ userId: "c", name: "C", seatId: "m2-2" }],
    m3: [],
  });
});

test("カウントアップ: 3ラウンド×3本の合計、終わったら結果とランキング", () => {
  const s = emptyStore(date);
  const st = stand("a");
  startGame(s, M, "a", st, 0, "g1");
  const g = s.machines[M].game!;
  assert.deepEqual([g.mode, g.maxRounds, g.players[0].score, g.turnEndsAt], ["countup", 3, 0, DART_TURN_MS]);
  for (const n of [60, 20, 1, 50, 50, 50, 0, 3, 3]) shoot(s, st, n);
  const m = s.machines[M];
  assert.equal(m.game, null);
  assert.deepEqual(m.result, { gameId: "g1", mode: "countup", players: [{ userId: "a", name: "a", score: 237 }], winnerUserIds: [] });
  assert.deepEqual(m.lastTurn, { gameId: "g1", userId: "a", darts: [hit(0), hit(3), hit(3)], total: 6, bust: false });
  assert.deepEqual(m.lastThrow, { gameId: "g1", index: 8, userId: "a", hit: hit(3), bust: false });
  assert.deepEqual(s.ranking, [{ userId: "a", name: "a", score: 237 }]);
  // 次のゲームが始まると結果は消える
  startGame(s, M, "a", st, 0, "g2");
  assert.equal(m.result, null);
});

test("301: バストはそのターンの点を戻して次の人へ、ぴったり0で即勝ち", () => {
  const s = emptyStore(date);
  const st = stand("a", "b");
  startGame(s, M, "b", st, 0, "g");
  const g = s.machines[M].game!;
  assert.deepEqual([g.mode, g.maxRounds, g.players.map((p) => p.score)], ["301", 8, [301, 301]]);
  for (const n of [60, 60, 60]) shoot(s, st, n);
  for (const n of [1, 1, 1]) shoot(s, st, n);
  shoot(s, st, 60);
  shoot(s, st, 60);
  assert.equal(g.players[0].score, 1);
  shoot(s, st, 20);
  const m = s.machines[M];
  assert.deepEqual([g.players[0].score, g.players[0].rounds, g.turn, g.round, g.darts], [121, [180, 0], 1, 2, []]);
  assert.equal(m.lastThrow!.bust, true);
  assert.deepEqual([m.lastTurn!.darts.length, m.lastTurn!.total, m.lastTurn!.bust], [3, 0, true]);
  // bは残り298→40にしてD20で上がる(2本目で即終わり)
  g.players[1].score = 80;
  shoot(s, st, 40);
  shoot(s, st, 40);
  assert.equal(m.game, null);
  assert.deepEqual(m.result, { gameId: "g", mode: "301", players: [{ userId: "a", name: "a", score: 121 }, { userId: "b", name: "b", score: 0 }], winnerUserIds: ["b"] });
  assert.deepEqual([m.lastTurn!.userId, m.lastTurn!.total, m.lastTurn!.darts.length], ["b", 80, 2]);
  assert.deepEqual(s.ranking, []);
});

test("301: 8ラウンドで決まらなければ残りが一番少ない人、同点は全員", () => {
  for (const [scores, winners] of [[[100, 50, 70], ["b"]], [[50, 90, 50], ["a", "c"]]] as const) {
    const s = emptyStore(date);
    const st = stand("a", "b", "c");
    startGame(s, M, "a", st, 0, "g");
    const g = s.machines[M].game!;
    Object.assign(g, { round: 8, turn: 2 });
    scores.forEach((n, i) => (g.players[i].score = n));
    for (let i = 0; i < 3; i++) shoot(s, st, 0);
    assert.equal(s.machines[M].game, null);
    assert.deepEqual(s.machines[M].result!.winnerUserIds, winners);
  }
});

test("301: 誰も投げずに全員が時間切れで8ラウンド過ぎたら勝ちなし", () => {
  const s = emptyStore(date);
  const st = stand("a", "b");
  startGame(s, M, "a", st, 0, "g");
  sy(s, st, 16 * DART_TURN_MS);
  assert.equal(s.machines[M].game, null);
  assert.deepEqual(s.machines[M].result!.players.map((p) => p.score), [301, 301]);
  assert.deepEqual(s.machines[M].result!.winnerUserIds, []);
});

test("45秒: 締め切りを過ぎたターンは残りをMISSにして次へ。複数ターン分をまとめて", () => {
  const s = emptyStore(date);
  const st = stand("a", "b");
  startGame(s, M, "a", st, 0, "g");
  const g = s.machines[M].game!;
  shoot(s, st, 20, 1000);
  sy(s, st, DART_TURN_MS - 1);
  assert.equal(g.turn, 0);
  sy(s, st, 2 * DART_TURN_MS + 10);
  assert.deepEqual([g.turn, g.round, g.throwIndex, g.turnEndsAt], [0, 2, 6, 3 * DART_TURN_MS]);
  assert.deepEqual(g.players.map((p) => [p.score, p.rounds]), [[281, [20]], [301, [0]]]);
  assert.deepEqual(s.machines[M].lastTurn, { gameId: "g", userId: "b", darts: [], total: 0, bust: false });
  // 締め切りを過ぎた矢は受け付けない(先に進めてから確かめる)
  const late = { gameId: "g", throwIndex: 6 };
  sy(s, st, 3 * DART_TURN_MS);
  conflict(() => throwDart(s, M, "a", st, late, hit(20), 3 * DART_TURN_MS));
});

test("45秒: 1本も投げないカウントアップは3ターン分で終わり、ランキングに入らない", () => {
  const s = emptyStore(date);
  const st = stand("a");
  startGame(s, M, "a", st, 0, "g");
  sy(s, st, 10 * DART_TURN_MS);
  assert.equal(s.machines[M].game, null);
  assert.deepEqual(s.machines[M].result!.players, [{ userId: "a", name: "a", score: 0 }]);
  assert.deepEqual(s.ranking, []);
});

test("45秒: 1本でも投げたカウントアップは時間切れで終わってもランキングに入る(前のゲームの矢は数えない)", () => {
  const s = emptyStore(date);
  const st = stand("a");
  startGame(s, M, "a", st, 0, "g0");
  s.machines[M].lastThrow = { gameId: "old", index: 0, userId: "a", hit: hit(50), bust: false };
  s.machines[M].game = null;
  startGame(s, M, "a", st, 0, "g");
  sy(s, st, 10 * DART_TURN_MS);
  assert.deepEqual(s.ranking, []);
  startGame(s, M, "a", st, 0, "g2");
  shoot(s, st, 0, 0);
  sy(s, st, 10 * DART_TURN_MS);
  assert.deepEqual(s.ranking, [{ userId: "a", name: "a", score: 0 }]);
});

test("途中で抜ける: 自分の番なら次の人へ(投げた矢は消して締め切りを取り直す)、前の人が抜けても今の人のまま", () => {
  const s = emptyStore(date);
  startGame(s, M, "a", stand("a", "b", "c", "d"), 0, "g");
  const g = s.machines[M].game!;
  shoot(s, stand("a", "b", "c", "d"), 20, 0);
  sy(s, stand("b", "c", "d"), 5000);
  assert.deepEqual([g.players.map((p) => p.userId), g.turn, g.round, g.darts, g.turnEndsAt], [["b", "c", "d"], 0, 1, [], 5000 + DART_TURN_MS]);
  for (let i = 0; i < 3; i++) shoot(s, stand("b", "c", "d"), 1, 6000);
  // cの番で前のbが抜ける → cのまま・締め切りもそのまま
  sy(s, stand("c", "d"), 7000);
  assert.deepEqual([g.players.map((p) => p.userId), g.turn, g.round, g.turnEndsAt], [["c", "d"], 0, 1, 6000 + DART_TURN_MS]);
});

test("途中で抜ける: 301で1人残ればその人の勝ち、0人なら結果なし、カウントアップはランキングに入らない", () => {
  const s = emptyStore(date);
  startGame(s, M, "a", stand("a", "b"), 0, "g301");
  sy(s, stand("a"), 1000);
  assert.deepEqual(s.machines[M].result, { gameId: "g301", mode: "301", players: [{ userId: "a", name: "a", score: 301 }], winnerUserIds: ["a"] });
  startGame(s, M, "a", stand("a"), 2000, "gc");
  shoot(s, stand("a"), 60, 2000);
  sy(s, [], 3000);
  assert.deepEqual([s.machines[M].game, s.machines[M].result, s.ranking], [null, null, []]);
});

test("最後の人の番でその人が抜けたら、先頭へ戻って次のラウンド", () => {
  const s = emptyStore(date);
  const st = stand("a", "b", "c");
  startGame(s, M, "a", st, 0, "g");
  for (let i = 0; i < 6; i++) shoot(s, st, 1);
  const g = s.machines[M].game!;
  assert.equal(g.turn, 2);
  sy(s, stand("a", "b"), 1000);
  assert.deepEqual([g.players.map((p) => p.userId), g.turn, g.round], [["a", "b"], 0, 2]);
});

test("二重送信・別のゲーム・自分の番でない・立っていない・ゲーム中に始める は409相当", () => {
  const s = emptyStore(date);
  const st = stand("a", "b");
  conflict(() => startGame(s, M, "z", st, 0, "g"));
  startGame(s, M, "a", st, 0, "g");
  conflict(() => startGame(s, M, "b", st, 0, "g2"));
  const sent = { gameId: "g", throwIndex: 0 };
  throwDart(s, M, "a", st, sent, hit(20), 0);
  conflict(() => throwDart(s, M, "a", st, sent, hit(20), 0));
  conflict(() => throwDart(s, M, "a", st, { gameId: "old", throwIndex: 1 }, hit(20), 0));
  conflict(() => throwDart(s, M, "b", st, { gameId: "g", throwIndex: 1 }, hit(20), 0));
  conflict(() => throwDart(s, M, "z", st, { gameId: "g", throwIndex: 1 }, hit(20), 0));
  conflict(() => throwDart(s, "m2", "a", [], { gameId: "g", throwIndex: 1 }, hit(20), 0));
  assert.equal(s.machines[M].game!.throwIndex, 1);
});

test("台は置き物ごとに別: 別の台のゲームに触らず、ランキングは共通", () => {
  const s = emptyStore(date);
  startGame(s, "m1", "a", stand("a"), 0, "g1");
  startGame(s, "m2", "b", [{ userId: "b", name: "b", seatId: "m2-1" }], 0, "g2");
  assert.deepEqual([s.machines.m1.game!.players[0].userId, s.machines.m2.game!.players[0].userId], ["a", "b"]);
});

test("ランキング: 1人1件の自己ベスト・上位10・同点は先に出した人が上", () => {
  const s = emptyStore(date);
  const play = (userId: string, score: number) => {
    const st = stand(userId);
    startGame(s, "m2", userId, st, 0, `${userId}${score}`);
    shoot(s, st, score, 0, "m2");
    for (let i = 0; i < 8; i++) shoot(s, st, 0, 0, "m2");
  };
  play("a", 100);
  play("a", 80);
  assert.deepEqual(s.ranking, [{ userId: "a", name: "a", score: 100 }]);
  play("b", 100);
  play("a", 120);
  assert.deepEqual(s.ranking.map((r) => [r.userId, r.score]), [["a", 120], ["b", 100]]);
  play("c", 100);
  for (let i = 0; i < 10; i++) play(`u${i}`, 10 + i);
  assert.equal(s.ranking.length, 10);
  assert.deepEqual(s.ranking.slice(0, 4).map((r) => [r.userId, r.score]), [["a", 120], ["b", 100], ["c", 100], ["u9", 19]]);
  assert.equal(s.ranking.at(-1)!.userId, "u3");
});

test("日付が変わったら台もランキングも作り直す", () => {
  const s = emptyStore(date);
  startGame(s, M, "a", stand("a"), 0, "g");
  s.ranking.push({ userId: "a", name: "a", score: 10 });
  assert.equal(storeOf(s, date), s);
  assert.deepEqual(storeOf(s, "2026-11-02"), emptyStore("2026-11-02"));
  assert.deepEqual(storeOf({}, date), emptyStore(date));
  assert.deepEqual(storeOf(undefined, date), emptyStore(date));
});

test("画面に返す形: 置き物のある台だけ、立っている人を付ける", () => {
  const s = emptyStore(date);
  startGame(s, "gone", "z", [{ userId: "z", name: "z", seatId: "gone-1" }], 0, "g");
  const v = viewDarts(s, { m1: stand("a"), m2: [] });
  assert.deepEqual(v.machines.map((m) => [m.id, m.standing.map((p) => p.userId)]), [["m1", ["a"]], ["m2", []]]);
  assert.deepEqual(v.ranking, []);
});
