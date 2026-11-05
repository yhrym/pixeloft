// ダーツマシンの絵。原点(d.x, d.y)は壁ぎわの的の真ん中。電飾は夕方・夜に明るい色になる
const W = 16, Y1 = 9, H = 40, LINE_Y = 40;
const LED = ["B", "]", "("], LED_LIT = ["$", "@", "%"]; // 電飾の3色(青→むらさき→ピンク)
const GLYPH = { 0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"], 3: ["###", "..#", ".##", "..#", "###"] };

const draw = {
  "darts:machine"(k, d) {
    if (d.part === 1) { // スローライン(床に貼った白い線と灰色のふち)
      for (let X = d.x - 6; X <= d.x + 6; X++) for (let i = 0; i < 2; i++) k.wp(X, d.y + LINE_Y + i, 0, k.cc("W"));
      k.flush(true, "n");
      return;
    }
    const X0 = d.x - W / 2, X1 = X0 + W, y1 = d.y + Y1, cx = d.x, cz = 21, lit = k.isLit(), led = lit ? LED_LIT : LED;
    k.box(X0, d.y + 1, 0, X1, y1, H, "n", "k", "K", "m");
    // 正面(的・電飾・点数の画面・コインの口)を1画素ずつ
    for (let X = X0; X <= X1; X++) for (let Z = 0; Z < H; Z++) {
      const dx = X - cx, dz = Z - cz, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx) / Math.PI / 2 + 1, dark = !(Math.floor(a * 8) % 2), ring = (r >= 3.6 && r < 4.5) || (r >= 5.5 && r < 6.4);
      let c = null;
      if (r < 6.4) c = r < 1.1 ? "R" : r < 2.1 ? "q" : ring ? (dark ? "R" : "q") : dark ? "K" : "f";
      else if (r < 7) c = "K";
      else if (r < 8) c = (X + Z) & 1 ? "K" : led[Math.floor(a * 9) % 3]; // 的の縁の電飾
      else if (Z <= 1) c = "K";
      else if (Z >= 38) c = (X + Z) & 1 ? "K" : led[((X - X0) >> 1) % 3]; // 上の電飾
      else if (Z >= 30) c = X <= X0 + 2 || X >= X1 - 2 ? "k" : Z === 30 || Z === 37 || X === X0 + 3 || X === X1 - 3 ? "n" : "K"; // 点数の画面
      else if ((X === X0 + 1 || X === X1 - 1) && Z >= 3) c = Z & 1 ? "K" : led[(Z >> 2) % 3]; // 両わきの縦の電飾
      else if (Z >= 4 && Z <= 6 && Math.abs(dx) <= 1) c = Z === 5 && !dx ? "Y" : "n"; // コインの口
      if (c) k.wp(X, y1, Z, k.cc(c));
    }
    for (let Z = 3; Z < H - 3; Z += 2) k.wp(X1, d.y + 5, Z, k.cc(led[(Z >> 2) % 3])); // 横の面の縦の電飾
    k.flush(true, "K");
    // 点数の「301」。3×5の字を面に傾けずに置く(表示の左右反転に合わせて裏返す)
    [..."301"].forEach((ch, i) => {
      const gx = X1 - 6 - i * 4;
      k.spr(k.PX(gx, y1), k.PY(gx + 1, y1, 36), GLYPH[ch].map(r => r.replace(/#/g, lit ? "*" : "Y")), null, true);
    });
    k.flush(false);
    // 的に刺さった矢(軸と羽根)。置き物ごとに2通り
    const odd = [...d.item.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) & 1;
    for (const [ddx, ddz, f] of odd ? [[2, 1, "Y"], [-1, -2, "B"], [0, 3, "Y"]] : [[-2, 2, "B"], [1, -1, "Y"]]) {
      k.wp(cx + ddx, y1 + 1, cz + ddz, k.cc("l"));
      k.wp(cx + ddx, y1 + 2, cz + ddz, k.cc(f));
    }
    k.flush(false);
    k.box(X0 + 2, y1, 9, X1 - 2, y1 + 3, 12, "n", "k", "K", "m"); // 操作台とボタン
    ["R", "Y", "B", "q", "R", "O"].forEach((b, i) => k.wp(X0 + 3 + i * 2, y1 + 1, 12, k.cc(b)));
    k.flush(true, "K");
  },
};
export default draw;
