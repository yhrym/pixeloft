import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteUsable } from "./invite.ts";

const now = new Date("2026-01-10T00:00:00Z");
const future = new Date("2026-01-11T00:00:00Z");
const past = new Date("2026-01-09T00:00:00Z");

test("valid invite", () => assert.equal(inviteUsable({ expiresAt: future, maxUses: 2, uses: 1 }, now), true));
test("expired invite", () => assert.equal(inviteUsable({ expiresAt: past, maxUses: 2, uses: 0 }, now), false));
test("used-up invite", () => assert.equal(inviteUsable({ expiresAt: future, maxUses: 2, uses: 2 }, now), false));
