/** 部屋の矩形から壁を作る純関数。エディタの「外壁を自動で引く」「部屋の境目に壁を引く」が使う */
import type { MapFloor, MapWall } from "../../engine/map.js";

type Seg = { axis: "x" | "y"; at: number; a: number; b: number; kind: string };

/** 矩形の座標で格子を切り、各マスがどの部屋かを調べて、隣り合うマスの境目を列挙する(座標が16の倍数でなくてもよい)。
 *  shortcut: 重なった矩形は先の部屋が勝つ。部屋が数百を超える地図では遅くなる */
function edges(f: MapFloor, pick: (a: number, b: number) => string | null): Seg[] {
  const xs = [...new Set(f.rooms.flatMap((r) => r.rects.flatMap((q) => [q[0], q[2]])))].sort((p, q) => p - q);
  const ys = [...new Set(f.rooms.flatMap((r) => r.rects.flatMap((q) => [q[1], q[3]])))].sort((p, q) => p - q);
  const own = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return -1;
    return f.rooms.findIndex((r) => r.rects.some((q) => q[0] <= xs[i] && xs[i + 1] <= q[2] && q[1] <= ys[j] && ys[j + 1] <= q[3]));
  };
  const out: Seg[] = [];
  for (let i = 0; i <= xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const kind = pick(own(i - 1, j), own(i, j));
    if (kind) out.push({ axis: "y", at: xs[i], a: ys[j], b: ys[j + 1], kind });
  }
  for (let j = 0; j <= ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const kind = pick(own(i, j - 1), own(i, j));
    if (kind) out.push({ axis: "x", at: ys[j], a: xs[i], b: xs[i + 1], kind });
  }
  return out;
}

/** 同じ軸・位置・種類でつながる線分を1本にまとめる */
function merge(segs: Seg[]): Seg[] {
  const s = [...segs].sort((p, q) => (p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : p.at - q.at || (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0) || p.a - q.a));
  const out: Seg[] = [];
  for (const g of s) {
    const l = out[out.length - 1];
    if (l && l.axis === g.axis && l.at === g.at && l.kind === g.kind && l.b === g.a) l.b = g.b;
    else out.push({ ...g });
  }
  return out;
}

const covered = (spans: { axis: string; at: number; a: number; b: number }[], s: { axis: string; at: number; a: number; b: number }) =>
  spans.some((w) => w.axis === s.axis && w.at === s.at && w.a <= s.a && s.b <= w.b);

/**
 * 階の輪郭(部屋の外側の縁)に外壁を引いた、壁の一覧を返す。屋内の縁は`window`、屋外の部屋の縁は`rail`。
 * 輪郭の上にある既存の壁(種類を問わず)は置き換える。内側の壁と扉には触らない
 */
export function outerWalls(f: MapFloor): MapWall[] {
  const outdoor = (i: number) => !!f.rooms[i]?.outdoor;
  const fresh = merge(edges(f, (p: number, q: number) => (p === -1 && q !== -1 ? (outdoor(q) ? "rail" : "window") : q === -1 && p !== -1 ? (outdoor(p) ? "rail" : "window") : null)));
  const spans = merge(fresh.map((s) => ({ ...s, kind: "" })));
  // shortcut: 壁が輪郭の線分1本に収まるときだけ「外壁」とみなす(輪郭をまたぐ長い壁は残る)
  const kept = f.walls.filter((w) => !covered(spans, w));
  return [...kept, ...fresh.map(({ axis, at, a, b, kind }) => ({ axis, at, a, b, kind }))];
}

/** 違う部屋どうしが接する縁に、種類`kind`の壁を足した一覧を返す。壁がすでにある所(種類を問わず)は飛ばす */
export function borderWalls(f: MapFloor, kind = "glass"): MapWall[] {
  const fresh = merge(edges(f, (p: number, q: number) => (p !== -1 && q !== -1 && p !== q ? kind : null)));
  // 既存の壁と部分的に重なる縁は、重ならない部分だけ足す
  const add: Seg[] = [];
  for (const s of fresh) {
    let cuts = [[s.a, s.b]];
    for (const w of f.walls) {
      if (w.axis !== s.axis || w.at !== s.at) continue;
      cuts = cuts.flatMap(([a, b]) => (w.b <= a || b <= w.a ? [[a, b]] : [[a, Math.min(b, w.a)], [Math.max(a, w.b), b]].filter(([x, y]) => x < y)));
    }
    for (const [a, b] of cuts) add.push({ ...s, a, b });
  }
  return [...f.walls, ...add.map(({ axis, at, a, b, kind: k }) => ({ axis, at, a, b, kind: k }))];
}
