import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver, vapidSubject } from "./push.ts";

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/${n}`, p256dh: "p", auth: "a" });
const payload = { title: "t", body: "b", url: "/", tag: "x" };

test("deliver: 成功を数え、失敗は止めずに続ける", async () => {
  const seen: string[] = [];
  const r = await deliver([sub(1), sub(2), sub(3)], payload, async (s, p) => {
    seen.push(s.endpoint);
    assert.deepEqual(JSON.parse(p), payload);
    if (s.endpoint.endsWith("/2")) throw new Error("down");
  });
  assert.equal(r.sent, 2);
  assert.deepEqual(r.expired, []);
  assert.equal(seen.length, 3);
});

test("deliver: 許可外のendpointには送らず、失効として返す", async () => {
  const seen: string[] = [];
  const r = await deliver([sub(1), { ...sub(2), endpoint: "https://10.0.0.5/x" }], payload, async (s) => { seen.push(s.endpoint); });
  assert.equal(r.sent, 1);
  assert.deepEqual(r.expired, ["https://10.0.0.5/x"]);
  assert.equal(seen.length, 1);
});

test("VAPIDのsubject: httpsのAPP_URLならそれ、なければmailto", () => {
  assert.equal(vapidSubject("https://office.example.com"), "https://office.example.com");
  assert.equal(vapidSubject("http://localhost:3000"), "mailto:admin@example.com");
  assert.equal(vapidSubject(""), "mailto:admin@example.com");
  assert.equal(vapidSubject(undefined), "mailto:admin@example.com");
});
