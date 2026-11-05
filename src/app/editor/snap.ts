// shared.tsは@エイリアスを読むのでnode:testから読めない。純関数だけここに置く
/** footprintをg刻みの外側のマス目に広げる。幅0でマス目の線上にあるときは、線の右・下のマスを1つ取る */
export function snapOut([x1, y1, x2, y2]: [number, number, number, number], g: number): [number, number, number, number] {
  const a = Math.floor(x1 / g) * g, b = Math.floor(y1 / g) * g;
  return [a, b, Math.max(Math.ceil(x2 / g) * g, a + g), Math.max(Math.ceil(y2 / g) * g, b + g)];
}
