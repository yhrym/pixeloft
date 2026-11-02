import assert from "node:assert/strict";
import test from "node:test";
import { clearShortCache, shortCache } from "./short-cache.ts";

const t0 = new Date("2026-11-01T03:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

test("prefixで消すと他のキーは残る", async () => {
  clearShortCache();
  let n = 0;
  const load = async () => ++n;
  await shortCache("a:1", t0, load);
  await shortCache("b:1", t0, load);
  clearShortCache("a:");
  await shortCache("a:1", at(10), load);
  await shortCache("b:1", at(10), load);
  assert.equal(n, 3);
});

test("古いエントリは新しく入れるときに掃除される", async () => {
  clearShortCache();
  let n = 0;
  const load = async () => ++n;
  await shortCache("old", t0, load);
  await shortCache("new", at(1500), load); // oldは期限切れで捨てられる
  await shortCache("old", t0, load); // 掃除されていなければ(時計を戻したので)使い回しになる
  assert.equal(n, 3);
});

test("10秒のエントリは1秒たっても掃除されず、10秒で読み直す", async () => {
  clearShortCache();
  let n = 0;
  const load = async () => ++n;
  await shortCache("long", t0, load, 10_000);
  await shortCache("other", at(1500), load); // 1秒のエントリなら掃除される時間
  await shortCache("long", at(1600), load, 10_000); // 使い回し
  assert.equal(n, 2);
  await shortCache("long", at(10_000), load, 10_000); // 10秒で読み直す
  assert.equal(n, 3);
});
