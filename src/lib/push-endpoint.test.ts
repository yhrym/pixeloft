import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedPushEndpoint as ok } from "./push-endpoint.ts";

test("既知のプッシュサービスは通る", () => {
  for (const u of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
    "https://FCM.googleapis.com:443/x",
  ]) assert.equal(ok(u), true, u);
});

test("すり抜けは通らない", () => {
  for (const u of [
    "https://fcm.googleapis.com.evil.com/x",
    "https://evil.com/fcm.googleapis.com",
    "https://user@fcm.googleapis.com/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://evilapple.com/x",
    "https://push.apple.com.evil.com/x",
    "https://notify.windows.com/x",
    "https://evil.com#.push.apple.com",
    "http://fcm.googleapis.com/x",
    "https://10.0.0.5/x",
    "https://[::1]/x",
    "https://127.0.0.1/x",
    "https://other.googleapis.com/x",
    "not a url",
    "",
  ]) assert.equal(ok(u), false, u);
});
