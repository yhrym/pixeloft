import assert from "node:assert/strict";
import test from "node:test";
import type { RoomInfo } from "../../engine/map.js";
import { indexOf, type MapIndex } from "./map.ts";
import { hallRoom, relocateAfterPublish } from "./seat-loss.ts";

const room = (id: string, kind: RoomInfo["kind"], floor: string): RoomInfo => ({ id, name: id, kind, floor });
const seat = (id: string, r: string, floor: string) => ({ id, room: r, floor, type: "office", x: 0, y: 0, face: "SE" as const, item: id, no: 1 });
function idxOf(rooms: RoomInfo[], seats: ReturnType<typeof seat>[]): MapIndex {
  return { ...indexOf(null), rooms, seats, roomById: new Map(rooms.map((r) => [r.id, r])), seatById: new Map(seats.map((s) => [s.id, s])) };
}
const old = idxOf([room("w1", "work", "f1"), room("w2", "work", "f2"), room("h1", "hall", "f1"), room("h2", "hall", "f2")], [seat("d-1", "w2", "f2"), seat("e-1", "w1", "f1")]);

test("hallRoom: 同じ階の共用部 → どこかの共用部 → 最初の部屋 → null", () => {
  assert.equal(hallRoom(old, "f2"), "h2");
  assert.equal(hallRoom(old, "f9"), "h1");
  assert.equal(hallRoom(idxOf([room("m", "meeting", "f1"), room("w", "work", "f1")], []), "f1"), "m");
  assert.equal(hallRoom(idxOf([], [])), null);
});

test("席が消えた: 同じ階の共用部へ席なし", () => {
  const next = idxOf(old.rooms, [seat("e-1", "w1", "f1")]);
  assert.deepEqual(relocateAfterPublish(old, next, { room: "w2", seatId: "d-1" }), { room: "h2", seatId: null });
});

test("部屋ごと消えた: 古いマップの階の共用部。その階の共用部もなければ別の階の共用部", () => {
  const next = idxOf([room("w1", "work", "f1"), room("h1", "hall", "f1")], []);
  assert.deepEqual(relocateAfterPublish(old, next, { room: "w2", seatId: "d-1" }), { room: "h1", seatId: null });
});

test("席が別の部屋に移った・そのままの人・席なしで部屋が残る人は、席が移った分だけ動く", () => {
  const moved = idxOf(old.rooms, [seat("d-1", "w1", "f1"), seat("e-1", "w1", "f1")]);
  assert.deepEqual(relocateAfterPublish(old, moved, { room: "w2", seatId: "d-1" }), { room: "h2", seatId: null });
  assert.equal(relocateAfterPublish(old, old, { room: "w2", seatId: "d-1" }), null);
  assert.equal(relocateAfterPublish(old, old, { room: "h1", seatId: null }), null);
});

test("新しいマップに部屋がなければnull(動かす先がない)", () => {
  assert.equal(relocateAfterPublish(old, idxOf([], []), { room: "w1", seatId: "e-1" }), null);
});
