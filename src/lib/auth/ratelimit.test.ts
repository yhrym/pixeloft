import { test } from "node:test";
import assert from "node:assert/strict";
import { loginBlocked, recordLoginFailure } from "./ratelimit.ts";

test("blocks after 10 failures and releases after 15 minutes", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 9; i++) recordLoginFailure("a|1", t0);
  assert.equal(loginBlocked("a|1", t0), false);
  recordLoginFailure("a|1", t0);
  assert.equal(loginBlocked("a|1", t0), true);
  assert.equal(loginBlocked("b|1", t0), false);
  assert.equal(loginBlocked("a|1", t0 + 15 * 60 * 1000), false);
});
