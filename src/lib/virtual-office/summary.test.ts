import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../db.ts";
import { heartbeat as beat } from "./summary.ts";

const JST = { timeZone: "Asia/Tokyo", workEndHour: 18 };
const heartbeat = (id: string, now: Date, idle?: number, settings = JST) => beat(id, now, settings, idle);

// DBには触らない。Prismaのdelegateはt.mock.methodで差し替えられない(メソッドが自前のプロパティでない)ので、代入して戻す。
// ハートビートの更新は$executeRaw1本なので、SQLの文と値を記録する
function recordRaw(t: { after: (fn: () => void) => void }) {
  const p = prisma as unknown as Record<string, unknown>;
  const orig = p.$executeRaw;
  t.after(() => { p.$executeRaw = orig; });
  const raws: { sql: string; values: unknown[] }[] = [];
  p.$executeRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    raws.push({ sql: strings.join("?"), values });
    return 0;
  };
  return raws;
}

test("ハートビート: 今日(設定のゾーン)の退出していない在室のlastSeenAtだけ更新する。入室させない・離席は触らない", async (t) => {
  const d = prisma.voPresence as unknown as Record<string, unknown>;
  const orig = { upsert: d.upsert, create: d.create };
  t.after(() => Object.assign(d, orig));
  const raws = recordRaw(t);
  d.upsert = d.create = async () => assert.fail("入室させない");
  const now = new Date("2026-10-24T15:30:00Z"); // 東京では10/25の0:30
  await heartbeat("u1", now);
  assert.equal(raws.length, 1);
  assert.match(raws[0].sql, /^UPDATE "VoPresence" SET "lastSeenAt" = .*GREATEST\("lastActiveAt".*WHERE "userId" = \? AND "date" = \? AND "leftAt" IS NULL$/);
  assert.doesNotMatch(raws[0].sql, /away/);
  // idleなしは最後に触った時刻をNULLで渡して進めない
  assert.deepEqual(raws[0].values, ["2026-10-24T15:30:00.000Z", null, "u1", "2026-10-25"]);
});

test("終業後: idleで最後に触った時刻を進め(戻さない条件付き)、期限を過ぎた人だけ在室中を条件に自動で退出させてひとことを消す", async (t) => {
  const d = prisma.voPresence as unknown as Record<string, unknown>;
  const pr = prisma.voProfile as unknown as Record<string, unknown>;
  const orig = { updateMany: d.updateMany, findMany: d.findMany };
  const origProfile = { updateMany: pr.updateMany };
  t.after(() => {
    Object.assign(d, orig);
    Object.assign(pr, origProfile);
  });
  const raws = recordRaw(t);
  const calls: unknown[] = [];
  d.updateMany = async (args: unknown) => {
    calls.push(args);
    return { count: 1 };
  };
  pr.updateMany = async (args: unknown) => {
    calls.push({ profile: args });
    return { count: 1 };
  };
  const now = new Date("2026-10-25T10:30:00Z"); // 東京では19:30
  d.findMany = async () => [
    { userId: "late", lastActiveAt: new Date("2026-10-25T09:20:00Z") }, // 18:20 → 期限19:20を過ぎた
    { userId: "fresh", lastActiveAt: new Date("2026-10-25T09:40:00Z") }, // 18:40 → 期限19:40
  ];
  await heartbeat("u1", now, 30);
  // 最後に触った時刻はidle(30秒)ぶん前。GREATESTで戻さない
  assert.deepEqual(raws.map((r) => r.values), [["2026-10-25T10:30:00.000Z", "2026-10-25T10:29:30.000Z", "u1", "2026-10-25"]]);
  const today = { date: "2026-10-25", leftAt: null };
  assert.deepEqual(calls, [
    { where: { userId: "late", ...today }, data: { leftAt: now, away: false, autoLeft: true } },
    { profile: { where: { userId: "late" }, data: { memo: "", memoDate: null } } },
  ]);
});

test("終業後の自動退出は30秒に1回だけ在室を読む", async (t) => {
  const d = prisma.voPresence as unknown as Record<string, unknown>;
  const orig = { findMany: d.findMany };
  t.after(() => Object.assign(d, orig));
  recordRaw(t);
  let reads = 0;
  d.findMany = async () => {
    reads++;
    return [];
  };
  const base = new Date("2026-10-27T10:30:00Z").getTime(); // 東京では19:30(ほかのテストと日をずらす)
  await heartbeat("u1", new Date(base));
  await heartbeat("u1", new Date(base + 29_000));
  assert.equal(reads, 1);
  await heartbeat("u1", new Date(base + 30_000));
  assert.equal(reads, 2);
});

test("ハートビートの書き込みは1人60秒に1回。別の人はすぐ書く・失敗した次は60秒以内でも書き直す", async (t) => {
  const raws = recordRaw(t);
  const p = prisma as unknown as Record<string, unknown>;
  const base = new Date("2026-10-28T03:00:00Z").getTime(); // 18時前(自動退出を流さない・ほかのテストと日をずらす)
  const at = (ms: number) => new Date(base + ms);
  await heartbeat("w1", at(0));
  await heartbeat("w1", at(59_000));
  assert.equal(raws.length, 1);
  await heartbeat("w1", at(60_000));
  assert.equal(raws.length, 2);
  await heartbeat("w2", at(60_000));
  assert.equal(raws.length, 3);
  // 失敗したら時刻を戻すので、次は60秒以内でも書く
  const ok = p.$executeRaw;
  p.$executeRaw = async () => { throw new Error("db down"); };
  await assert.rejects(heartbeat("w1", at(120_000)), /db down/);
  p.$executeRaw = ok;
  await heartbeat("w1", at(121_000));
  assert.equal(raws.length, 4);
});

test("終業時刻とタイムゾーンは設定: ニューヨークの終業(18時)前は自動退出を流さず、後は流す", async (t) => {
  const d = prisma.voPresence as unknown as Record<string, unknown>;
  const orig = { findMany: d.findMany };
  t.after(() => Object.assign(d, orig));
  recordRaw(t);
  let reads = 0;
  d.findMany = async () => {
    reads++;
    return [];
  };
  const ny = { timeZone: "America/New_York", workEndHour: 18 };
  await heartbeat("n1", new Date("2026-11-10T22:30:00Z"), undefined, ny); // 現地17:30
  assert.equal(reads, 0);
  await heartbeat("n1", new Date("2026-11-10T23:30:00Z"), undefined, ny); // 現地18:30
  assert.equal(reads, 1);
});
