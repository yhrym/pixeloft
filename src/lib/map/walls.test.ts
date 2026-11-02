import assert from "node:assert/strict";
import test from "node:test";
import type { MapFloor } from "../../engine/map.js";
import { borderWalls, outerWalls } from "./walls.ts";

const floor = (over: Partial<MapFloor> = {}): MapFloor => ({
  id: "f1", name: "1F", walls: [], doors: [], items: [],
  rooms: [
    { id: "a", name: "A", kind: "hall", rects: [[0, 0, 64, 96]] },
    { id: "b", name: "B", kind: "work", rects: [[64, 0, 192, 96]] },
  ],
  ...over,
});
const key = (w: { axis: string; at: number; a: number; b: number; kind: string }) => `${w.axis}${w.at}:${w.a}-${w.b}:${w.kind}`;

test("外壁は輪郭をなぞり、同じ種類の続きは1本にまとまる", () => {
  const w = outerWalls(floor()).map(key).sort();
  assert.deepEqual(w, ["x0:0-192:window", "x96:0-192:window", "y0:0-96:window", "y192:0-96:window"]);
});

test("屋外の部屋の縁はrail", () => {
  const f = floor();
  f.rooms[1].outdoor = true;
  const w = outerWalls(f).map(key).sort();
  assert.deepEqual(w, ["x0:0-64:window", "x0:64-192:rail", "x96:0-64:window", "x96:64-192:rail", "y0:0-96:window", "y192:0-96:rail"]);
});

test("外壁は置き換え。2回引いても同じ・内側の壁は残る", () => {
  const f = floor({ walls: [{ axis: "x", at: 0, a: 0, b: 64, kind: "glass" }, { axis: "y", at: 64, a: 0, b: 96, kind: "panel" }] });
  const once = outerWalls(f);
  assert.deepEqual(once.map(key).sort(), ["x0:0-192:window", "x96:0-192:window", "y0:0-96:window", "y192:0-96:window", "y64:0-96:panel"]);
  assert.deepEqual(outerWalls({ ...f, walls: once }).map(key).sort(), once.map(key).sort());
});

test("L字の部屋は凹みの縁も外壁になる", () => {
  const f = floor({ rooms: [{ id: "a", name: "A", kind: "work", rects: [[0, 0, 64, 64], [0, 64, 32, 96]] }] });
  assert.deepEqual(outerWalls(f).map(key).sort(), ["x0:0-64:window", "x64:32-64:window", "x96:0-32:window", "y0:0-96:window", "y32:64-96:window", "y64:0-64:window"]);
  assert.equal(outerWalls(f).length, 6);
});

test("境目の壁は違う部屋が接する所だけ。既存の壁は飛ばす", () => {
  assert.deepEqual(borderWalls(floor()).map(key), ["y64:0-96:glass"]);
  const f = floor({ walls: [{ axis: "y", at: 64, a: 32, b: 64, kind: "panel" }] });
  assert.deepEqual(borderWalls(f).map(key).sort(), ["y64:0-32:glass", "y64:32-64:panel", "y64:64-96:glass"]);
  assert.deepEqual(borderWalls(floor(), "slat").map(key), ["y64:0-96:slat"]);
});

test("同じ部屋の矩形どうしの境目には引かない", () => {
  const f = floor({ rooms: [{ id: "a", name: "A", kind: "work", rects: [[0, 0, 64, 96], [64, 0, 128, 96]] }] });
  assert.deepEqual(borderWalls(f), []);
});
