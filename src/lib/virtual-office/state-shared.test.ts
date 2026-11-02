import assert from "node:assert/strict";
import test from "node:test";

import { sharedState, invalidateShared } from "./state.ts";

// DBには触らない(読み込み関数を差し替える)。キャッシュはモジュール内なので、各テストの頭で捨てる
function loader() {
  let n = 0;
  const calls: string[] = [];
  const fn = async (date: string) => {
    calls.push(date);
    return { n: ++n } as never;
  };
  return { fn, calls };
}
const t0 = new Date("2026-11-01T03:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

test("共有の読み込み: 1秒以内は使い回し・invalidateで読み直し・1秒で読み直し・日付が違えば読み直し", async () => {
  invalidateShared();
  const { fn, calls } = loader();
  await sharedState("d", t0, fn);
  await sharedState("d", at(999), fn);
  assert.equal(calls.length, 1);
  invalidateShared();
  await sharedState("d", at(1000), fn);
  assert.equal(calls.length, 2);
  await sharedState("d", at(2000), fn); // 1秒ちょうど
  assert.equal(calls.length, 3);
  await sharedState("e", at(2100), fn); // 日付が違う
  assert.equal(calls.length, 4);
  await sharedState("e", at(2000), fn); // 時計が戻った
  assert.equal(calls.length, 5);
});

test("共有の読み込み: 同時に来たら同じPromiseを待ち、失敗は持ち続けない", async () => {
  invalidateShared();
  const { fn, calls } = loader();
  const [a, b] = await Promise.all([sharedState("d", t0, fn), sharedState("d", at(10), fn)]);
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  invalidateShared();
  const bad = async () => {
    throw new Error("x");
  };
  await assert.rejects(sharedState("d", at(5000), bad), /x/);
  await sharedState("d", at(5001), fn);
  assert.equal(calls.length, 2);
});
