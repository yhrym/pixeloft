import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettingsForm, settingsFrom } from "./settings.ts";

const form = (o: Record<string, string>) => (name: string) => o[name] ?? null;
const ok = { timeZone: "Asia/Tokyo", workEndHour: "18", lat: "", lon: "", seasonMode: "auto" };
const rooms = ["r1", "r2"];

test("正しい入力は通り、天気は空ならnull・URLは空の部屋を除く", () => {
  const r = parseSettingsForm(form({ ...ok, "call.r1": " https://example.com/room " }), rooms);
  assert.deepEqual(r, { ok: true, value: { timeZone: "Asia/Tokyo", workEndHour: 18, weather: null, callUrls: { r1: "https://example.com/room" }, seasonMode: "auto" } });
  const w = parseSettingsForm(form({ ...ok, timeZone: "America/New_York", workEndHour: "0", lat: "-33.5", lon: "151", seasonMode: "xmas" }), rooms);
  assert.deepEqual(w.ok && w.value.weather, { lat: -33.5, lon: 151 });
});

test("タイムゾーン・終業時刻・天気・URL・季節の不正は理由つきで弾く", () => {
  const err = (o: Record<string, string>) => {
    const r = parseSettingsForm(form({ ...ok, ...o }), rooms);
    return r.ok ? null : r.error;
  };
  assert.equal(err({ timeZone: "Mars/Base" }), "timeZone");
  assert.equal(err({ timeZone: "" }), "timeZone");
  assert.equal(err({ workEndHour: "24" }), "workEndHour");
  assert.equal(err({ workEndHour: "-1" }), "workEndHour");
  assert.equal(err({ workEndHour: "18.5" }), "workEndHour");
  assert.equal(err({ workEndHour: "" }), "workEndHour");
  assert.equal(err({ lat: "91", lon: "0" }), "weather");
  assert.equal(err({ lat: "0", lon: "181" }), "weather");
  assert.equal(err({ lat: "10", lon: "" }), "weather");
  assert.equal(err({ lat: "abc", lon: "1" }), "weather");
  assert.equal(err({ "call.r1": "javascript:alert(1)" }), "callUrl");
  assert.equal(err({ "call.r2": "ftp://example.com" }), "callUrl");
  assert.equal(err({ "call.r1": "not a url" }), "callUrl");
  assert.equal(err({ seasonMode: "christmas" }), "season");
  assert.equal(err({ seasonMode: "" }), "season");
});

test("マップにない部屋のURLは無視する", () => {
  const r = parseSettingsForm(form({ ...ok, "call.zzz": "https://example.com" }), rooms);
  assert.ok(r.ok && Object.keys(r.value.callUrls).length === 0);
});

test("DBの値の読み出し: 壊れた値は既定、TZは環境変数のあとAsia/Tokyo", () => {
  assert.equal(settingsFrom({}, {}).timeZone, "Asia/Tokyo");
  assert.equal(settingsFrom({}, { TZ: "Europe/Paris" }).timeZone, "Europe/Paris");
  assert.equal(settingsFrom({ timeZone: "Europe/London" }, { TZ: "Europe/Paris" }).timeZone, "Europe/London");
  assert.equal(settingsFrom({}, { TZ: "junk" }).timeZone, "Asia/Tokyo");
  const s = settingsFrom({ workEndHour: 99, weather: { lat: 1000, lon: 0 }, callUrls: { a: "https://x.example", b: "javascript:1" }, seasonMode: "nope" }, {});
  assert.deepEqual(s, { timeZone: "Asia/Tokyo", workEndHour: 18, weather: null, callUrls: { a: "https://x.example" }, seasonMode: "auto" });
});
