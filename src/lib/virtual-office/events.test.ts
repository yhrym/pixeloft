import assert from "node:assert/strict";
import test from "node:test";

import { activeEvent, eventOn, isEventMode, VO_EVENT_DECORS } from "./events.ts";

test("日付からイベント: 期間の境目の日は両端とも入る", () => {
  assert.equal(eventOn("2026-10-14"), null);
  assert.equal(eventOn("2026-10-15"), "halloween");
  assert.equal(eventOn("2026-10-31"), "halloween");
  assert.equal(eventOn("2026-11-01"), "autumn");
  assert.equal(eventOn("2026-12-25"), "xmas");
  assert.equal(eventOn("2026-12-26"), null);
});

test("日付からイベント: 年をまたぐ期間(お正月 12-29〜01-07)", () => {
  assert.equal(eventOn("2026-12-28"), null);
  assert.equal(eventOn("2026-12-29"), "newyear");
  assert.equal(eventOn("2026-12-31"), "newyear");
  assert.equal(eventOn("2027-01-01"), "newyear");
  assert.equal(eventOn("2027-01-07"), "newyear");
  assert.equal(eventOn("2027-01-08"), null);
});

test("日付からイベント: 重なったら一覧の上のほう", () => {
  const decors = [
    { id: "a", from: "12-20", to: "01-05" },
    { id: "b", from: "12-01", to: "12-25" },
  ];
  assert.equal(eventOn("2026-12-22", decors), "a");
  assert.equal(eventOn("2026-12-10", decors), "b");
  assert.equal(eventOn("2027-01-03", decors), "a");
  assert.equal(eventOn("2026-12-22", [...decors].reverse()), "b");
});

test("modeの検証と、modeから今出すイベント", () => {
  assert.ok(isEventMode("auto") && isEventMode("none") && isEventMode("xmas"));
  for (const v of ["", "AUTO", "christmas", 1, null, undefined]) assert.equal(isEventMode(v), false);
  assert.equal(activeEvent("auto", "2026-10-25"), "halloween");
  assert.equal(activeEvent("none", "2026-10-25"), null);
  assert.equal(activeEvent("sakura", "2026-10-25"), "sakura");
  assert.equal(activeEvent("christmas", "2026-10-25"), null);
  // 一覧のidはかぶっていない
  assert.equal(new Set(VO_EVENT_DECORS.map((e) => e.id)).size, VO_EVENT_DECORS.length);
});
