// 置き物のカタログ(寸法・当たり・席・props)。DOMもエンジンの中身も使わない(サーバーが席の一覧を作るのでNodeから読める)。
// 絵はoffice.jsの描画表(カタログidをキーにした (X, Y, dir, props, it, part) => …)。
// 座標は置き物の原点(it.x, it.y)からの差。boxes: 並べ替えと歩けない範囲に使う箱 { b: [x0,y0,z0,x1,y1,z1], block, draw }(block既定true・draw既定true)。
// seats: 席。dx,dyは原点からの差、faceは座った人の向き(画面上のNE/NW/SE/SW)。ほかの項目(chair・sz・colなど)はエンジンがそのまま使う。
// dirs: 絵と箱が対応している向き。ここに無い向きは使えない。

// プラグインの置き物(scripts/plugins.mjsが作る。キーは<id>:<名前>)。DEFSのあとに混ぜて同じderiveを通す
import PLUGIN_DEFS from "../plugins/generated/catalog.js";

// 向き → その向きを見ている人の画面上の向き
export const FACE = { "x+": "SE", "y+": "SW", "x-": "NW", "y-": "NE" };
const ROT = ["x+", "y+", "x-", "y-"];
const ALL = ROT;
// x+を基準に、dirへ90度ずつ回す(x→y)
const turn = (dir, x, y) => { for (let i = ROT.indexOf(dir); i > 0; i--) [x, y] = [-y, x]; return [x, y]; };
const turnBox = (dir, [x0, y0, x1, y1], z1) => {
  const a = turn(dir, x0, y0), b = turn(dir, x1, y1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), 0, Math.max(a[0], b[0]), Math.max(a[1], b[1]), z1];
};
const seat = (dir, dx, dy, type, extra) => ({ dx, dy, face: FACE[dir], type, ...extra });
// 原点が足もとの範囲の小さい角で、x+/y+で幅と奥行きが入れ替わる箱
const foot = (dir, w, d, h) => (dir[0] === "y" ? [0, 0, 0, w, d, h] : [0, 0, 0, d, w, h]);
const one = b => [{ b }];
const mid = (w, d, h) => one([-w, -d, 0, w, d, h]); // 原点が真ん中

// 絵の向き(art)と派生: artに無い向きは、x↔yを入れ替えた転置(画面では左右の鏡像)か、sym=trueなら足もとの真ん中まわりの180度回転(両面が同じ絵)で作る。
// 箱と席はこの規則でdirsぶん自動で作る(下のderive)。絵はoffice.jsが同じplanOfで、転置は座標を入れ替えて描く
const TPOSE = { "x+": "y+", "y+": "x+", "x-": "y-", "y-": "x-" }, FLIP = { "x+": "x-", "x-": "x+", "y+": "y-", "y-": "y+" };
const MIRF = { SE: "SW", SW: "SE", NE: "NW", NW: "NE" }, OPP = { SE: "NW", NW: "SE", NE: "SW", SW: "NE" };
// 向きdir → [絵のある向き, 転置か, 180度回転か]。作れなければnull
export const planOf = (art, sym, dir) => {
  if (art.includes(dir)) return [dir, 0, 0];
  if (art.includes(TPOSE[dir])) return [TPOSE[dir], 1, 0];
  if (sym) { const f = FLIP[dir]; if (art.includes(f)) return [f, 0, 1]; if (art.includes(TPOSE[f])) return [TPOSE[f], 1, 1]; }
  return null;
};
const trB = ({ b, ...o }) => ({ ...o, b: [b[1], b[0], b[2], b[4], b[3], b[5]] });
const centerOf = bs => bs.length ? [(Math.min(...bs.map(o => o.b[0])) + Math.max(...bs.map(o => o.b[3]))) / 2, (Math.min(...bs.map(o => o.b[1])) + Math.max(...bs.map(o => o.b[4]))) / 2] : [0, 0];
function derive(def) {
  const { art, sym } = def, plan = d => planOf(art, sym, d);
  // 箱を向きに合わせて作る。rotのとき、箱の並びを逆にして、絵のpart番号(奥から)と箱を合わせる
  const bx = (d, p) => { const [n, tr, rot] = plan(d); let bs = def.boxes ? def.boxes(n, p) : []; if (tr) bs = bs.map(trB); if (rot) { const [cx, cy] = centerOf(bs); bs = bs.map(({ b, ...o }) => ({ ...o, b: [2 * cx - b[3], 2 * cy - b[4], b[2], 2 * cx - b[0], 2 * cy - b[1], b[5]] })).reverse(); } return bs; };
  const out = { ...def, dirs: [...art, ...ALL.filter(d => !art.includes(d) && plan(d))] };
  if (def.boxes) out.boxes = bx;
  if (def.seats) out.seats = (d, p) => { const [n, tr, rot] = plan(d); let ss = def.seats(n, p); if (tr) ss = ss.map(s => ({ ...s, dx: s.dy, dy: s.dx, face: MIRF[s.face] })); if (rot) { const [cx, cy] = centerOf((def.boxes ? def.boxes(n, p) : []).map(o => (tr ? trB(o) : o))); ss = ss.map(s => ({ ...s, dx: 2 * cx - s.dx, dy: 2 * cy - s.dy, face: OPP[s.face] })); } return ss; };
  return out;
}

// プラグインのboxes・seatsが投げても、席の一覧とエンジンを巻き込まない(空にして種類ごとに1回だけ出す)。公開時のチェックだけ、on=trueで投げさせてプラグイン名つきのエラーにする
export const PLUGIN_STRICT = { on: false };
const warned = new Set();
export const guarded = (key, f) => f && ((...a) => {
  try { return f(...a); } catch (e) {
    if (PLUGIN_STRICT.on) throw e;
    if (!warned.has(key)) { warned.add(key); console.error(`plugin ${key}: boxes/seats:`, e); }
    return [];
  }
});
const safeDef = (key, d) => ({ ...d, ...(d.boxes && { boxes: guarded(key, d.boxes) }), ...(d.seats && { seats: guarded(key, d.seats) }) });

const DEFS = {
  // 島の机。x+は机がXに並び、y+はXとYを入れ替えた形(回転ではなく転置。番号はカメラ側から数える)。原点は島の真ん中。props.chairs: 席番号→椅子の色、props.fan: 卓上扇風機を置く席番号
  "desk-island": { cat: "desk",
    dirs: ["x+", "y+"], art: ["x+", "y+"], sym: true,
    props: { perSide: 2, chairs: {}, fan: 0 },
    boxes: (dir, p) => { const h = p.perSide * 12; return dir === "x+" ? [{ b: [-h, -18, 0, h, 0, 24] }, { b: [-h, 0, 0, h, 18, 24] }] : [{ b: [-18, -h, 0, 0, h, 24] }, { b: [0, -h, 0, 18, h, 24] }]; },
    seats: (dir, p) => {
      const n = p.perSide, out = [];
      for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) {
        const no = s * n + i + 1, u = -n * 12 + i * 24 + 12, w = s ? 28 : -28;
        out.push(dir === "x+" ? { dx: u, dy: w, face: s ? "NE" : "SW" } : { dx: w, dy: u, face: s ? "NW" : "SE" });
        Object.assign(out[no - 1], { type: "office", chair: p.chairs[no], fan: p.fan === no });
      }
      return out;
    },
  },
  // 1席ぶんの白い机。原点は椅子の位置。机は座った人の前(dirの向き)
  desk: { cat: "desk",
    dirs: ["x+", "y+", "x-"], art: ["x+", "y+", "x-"],
    props: { label: "" },
    boxes: dir => one(turnBox(dir, [10, -24, 28, 24], 24)),
    seats: (dir, p) => [seat(dir, 0, 0, "desk", { chair: "hb", sign: p.label || undefined, label: p.label || undefined })],
  },
  "large-desk": { cat: "desk",
    dirs: ALL,
    props: { label: "" },
    boxes: dir => one(turnBox(dir, [10, -26, 28, 26], 26)),
    seats: (dir, p) => [seat(dir, 0, 0, "desk", { chair: "black", sign: p.label || undefined, label: p.label || undefined })],
  },
  // 窓ぎわで仕切りに挟まれる木の机。原点は椅子の位置。props.mirror: 仕切りの側(true=+Y側)の向きに反転
  "wood-desk": { cat: "desk",
    dirs: ["x-"],
    props: { label: "", mirror: false },
    boxes: (dir, p) => one(p.mirror ? [-33, -23, 0, -13, 25, 26] : [-33, -25, 0, -13, 23, 26]),
    seats: (dir, p) => [seat(dir, 0, 0, "armchair", { sign: p.label || undefined, label: p.label || undefined })],
  },
  // 向かい合う2人がけのソファ。y+は奥(背もたれが-Y側)、y-は手前。原点は座面の角
  sofa: { cat: "lounge",
    dirs: ["y+", "y-"], art: ["y+", "y-"],
    props: {},
    boxes: dir => [{ b: dir === "y+" ? [-3, -4, 0, 51, 21, 22] : [-3, -1, 0, 51, 24, 22], block: false }],
    seats: dir => [seat(dir, 12, 10, "sofa"), seat(dir, 36, 10, "sofa")],
  },
  // ガラス天板のローテーブル。props.seats: 画面を出す席のid([奥の左, 奥の右, 手前の左, 手前の右])
  "coffee-table": { cat: "lounge", dirs: ["x+"], art: ["x+"], sym: true, props: { seats: [] }, boxes: () => one([0, 0, 0, 36, 16, 12]) },
  // エレベーター。扉が+Y側。entrance: 入室した人が現れる所(in)と、扉の前のマス(out)
  elevator: { cat: "facility", dirs: ["y+"], props: { entrance: false }, boxes: () => [{ b: [0, 0, 0, 64, 72, 30], block: false }], entrance: { in: [32, 64], out: [32, 76] } },
  // 小さいエレベーター。幅・奥行き・扉の開口がelevatorより小さい(絵はoffice.jsのdrawElevatorShaftに同じ値を渡す)
  "elevator-medium": { cat: "facility", dirs: ["y+"], props: { entrance: false }, boxes: () => [{ b: [0, 0, 0, 48, 56, 30], block: false }], entrance: { in: [24, 48], out: [24, 60] } },
  "elevator-small": { cat: "facility", dirs: ["y+"], props: { entrance: false }, boxes: () => [{ b: [0, 0, 0, 40, 48, 30], block: false }], entrance: { in: [20, 40], out: [20, 52] } },
  // 階段(入口になれる)。扉(開口)が+Y側。中の人は見えない。entrance: elevatorと同じ
  stairs: { cat: "facility", dirs: ["y+"], props: { entrance: false }, boxes: () => [{ b: [0, 0, 0, 48, 56, 30], block: false }], entrance: { in: [24, 48], out: [24, 62] } },
  // 玄関の戸(枠と足もとのマット。入口になれる)。戸の口が+Y側
  "entrance-door": { cat: "facility", dirs: ["y+"], props: { entrance: false }, boxes: () => [{ b: [0, 0, 0, 40, 18, 30], block: false }], entrance: { in: [20, 4], out: [20, 26] } },
  kitchenette: { cat: "lounge", dirs: ["y+"], props: {}, boxes: () => one([0, 0, 0, 56, 10, 24]) },
  restroom: { cat: "facility", dirs: ["y+"], props: {}, boxes: () => one([0, 0, 0, 42, 13, 18]) },
  "hall-table": { cat: "lounge", dirs: ["y+"], props: {}, boxes: () => one([0, 0, 0, 10, 10, 20]) },
  // 8人がけの丸端のテーブルと立ち見4席。席の並びは先に椅子8(左の列→右の列)、あとに立ち見。props.chairs: 席番号→椅子の色
  "meeting-table": { cat: "meeting",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: { chairs: {} },
    boxes: () => one([0, 0, 0, 44, 88, 20]),
    seats: (dir, p) => [
      ...[0, 1, 2, 3].map(i => seat(dir, -14, 11 + 22 * i, "meet", { chair: p.chairs[i + 1] })),
      ...[0, 1, 2, 3].map(i => ({ dx: 58, dy: 11 + 22 * i, face: "NW", type: "meet", chair: p.chairs[i + 5] })),
      { dx: 50, dy: 100, face: "SW", type: "stand" }, { dx: -40, dy: 82, face: "SE", type: "stand" },
      { dx: 80, dy: 0, face: "NW", type: "stand" }, { dx: 8, dy: -10, face: "SW", type: "stand" },
    ],
  },
  // 4人がけ。席は椅子4(左の列→右の列)のみ。props.chairs: 席番号→椅子の色
  "meeting-table-small": { cat: "meeting",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: { chairs: {} },
    boxes: () => one([0, 0, 0, 44, 44, 20]),
    seats: (dir, p) => [
      ...[0, 1].map(i => seat(dir, -14, 11 + 22 * i, "meet", { chair: p.chairs[i + 1] })),
      ...[0, 1].map(i => ({ dx: 58, dy: 11 + 22 * i, face: "NW", type: "meet", chair: p.chairs[i + 3] })),
    ],
  },
  "display-stand": { cat: "meeting", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 36, 4, 40]) },
  whiteboard: { cat: "meeting", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 50, 7, 34]) },
  // L字のカウンターとスツール5脚。原点はカウンターの外接矩形の角。後ろの2つは歩けない範囲だけ(絵は最初の箱が描く)
  "bar-counter": { cat: "lounge",
    dirs: ["x+"], art: ["x+"],
    props: {},
    boxes: () => [{ b: [0, 0, 0, 45, 96, 20], block: false }, { b: [3, 2, 0, 17, 80, 16], draw: false }, { b: [3, 80, 0, 43, 94, 16], draw: false }],
    seats: () => [
      ...[0, 1, 2, 3].map(i => ({ dx: -11, dy: 12 + 20 * i, face: "SE", type: "stool" })),
      { dx: 31, dy: 52, face: "NW", type: "stool" },
    ],
  },
  // 背の高い本棚(正面が+X)
  bookshelf: { cat: "storage", dirs: ["x+"], art: ["x+"], props: {}, boxes: () => one([0, 0, 0, 10, 32, 40]) },
  // 飲み物の自販機(正面が+X)
  "vending-machine": { cat: "lounge", dirs: ["x+"], art: ["x+"], props: {}, boxes: () => one([0, 0, 0, 16, 24, 44]) },
  // 受付カウンター(来客側が+X)
  "reception-counter": { cat: "facility", dirs: ["x+"], art: ["x+"], props: {}, boxes: () => one([0, 0, 0, 16, 64, 28]) },
  "open-shelf": { cat: "storage", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 6, 26, 36]) },
  "wall-monitor": { cat: "meeting", dirs: ["x+"], props: {}, boxes: () => [{ b: [0, 0, 22, 2, 28, 38], block: false }] },
  "microwave-rack": { cat: "storage", dirs: ALL, props: {}, boxes: dir => one(foot(dir, 18, 12, 26)) },
  fridge: { cat: "storage", dirs: ALL, props: {}, boxes: dir => one(foot(dir, 14, 14, 22)) },
  // ロッカー。dirは扉の向き。props.n: 列の数
  locker: { cat: "storage", dirs: ALL, props: { n: 1 }, boxes: (dir, p) => one(foot(dir, 10 * p.n, 12, 40)) },
  "cleaning-locker": { cat: "storage", dirs: ALL, props: {}, boxes: () => one([0, 0, 0, 10, 10, 40]) },
  "rack-server": { cat: "storage", dirs: ALL, props: {}, boxes: dir => one(foot(dir, 14, 18, 42)) },
  "ac-unit": { cat: "facility", dirs: ["y+", "x+"], props: { n: 1 }, boxes: (dir, p) => one(foot(dir, 18 * p.n, 8, 14)) },
  partition: { cat: "facility", dirs: ["x+", "y+"], art: ["x+", "y+"], sym: true, props: { len: 40, h: 28, style: "frost" }, boxes: (dir, p) => one(foot(dir, p.len, 2, p.h)) },
  "low-cabinet": { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 40, 10, 24]) },
  pillar: { cat: "facility", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 16, 10, 15]) },
  "hanger-rack": { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 26, 6, 34]) },
  "air-purifier": { cat: "storage", dirs: ["x+"], props: {}, boxes: () => mid(3, 3, 16) },
  cabinet: { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => one([0, 0, 0, 16, 9, 15]) },
  "trash-bin": { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => mid(2, 2, 8) },
  // props.w・d: 箱の幅と奥行き(絵は操作パネルと給紙トレイを含めて24×21。壁に寄せるときは箱だけ小さくできる)
  printer: { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: { w: 24, d: 21 }, boxes: (dir, p) => one([0, 0, 0, p.w, p.d, 18]) },
  "cork-board": { cat: "meeting", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 22, 7, 30]) },
  "umbrella-stand": { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => mid(4, 4, 20) },
  "coat-rack": { cat: "storage", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => mid(4, 4, 40) },
  "ashtray-stand": { cat: "facility", dirs: ALL, props: {}, boxes: () => mid(4, 4, 22) },
  // 観葉植物。props.pot: 鉢の色(パレット文字3つ)。無ければ白い鉢
  "plant-big": { cat: "decor", dirs: ALL, props: { pot: null }, boxes: () => mid(5, 5, 30) },
  "plant-tree": { cat: "decor", dirs: ALL, props: { pot: null }, boxes: () => mid(6, 6, 44) },
  "plant-snake": { cat: "decor", dirs: ALL, props: {}, boxes: () => mid(3, 3, 22) },
  // 立ち位置(床に印だけ)。原点が席。props.smoke: 立っている人が一服する(手に煙を出す)
  "stand-spot": { cat: "lounge", dirs: ALL, props: { smoke: false }, seats: (dir, p) => [seat(dir, 0, 0, "stand", { smoke: p.smoke })] },
  stage: { cat: "meeting", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 54, 160, 6]) },
  lectern: { cat: "meeting", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 6, 10, 14, 31]) },
  // 敷物(床に貼る平らな物)。props.style: aud・sage・beige・mat
  rug: { cat: "decor", dirs: ["x+"], props: { w: 16, d: 16, style: "beige" }, boxes: (dir, p) => [{ b: [0, 0, 0, p.w, p.d, 0], block: false }] },
  // 1人用のソファ。原点は席。囲いは奥(-Y側)
  "focus-sofa": { cat: "lounge", dirs: ["y+"], props: {}, boxes: () => one([-11, -18, 0, 14, 10, 34]), seats: dir => [seat(dir, 0, 0, "focus", { sz: 9 })] },
  "egg-chair": { cat: "lounge", dirs: ["x+"], props: {}, boxes: () => one([-13, -9, 0, 6, 9, 44]), seats: dir => [seat(dir, 0, 0, "egg", { sz: 11 })] },
  // 丸いクッションを並べたベンチ(席3つ)。クッションの色は席順にY・l・p
  "cushion-bench": { cat: "lounge",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => one([0, 0, 0, 18, 60, 34]),
    seats: dir => ["Y", "l", "p"].map((col, i) => seat(dir, 10, 10 + 20 * i, "bench", { sz: 10, col })),
  },
  "bench-corner": { cat: "lounge", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 62, 14, 14]) },
  planter: { cat: "decor", dirs: ["x+"], art: ["x+"], sym: true, props: { w: 18, d: 18, h: 28 }, boxes: (dir, p) => one([0, 0, 0, p.w, p.d, p.h]) },
  "floor-lamp": { cat: "decor", dirs: ["x+"], art: ["x+"], sym: true, props: {}, boxes: () => [{ b: [-5, -5, 0, 5, 5, 36], block: false }] },
  // 丸テーブルと椅子4脚(奥・左・右・手前)。props.swap: 椅子の色の並びを入れ替える。原点は真ん中
  "tea-table": { cat: "lounge",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: { swap: false },
    boxes: () => mid(10, 10, 12),
    seats: (dir, p) => [[0, -16, "SW", 0], [-16, 0, "SE", 1], [16, 0, "NW", 1], [0, 16, "NE", 0]]
      .map(([dx, dy, face, k]) => ({ dx, dy, face, type: "tea", chair: (k ^ +p.swap) ? "sage" : "rose" })),
  },
  "tea-counter": { cat: "lounge", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 76, 14, 40]) },
  "glass-cabinet": { cat: "storage", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 13, 10, 38]) },
  // 向かい合う2つのベンチとテーブル。原点は奥のベンチの角。4席(奥のベンチ2・手前のベンチ2)
  booth: { cat: "lounge",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [0, 0, 0, 40, 17, 34] }, { b: [3, 18, 0, 37, 30, 12] }, { b: [0, 32, 0, 40, 48, 34] }],
    seats: () => [[10, 11, "SW"], [30, 11, "SW"], [10, 37, "NE"], [30, 37, "NE"]].map(([dx, dy, face]) => ({ dx, dy, face, type: "booth", sz: 9 })),
  },
  // 長テーブル。向かい合う4席ずつ(奥の列→手前の列)
  "dine-table": { cat: "lounge",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => one([0, 0, 0, 84, 18, 14]),
    seats: () => [0, 1].flatMap(s => [0, 1, 2, 3].map(i => ({ dx: 12 + 20 * i, dy: s ? 24 : -6, face: s ? "NE" : "SW", type: "dine" }))),
  },
  "dine-counter": { cat: "lounge", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 124, 16, 42]) },
  "beverage-station": { cat: "lounge", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 46, 14, 34]) },
  // 窓ぎわのカウンター1区画とスツール。原点はカウンターの人の側のへり。props.span: 区画のYの範囲(原点から)、props.depth: Xの奥行き
  "window-counter": { cat: "lounge",
    dirs: ["x+"],
    props: { span: [-12, 12], depth: 12 },
    boxes: (dir, p) => one([0, p.span[0], 0, p.depth, p.span[1], 17]),
    seats: dir => [seat(dir, -6, 0, "stool")],
  },
  "phone-booth": { cat: "meeting", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 20, 20, 40]), seats: dir => [seat(dir, 8, 11, "pbooth", { sz: 8 })] },
  // props.color: クッションの色(パレット文字)
  beanbag: { cat: "lounge", dirs: ALL, props: { color: "Y" }, seats: (dir, p) => [seat(dir, 0, 0, "beanbag", { col: p.color, sz: 5 })] },
  "low-stool": { cat: "lounge", dirs: ALL, props: {}, seats: dir => [seat(dir, 0, 0, "lstool", { sz: 7 })] },
  // 低い丸テーブル。props.plant: 鉢を置く(falseならマグ)
  "low-table": { cat: "lounge", dirs: ["x+"], art: ["x+"], sym: true, props: { plant: false }, boxes: () => mid(6, 6, 10) },
  "chair-cart": { cat: "desk", dirs: ["x+"], props: {}, boxes: () => one([0, 0, 0, 26, 16, 26]) },
  // 季節の飾り。events: 出すイベントのid(src/lib/virtual-office/events.ts)。マップのitemのseasonにそのidを付けると、そのイベントのときだけ描く。たいてい歩ける(block: false)
  kadomatsu: { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["newyear"], props: {}, boxes: () => mid(5, 5, 34) },
  daruma: { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["newyear"], props: {}, boxes: () => [{ b: [-5, -3, 0, 5, 3, 14], block: false }] },
  "oni-standee": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["setsubun"], props: {}, boxes: () => one([-6, -3, 0, 6, 3, 44]) },
  // props.palette: pink・blue・party
  "balloon-bunch": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["valentine", "whiteday", "kodomo", "xmas"], props: { palette: "pink" }, boxes: () => [{ b: [-2, -2, 0, 2, 2, 52], block: false }] },
  "hina-stand": { cat: "season", dirs: ["x+"], art: ["x+"], events: ["hinamatsuri"], props: {}, boxes: () => one([0, 0, 0, 30, 32, 46]) },
  "peach-vase": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["hinamatsuri"], props: {}, boxes: () => [{ b: [-3, -3, 0, 3, 3, 24], block: false }] },
  // 鉢植えの花木。props.style: sakura・maple・peach
  "season-tree": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["sakura", "autumn", "hinamatsuri"], props: { style: "sakura" }, boxes: () => mid(5, 5, 40) },
  "koinobori-pole": { cat: "season", dirs: ["x+"], art: ["x+"], events: ["kodomo"], props: {}, boxes: () => [{ b: [0, -46, 0, 4, 4, 72], block: false }] },
  // 紫陽花の鉢。props.color: blue・purple・pink
  hydrangea: { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["tsuyu"], props: { color: "blue" }, boxes: () => [{ b: [-5, -5, 0, 5, 5, 16], block: false }] },
  "open-umbrella": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["tsuyu"], props: {}, boxes: () => [{ b: [-6, -3, 0, 6, 3, 22], block: false }] },
  "tanabata-bamboo": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["tanabata"], props: {}, boxes: () => one([-3, -3, 0, 3, 3, 60]) },
  "lantern-tower": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["summer"], props: {}, boxes: () => one([-3, -3, 0, 3, 3, 54]) },
  "pampas-vase": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["tsukimi", "autumn"], props: {}, boxes: () => [{ b: [-3, -3, 0, 3, 3, 34], block: false }] },
  "moon-rabbit": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["tsukimi"], props: {}, boxes: () => [{ b: [-3, -3, 0, 3, 3, 8], block: false }] },
  // props.big: 大きい山
  "pumpkin-pile": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["halloween", "autumn"], props: { big: false }, boxes: () => [{ b: [-9, -6, 0, 9, 6, 16], block: false }] },
  "floating-ghost": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["halloween"], props: {}, boxes: () => [{ b: [-6, -6, 18, 6, 6, 36], block: false }] },
  "xmas-tree": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["xmas"], props: {}, boxes: () => one([-5, -5, 0, 5, 5, 54]) },
  "gift-pile": { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["xmas"], props: {}, boxes: () => [{ b: [-6, -5, 0, 10, 11, 14], block: false }] },
  snowman: { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["xmas"], props: {}, boxes: () => [{ b: [-4, -4, 0, 4, 4, 14], block: false }] },
  poinsettia: { cat: "season", dirs: ["x+"], art: ["x+"], sym: true, events: ["xmas"], props: {}, boxes: () => [{ b: [-4, -4, 0, 4, 4, 16], block: false }] },
};
// artがある定義は、dirsぶんの箱と席を派生させる
export const CATALOG = Object.fromEntries(Object.entries({ ...DEFS, ...Object.fromEntries(Object.entries(PLUGIN_DEFS).map(([k, d]) => [k, safeDef(k, d)])) }).map(([k, d]) => [k, d.art ? derive(d) : d]));

// エディタが選ばせる種類の一覧。名前(export名)は変えない
// 壁: cut=腰の高さで切った白い壁 / glass=すりガラスの帯 / slat=白い板に横長のスリット / panel=パネル＋上は透明なガラスの帯 / glasslow=床から天井までの窓(輪切り) / none=歩けない線だけ(絵なし) /
//     window=窓の帯つきの外壁 / outer=窓なしの外壁 / rail=屋外の手すり。外壁(window・outer)は、床が壁のカメラ側(+X・+Y)にあれば高さいっぱいに、奥側(-X・-Y)にあれば腰の高さで切って描く
export const WALL_KINDS = ["cut", "glass", "glasslow", "none", "panel", "slat", "window", "outer", "rail"];
// 扉(壁の上に置く): glass=ガラスの引き戸 / lock=オートロックのガラス戸(カードリーダーつき) / lockw=白い引き戸(カードリーダーつき) / swing=外へ開く戸 / wc=化粧室の戸 / wood=木の戸
export const DOOR_KINDS = ["glass", "lock", "lockw", "swing", "wc", "wood"];
// 床の柄(部屋のfloor)。carpet-tile=濃いグレーのタイルカーペット / carpet=無地のカーペット / carpet-stripe=縞のカーペット / stone=石目 / wood=濃い色の板 / parquet=明るい木のフローリング /
//     checker=白とグレーの市松 / tile=目地の入った白いタイル / tile-blue=青い小さいタイル / deck=屋外のウッドデッキ
export const FLOOR_KINDS = ["carpet-tile", "carpet", "carpet-stripe", "stone", "wood", "parquet", "checker", "tile", "tile-blue", "deck"];
// room.floorを省略したときの柄(部屋の種類ごと。屋外の部屋はdeck)
export const DEFAULT_FLOOR = { work: "carpet-tile", meeting: "stone", break: "checker", free: "carpet", hall: "tile" };
