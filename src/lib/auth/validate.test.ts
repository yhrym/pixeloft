import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewUser } from "./validate.ts";

test("validateNewUser", () => {
  assert.equal(validateNewUser("ab", "n", "12345678"), "loginId");
  assert.equal(validateNewUser("Alice", "n", "12345678"), "loginId");
  assert.equal(validateNewUser("alice", "", "12345678"), "name");
  assert.equal(validateNewUser("alice", "x".repeat(41), "12345678"), "name");
  assert.equal(validateNewUser("alice", "n", "1234567"), "password");
  assert.equal(validateNewUser("a.l-i_c3", "n", "12345678"), null);
});
