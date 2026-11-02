import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCsrf } from "./csrf.ts";

const req = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/x", { method: "POST", headers: { host: "office.test", ...headers } });

test("same origin passes", () => assert.equal(checkCsrf(req({ origin: "http://office.test" }), false), null));
test("cross origin is rejected", () =>
  assert.equal(checkCsrf(req({ origin: "http://evil.test" }), false), "origin-mismatch"));
test("missing Origin is rejected", () => assert.equal(checkCsrf(req({}), false), "origin-missing"));
test("Origin null is rejected", () => assert.equal(checkCsrf(req({ origin: "null" }), false), "origin-mismatch"));
test("Sec-Fetch-Site cross-site is rejected", () =>
  assert.equal(checkCsrf(req({ origin: "http://office.test", "sec-fetch-site": "cross-site" }), false), "cross-site"));
test("forwarded host is used only when the proxy is trusted", () => {
  const r = req({ origin: "https://public.test", "x-forwarded-host": "public.test", "x-forwarded-proto": "https" });
  assert.equal(checkCsrf(r, true), null);
  assert.equal(checkCsrf(r, false), "origin-mismatch");
});
