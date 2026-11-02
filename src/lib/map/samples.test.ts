import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMap } from "./validate.ts";
import { seatsOf } from "../../engine/map.js";
import type { OfficeMap } from "../../engine/map.js";

for (const l of ["ja", "en"]) {
  test(`sample.${l}.json is valid and has seats`, () => {
    const map = JSON.parse(readFileSync(new URL(`../../../maps/sample.${l}.json`, import.meta.url), "utf8")) as OfficeMap;
    assert.deepEqual(validateMap(map), []);
    assert.ok(seatsOf(map).length > 30);
  });
}
