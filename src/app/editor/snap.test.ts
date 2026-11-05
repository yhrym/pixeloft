import assert from "node:assert/strict";
import { test } from "node:test";
import { snapOut } from "./snap.ts";

test("snapOutは外側のマス目に広げる", () => {
  assert.deepEqual(snapOut([3, 5, 20, 17], 16), [0, 0, 32, 32]);
  assert.deepEqual(snapOut([16, 16, 32, 32], 16), [16, 16, 32, 32]);
});

test("snapOutは幅0でも1マス分を残す", () => {
  assert.deepEqual(snapOut([16, 4, 16, 10], 16), [16, 0, 32, 16]);
  assert.deepEqual(snapOut([0, 32, 40, 32], 16), [0, 32, 48, 48]);
});
