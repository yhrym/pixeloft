import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken, newToken } from "./token.ts";

test("newToken is 43 base64url chars and unique", () => {
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, newToken());
});

test("hashToken is sha256 hex and deterministic", () => {
  assert.equal(hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(hashToken("abc"), hashToken("abc"));
});
