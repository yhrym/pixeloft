import assert from "node:assert/strict";
import test from "node:test";
import { canModifyPart } from "./permission.ts";

const part = { createdById: "u1" };

test("直す・消せるのは描いた本人と管理者だけ", () => {
  assert.equal(canModifyPart({ id: "u1", role: "member" }, part), true);
  assert.equal(canModifyPart({ id: "a1", role: "admin" }, part), true);
  assert.equal(canModifyPart({ id: "u2", role: "member" }, part), false);
});
