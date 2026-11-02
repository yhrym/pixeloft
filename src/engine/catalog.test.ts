import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "./catalog.js";

const CATS = ["desk", "meeting", "lounge", "storage", "decor", "facility", "season"];

test("カタログの全エントリにカテゴリ(cat)がある。季節の飾りはseason、それ以外はseasonでない", () => {
  for (const [id, d] of Object.entries(CATALOG) as [string, { cat?: string; events?: string[] }][]) {
    assert.ok(d.cat && CATS.includes(d.cat), `${id}: cat=${d.cat}`);
    assert.equal(d.cat === "season", !!d.events, `${id}: seasonとeventsが対応していない`);
  }
});
