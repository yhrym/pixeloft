/** 公開で席・部屋が消えた人の行き先。DBを使わない */
import type { MapIndex } from "./map.ts";

/** 同じ階の共用部、なければどこかの共用部、なければ最初の部屋。部屋がなければnull */
export function hallRoom(idx: MapIndex, floor?: string): string | null {
  const halls = idx.rooms.filter((r) => r.kind === "hall");
  return (halls.find((r) => r.floor === floor) ?? halls[0] ?? idx.rooms[0])?.id ?? null;
}

/**
 * 新しいマップで、その人の部屋か席がなくなっていれば席なしの行き先を返す。そのままでよければnull。
 * 階は古いマップの部屋から取る(部屋ごと消えていれば階は分からず、どこかの共用部)
 */
export function relocateAfterPublish(
  oldIdx: MapIndex,
  newIdx: MapIndex,
  p: { room: string; seatId: string | null },
): { room: string; seatId: null } | null {
  const seat = p.seatId === null ? null : newIdx.seatById.get(p.seatId);
  if (newIdx.roomById.has(p.room) && (p.seatId === null || (seat && seat.room === p.room))) return null;
  const room = hallRoom(newIdx, oldIdx.roomById.get(p.room)?.floor);
  return room === null ? null : { room, seatId: null };
}
