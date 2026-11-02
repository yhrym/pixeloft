import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.ts";

test("hash has the scrypt$salt$hash shape and differs per call", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.match(a, /^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(a, b);
});

test("verify accepts the right password and rejects a wrong one", async () => {
  const h = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", h), true);
  assert.equal(await verifyPassword("wrong horse", h), false);
});

test("verify rejects malformed stored values", async () => {
  assert.equal(await verifyPassword("x", "garbage"), false);
});
