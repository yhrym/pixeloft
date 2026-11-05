// @ts-check
// ダーツマシン1台。原点は壁ぎわの的の真ん中(奥行きの0が壁)。的は+Y側に向く。立ち位置は的の正面に一列(1番が投げる人)
/** @type {import("@/plugins/types").PluginItemDef} */
const machine = {
  cat: "decor", dirs: ["y+"], props: {},
  // y+だけ。artを書くと転置のx+も増え、「301」が「103」と逆順に見える(sprは転置で反転しない)ため、artは書かない
  // 本体(幅16・奥行き1〜9に操作台を足して12・高さ40)と、床のスローライン(歩ける)
  boxes: () => [{ b: [-8, 1, 0, 8, 12, 40] }, { b: [-6, 40, 0, 6, 43, 0], block: false }],
  seats: () => [44, 56, 68, 80].map(dy => ({ dx: 0, dy, face: "NE", type: "stand" })),
};
const defs = { "darts:machine": machine };
export default defs;
