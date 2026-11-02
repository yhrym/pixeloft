import assert from "node:assert/strict";
import { test } from "node:test";
import { roomsOf, seatsOf } from "./map.js";
import { DEFAULT_FLOOR, DOOR_KINDS, FLOOR_KINDS, WALL_KINDS } from "./catalog.js";
import type { OfficeMap } from "./map.js";

// 架空の小さいマップ: 2部屋(左右に並ぶ)。右の部屋の外に1席はみ出す置き物がある
const map: OfficeMap = {
  version: 1,
  name: "test",
  backdrop: "city",
  floors: [{
    id: "f1",
    name: "1F",
    rooms: [
      { id: "ra", name: "A", kind: "work", rects: [[0, 0, 100, 100]] },
      { id: "rb", name: "B", kind: "free", rects: [[100, 0, 200, 50], [100, 50, 150, 100]] },
    ],
    walls: [],
    doors: [],
    items: [
      { id: "isl", type: "desk-island", x: 50, y: 50, dir: "x+", props: { perSide: 2 } },
      { id: "d1", type: "desk", x: 150, y: 20, dir: "y+", props: { label: "L1" } },
      { id: "d2", type: "desk", x: 150, y: 20, dir: "x+" },
      { id: "d3", type: "desk", x: 150, y: 20, dir: "x-" },
      { id: "out", type: "stand-spot", x: 300, y: 300, dir: "x+" },
      { id: "p1", type: "plant-big", x: 10, y: 10, dir: "x+" },
    ],
  }, {
    id: "f2",
    name: "2F",
    rooms: [{ id: "rc", name: "C", kind: "hall", rects: [[0, 0, 100, 100]] }],
    walls: [],
    doors: [],
    items: [{ id: "isl", type: "desk-island", x: 50, y: 50, dir: "y+", props: { perSide: 1 } }],
  }],
};

const seats = seatsOf(map);
const byId = (id: string) => seats.find(s => s.id === id);

test("席のidは置き物のid-番号で、席のない置き物は出ない", () => {
  assert.deepEqual(seats.filter(s => s.floor === "f1" && s.item === "isl").map(s => s.id), ["isl-1", "isl-2", "isl-3", "isl-4"]);
  assert.equal(seats.some(s => s.item === "p1"), false);
});

test("島の席は向きで並びが変わる(x+はXに並び、y+はYに並ぶ)", () => {
  assert.deepEqual([byId("isl-1")!.x, byId("isl-1")!.y, byId("isl-1")!.face], [38, 22, "SW"]);
  assert.deepEqual([byId("isl-4")!.x, byId("isl-4")!.y, byId("isl-4")!.face], [62, 78, "NE"]);
  const f2 = seats.filter(s => s.floor === "f2");
  assert.deepEqual(f2.map(s => [s.id, s.x, s.y, s.face]), [["isl-1", 22, 50, "SE"], ["isl-2", 78, 50, "NW"]]);
});

test("机の席は向きを向いて座り、ラベルはprops.labelから来る", () => {
  assert.deepEqual([byId("d1-1")!.face, byId("d2-1")!.face, byId("d3-1")!.face], ["SW", "SE", "NW"]);
  assert.equal(byId("d1-1")!.label, "L1");
  assert.equal(byId("d2-1")!.label, undefined);
});

test("席の部屋は席の位置を含む同じ階の部屋(複数rectの部屋も可)", () => {
  assert.equal(byId("isl-1")!.room, "ra");
  assert.equal(byId("d1-1")!.room, "rb");
  assert.equal(seats.find(s => s.floor === "f2")!.room, "rc");
});

test("どの部屋にも入らない席は出ない", () => {
  assert.equal(byId("out-1"), undefined);
});

test("roomsOfは階のidを付けて全部屋を返す", () => {
  assert.deepEqual(roomsOf(map).map(r => `${r.floor}:${r.id}`), ["f1:ra", "f1:rb", "f2:rc"]);
});

test("階はfloorsの並びで、最下階が先頭(席の並びも階の下から)", () => {
  assert.deepEqual([...new Set(seats.map((s) => s.floor))], ["f1", "f2"]);
});

test("部屋の既定の床と、壁・扉の種類の一覧", () => {
  for (const k of Object.values(DEFAULT_FLOOR)) assert.ok(FLOOR_KINDS.includes(k), k);
  assert.ok(FLOOR_KINDS.includes("deck"));
  for (const k of ["window", "outer", "rail"]) assert.ok(WALL_KINDS.includes(k), k);
  assert.equal(DOOR_KINDS.includes("ev"), false);
});

test("階が空のマップは部屋も席も空", () => {
  const empty: OfficeMap = { version: 1, name: "", backdrop: "city", floors: [] };
  assert.deepEqual([roomsOf(empty), seatsOf(empty)], [[], []]);
});
