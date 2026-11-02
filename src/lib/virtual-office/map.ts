/** 公開中のマップ(MapVersionの最新の行)から作る部屋・席の一覧。移植元のVO_ROOMS・VO_SEATSの代わり */
import { prisma } from "../db.ts";
import { roomsOf, seatsOf } from "../../engine/map.js";
import type { OfficeMap, RoomInfo, SeatInfo } from "../../engine/map.js";

export type MapIndex = {
  /** 公開されたマップがなければnull(部屋も席も空) */
  map: OfficeMap | null;
  rooms: RoomInfo[];
  seats: SeatInfo[];
  seatById: Map<string, SeatInfo>;
  roomById: Map<string, RoomInfo>;
};

export function indexOf(map: OfficeMap | null): MapIndex {
  const rooms = map ? roomsOf(map) : [];
  const seats = map ? seatsOf(map) : [];
  return { map, rooms, seats, seatById: new Map(seats.map((s) => [s.id, s])), roomById: new Map(rooms.map((r) => [r.id, r])) };
}

const REVALIDATE_MS = 5000;
// routeごとに別のバンドルになっても同じ物を見るためglobalThisに置く
const g = globalThis as unknown as { voMapIndex?: { id: number; at: number; index: MapIndex } | null };

/**
 * shortcut: マップのJSONは公開時にエディタが検証した物として信じる(ここでは検証しない)。
 * プロセス内に持ち、5秒に1回だけ最新のidを見に行く。公開した直後はinvalidateMapIndex()で捨てる(別プロセスなら最大5秒遅れる)
 */
export async function getMapIndex(): Promise<MapIndex> {
  const now = Date.now();
  const hit = g.voMapIndex;
  if (hit && now - hit.at < REVALIDATE_MS) return hit.index;
  const latest = await prisma.mapVersion.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const id = latest?.id ?? 0;
  if (hit && hit.id === id) {
    hit.at = now;
    return hit.index;
  }
  const row = latest ? await prisma.mapVersion.findUnique({ where: { id }, select: { json: true } }) : null;
  const index = indexOf(row ? (row.json as unknown as OfficeMap) : null);
  g.voMapIndex = { id, at: now, index };
  return index;
}

/** エディタが公開したとき */
export function invalidateMapIndex(): void {
  g.voMapIndex = null;
}
