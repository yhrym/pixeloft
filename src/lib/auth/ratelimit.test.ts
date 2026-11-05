import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireHashSlot, failuresSize, loginBlocked, recordLoginFailure } from "./ratelimit.ts";

test("blocks after 10 failures and releases after 15 minutes", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 9; i++) recordLoginFailure("a|1", t0);
  assert.equal(loginBlocked("a|1", t0), false);
  recordLoginFailure("a|1", t0);
  assert.equal(loginBlocked("a|1", t0), true);
  assert.equal(loginBlocked("b|1", t0), false);
  assert.equal(loginBlocked("a|1", t0 + 15 * 60 * 1000), false);
});

test("失敗の記録は1万件を超えたら期限切れを消し、それでも多ければ古い順に消す", () => {
  const t0 = 5_000_000;
  for (let i = 0; i < 10_000; i++) recordLoginFailure(`old${i}|1`, t0);
  assert.ok(failuresSize() >= 10_000);
  const later = t0 + 15 * 60 * 1000;
  recordLoginFailure("new|1", later); // 期限切れだけが消える
  assert.equal(failuresSize(), 1);
  for (let i = 0; i < 10_050; i++) recordLoginFailure(`live${i}|1`, later); // 全部生きていても1万件まで
  assert.equal(failuresSize(), 10_000);
  assert.equal(loginBlocked("live0|1", later), false);
});

test("scryptの同時実行は8まで。満杯なら待たずにnull、解放すると空く(二重解放は1回ぶん)", () => {
  const slots = Array.from({ length: 8 }, () => acquireHashSlot());
  assert.ok(slots.every(Boolean));
  assert.equal(acquireHashSlot(), null);
  slots[0]!(); slots[0]!();
  const again = acquireHashSlot();
  assert.ok(again);
  assert.equal(acquireHashSlot(), null);
  again!(); slots.slice(1).forEach((r) => r!());
});
