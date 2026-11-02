import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, hourOf, zonedInstant } from "./time.ts";

test("日付はゾーンごとに切り替わる(UTC 15:00 = 東京は翌日0時)", () => {
  const d = new Date("2026-03-10T15:00:00Z");
  assert.equal(dateKey(d, "Asia/Tokyo"), "2026-03-11");
  assert.equal(dateKey(d, "UTC"), "2026-03-10");
  assert.equal(dateKey(d, "Pacific/Auckland"), "2026-03-11");
  assert.equal(hourOf(d, "Asia/Tokyo"), 0);
  assert.equal(dateKey(new Date("2026-03-10T14:59:59Z"), "Asia/Tokyo"), "2026-03-10");
});

test("ニューヨークの夏時間: 切り替えの前後で差が変わる", () => {
  // 2026-03-08 02:00 に夏時間へ。UTC 06:59 はまだ冬時間(01:59)、07:00 は夏時間(03:00)
  assert.equal(hourOf(new Date("2026-03-08T06:59:00Z"), "America/New_York"), 1);
  assert.equal(hourOf(new Date("2026-03-08T07:00:00Z"), "America/New_York"), 3);
  // 日付の切り替え: 冬は UTC 05:00、夏は UTC 04:00
  assert.equal(dateKey(new Date("2026-01-15T04:59:00Z"), "America/New_York"), "2026-01-14");
  assert.equal(dateKey(new Date("2026-01-15T05:00:00Z"), "America/New_York"), "2026-01-15");
  assert.equal(dateKey(new Date("2026-07-15T03:59:00Z"), "America/New_York"), "2026-07-14");
  assert.equal(dateKey(new Date("2026-07-15T04:00:00Z"), "America/New_York"), "2026-07-15");
});

test("zonedInstant: 終業時刻の瞬間", () => {
  assert.equal(zonedInstant("2026-01-15", 18, "Asia/Tokyo").toISOString(), "2026-01-15T09:00:00.000Z");
  assert.equal(zonedInstant("2026-01-15", 18, "America/New_York").toISOString(), "2026-01-15T23:00:00.000Z");
  assert.equal(zonedInstant("2026-07-15", 18, "America/New_York").toISOString(), "2026-07-15T22:00:00.000Z");
  // 切り替えの日(3/8)の18時は夏時間
  assert.equal(zonedInstant("2026-03-08", 18, "America/New_York").toISOString(), "2026-03-08T22:00:00.000Z");
  // 存在しない時刻(2:30は無い日の2時)は直後に進む
  assert.equal(hourOf(zonedInstant("2026-03-08", 2, "America/New_York"), "America/New_York"), 3);
});
