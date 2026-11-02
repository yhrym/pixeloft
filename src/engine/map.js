// マップのJSONから部屋・席の一覧を作る。DOMを使わない（サーバーからも読む）。型はmap.d.ts
import { CATALOG } from "./catalog.js";

export function roomsOf(map) {
  return map.floors.flatMap(f => f.rooms.map(r => ({ id: r.id, name: r.name, kind: r.kind, floor: f.id })));
}

// 席は置き物のカタログから出す。idは`${置き物のid}-${番号}`(番号はカタログの並び。部屋の外で落ちた席の番号は詰めない)
export function seatsOf(map) {
  const out = [];
  for (const f of map.floors) for (const it of f.items) {
    const c = CATALOG[it.type];
    if (!c || !c.seats) continue;
    const props = { ...c.props, ...it.props };
    c.seats(it.dir, props).forEach(({ dx, dy, ...rest }, i) => {
      const x = it.x + dx, y = it.y + dy;
      const room = f.rooms.find(r => r.rects.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1));
      if (room) out.push({ ...rest, id: `${it.id}-${i + 1}`, item: it.id, no: i + 1, room: room.id, floor: f.id, x, y });
    });
  }
  return out;
}
