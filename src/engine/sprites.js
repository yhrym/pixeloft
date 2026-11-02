// ドット絵の色と人・小物のスプライト(パレットとスプライト)。
// エンジン(office.js・city.js・event-decor.js)が使う。DOMには触らない(paintSprite は渡された canvas に描くだけ)
import { DESK_SPRITES, DESK_DECOS } from './desk-sprites.js';
import { WARDROBE_OUTFITS, WARDROBE_ACCS } from './wardrobe-sprites.js';
import { HAIR_FRONT, HAIR_BACK, composeHair } from './hair-sprites.js';
import { isHex, shadeHair, shadeCloth, shadePants } from './shade.js';
import { EMOTE_ICONS, POSE_ARMS } from './emote-sprites.js';
const HF = HAIR_FRONT, HB = HAIR_BACK;
/* ============================================================
   パレット: 1文字=1色。x/z/i は窓の外(空・雲/遠景・遠くの窓明かり)で時間帯ごとに差し替える。
   '*' は照明そのもの(夜でも暗くしない)
   ============================================================ */
export const PAL = {
  K: '#241c2b', k: '#3e3446', n: '#5f5668', m: '#858699', l: '#b9bdcb', W: '#fbf8f1', V: '#e2dccf', U: '#bdb3a2',
  a: '#ecc184', b: '#d8a465', c: '#bb8449', d: '#8c5a33', e: '#5a3626', f: '#f3ead8', g: '#ddd0b6', h: '#bfae8e',
  S: '#f8d6b8', s: '#e3aa86', t: '#a86f50', p: '#a6d672', q: '#62ad4c', r: '#2f7148', G: '#d4f0f6', H: '#8fcbe0',
  B: '#5385c0', N: '#33508a', R: '#dc5a4c', Q: '#9e3544', Y: '#f5c851', O: '#e08f3c', T: '#40a394', J: '#2b6f6b',
  x: '#8fcbe0', z: '#d4f0f6', i: '#d4f0f6', '*': '#ffe9a0',
  u: '#6e7480', v: '#8c919b', w: '#4f545e', // アスファルト(明・中・暗)
  A: '#d7cdb8', E: '#c2b69c', D: '#a3977d', // 隣のマンションのベージュタイル
  X: '#9aa0a8', Z: '#73787f', // 石の灰色
  L: '#8e8b84', M: '#a29e95', // 天窓から床に差す光(カーペットを少し明るく暖かくした色。時間帯で差し替え)
  I: '#9c8a62', // 床コンセントのふた(くすんだ真鍮)
  '+': '#f19cb7', // 机の飾りのピンク(花・招き猫の耳・お菓子の箱)
  // きせかえの色(髪・服・肌・ズボン)
  '(': '#f39ab8', ')': '#cf6b92', '[': '#fcd3e1', // ピンク(明・暗・つや)
  ']': '#8e6cc6', '{': '#5e4693', '}': '#bba4e8', // むらさき
  '<': '#f29a88', '>': '#e6e9f0', '^': '#fde9da', '~': '#9b9463', '=': '#76703f', // 赤髪のつや・銀髪・色白の肌・カーキ(明・暗)
};

/* ============================================================
   人物(16px幅)。H/h/j=髪 S/s=肌 C/c=服 P/p=ズボン F=靴。輪郭線は描画時に自動で付く
   ============================================================ */
// A common face is composed with each hand-drawn hair mask in hair-sprites.js.
export { HAIR_FRONT as HF, HAIR_BACK as HB };
// 座り(頭は0〜11行、体は12行目から)
export const SIT_F = ['....CCccccCc....', '...CCCCCCCCCc...', '..CCCCCCCCCCcc..', '..CcCCCCCCCCcc..', '..CCcCCCCCCccc..', '..SsCCCCCCCcSs..',
  '..PPPPPPPPPPPp..', '..PPPPPPPPPPpp..', '...PPPp..PPPp...', '...PPPp..PPPp...', '...PPp...PPp....', '..nFFF..nFFF....'];
export const SIT_B = ['....cCCCCCCc....', '...CCCCCCCCCc...', '..CCCCCCCCCCcc..', '..CCCCCCCCCCcc..', '..cCCCCCCCCCcc..', '..ScCCCCCCCccS..',
  '...PPPPPPPPPp...', '...PPPPPPPPpp...'];
// 立ち・歩き(2コマ)
export const ST_TOP_F = ['....CCccccCc....', '...CCCCCCCCCc...', '..CCCCCCCCCCcc..', '..CcCCCCCCCCcc..', '..CcCCCCCCCCcc..', '..SsCCCCCCCcSs..', '...sPPPPPPPps...'];
export const ST_TOP_B = ['....cCCCCCCc....', '...CCCCCCCCCc...', '..CCCCCCCCCCcc..', '..CCCCCCCCCCcc..', '..cCCCCCCCCCcc..', '..ScCCCCCCCccS..', '...cPPPPPPPpc...'];
export const LEGS = [
  ['....PPPPPPpp....', '....PPPp.PPp....', '....PPPp.PPp....', '....PPPp.PPp....', '....PPp..PPp....', '...nFFF.nFFF....'],
  ['....PPPPPPpp....', '...PPPp..Ppp....', '...PPp....Ppp...', '..PPp......Pp...', '..nFFF....nFFF..', '................'],
];
export const HPH = ['.....kkkkkk.....', '...kk......kk...', '..k..........k..', '.k............k.', '.k............k.', '.k............k.',
  'kkn..........nkk', 'knn..........nnk', 'knn..........nnk', 'kkn..........nkk'];
export const MUG_HAND = ['.WWV.', 'SWWVS', '.VVU.'];

// 選択肢: [記号, ラベル, ...]。記号はサーバーの LOOK_OPTIONS(presence.ts)と同じ(look.test.ts で確かめる)
export const HAIRS = [['short', 'engine.hair.short'], ['messy', 'engine.hair.messy'], ['bob', 'engine.hair.bob'], ['long', 'engine.hair.long'], ['pony', 'engine.hair.pony'], ['bun', 'engine.hair.bun'],
  ['buzz', 'engine.hair.buzz'], ['twoblock', 'engine.hair.twoblock'], ['center', 'engine.hair.center'], ['side', 'engine.hair.side'], ['mash', 'engine.hair.mash'], ['wolf', 'engine.hair.wolf'],
  ['twin', 'engine.hair.twin'], ['braid', 'engine.hair.braid'], ['halfup', 'engine.hair.halfup'], ['wave', 'engine.hair.wave'], ['afro', 'engine.hair.afro'], ['slick', 'engine.hair.slick'],
  ['hime', 'engine.hair.hime'], ['curly', 'engine.hair.curly'], ['sidepony', 'engine.hair.sidepony'], ['spiky', 'engine.hair.spiky'], ['pixie', 'engine.hair.pixie'], ['lowbun', 'engine.hair.lowbun'],
  ['doublebun', 'engine.hair.doublebun'], ['lowtwin', 'engine.hair.lowtwin'], ['twinbraid', 'engine.hair.twinbraid'], ['highpony', 'engine.hair.highpony'], ['pompadour', 'engine.hair.pompadour'],
  ['mohawk', 'engine.hair.mohawk'], ['asym', 'engine.hair.asym'], ['outwardbob', 'engine.hair.outwardbob'], ['dread', 'engine.hair.dread'], ['bald', 'engine.hair.bald']];
// 色: [記号, 色の置き換え, 見本の色, ラベル]
export const HAIR_COLS = [['black', { H: 'k', h: 'K', j: 'n' }, '#3e3446', 'engine.hc.black'], ['dbrown', { H: 'e', h: 'K', j: 'd' }, '#5a3626', 'engine.hc.dbrown'], ['brown', { H: 'd', h: 'e', j: 'c' }, '#8c5a33', 'engine.hc.brown'],
  ['tea', { H: 'c', h: 'd', j: 'b' }, '#bb8449', 'engine.hc.tea'], ['ash', { H: 'b', h: 'c', j: 'a' }, '#d8a465', 'engine.hc.ash'], ['grey', { H: 'l', h: 'm', j: 'W' }, '#b9bdcb', 'engine.hc.grey'],
  ['gold', { H: 'Y', h: 'O', j: 'f' }, '#f5c851', 'engine.hc.gold'], ['red', { H: 'R', h: 'Q', j: '<' }, '#dc5a4c', 'engine.hc.red'], ['pink', { H: '(', h: ')', j: '[' }, '#f39ab8', 'engine.hc.pink'],
  ['blue', { H: 'B', h: 'N', j: 'H' }, '#5385c0', 'engine.hc.blue'], ['purple', { H: ']', h: '{', j: '}' }, '#8e6cc6', 'engine.hc.purple'], ['silver', { H: '>', h: 'l', j: 'W' }, '#e6e9f0', 'engine.hc.silver']];
export const SKINS = [['pl', { S: '^', s: 'S' }, '#fde9da', 'engine.sk.pl'], ['l', { S: 'S', s: 's' }, '#f8d6b8', 'engine.sk.l'], ['m', { S: 's', s: 't' }, '#e3aa86', 'engine.sk.m'],
  ['d', { S: 't', s: 'd' }, '#a86f50', 'engine.sk.d'], ['dd', { S: 'd', s: 'e' }, '#8c5a33', 'engine.sk.dd']];
// 服の色。o=柄の2色目(ボーダー・アロハの花など)。白っぽい服は紺にする
export const CLOTHES = [['teal', { C: 'T', c: 'J' }, '#40a394', 'engine.cl.teal'], ['blue', { C: 'B', c: 'N' }, '#5385c0', 'engine.cl.blue'], ['red', { C: 'R', c: 'Q' }, '#dc5a4c', 'engine.cl.red'], ['yellow', { C: 'Y', c: 'O', o: 'N' }, '#f5c851', 'engine.cl.yellow'],
  ['green', { C: 'q', c: 'r' }, '#62ad4c', 'engine.cl.green'], ['white', { C: 'W', c: 'V', o: 'N' }, '#fbf8f1', 'engine.cl.white'], ['grey', { C: 'm', c: 'n' }, '#858699', 'engine.cl.grey'], ['navy', { C: 'N', c: 'k' }, '#33508a', 'engine.cl.navy'],
  ['orange', { C: 'O', c: 'd' }, '#e08f3c', 'engine.cl.orange'], ['pink', { C: '(', c: ')' }, '#f39ab8', 'engine.cl.pink'], ['purple', { C: ']', c: '{' }, '#8e6cc6', 'engine.cl.purple'], ['black', { C: 'k', c: 'K' }, '#3e3446', 'engine.cl.black'],
  ['beige', { C: 'g', c: 'h', o: 'N' }, '#ddd0b6', 'engine.cl.beige'], ['sky', { C: 'H', c: 'B' }, '#8fcbe0', 'engine.cl.sky']];
export const PANTS = [['navy', { P: 'N', p: 'k' }, '#33508a', 'engine.pt.navy'], ['black', { P: 'k', p: 'K' }, '#3e3446', 'engine.pt.black'], ['grey', { P: 'm', p: 'n' }, '#858699', 'engine.pt.grey'], ['beige', { P: 'g', p: 'h' }, '#ddd0b6', 'engine.pt.beige'],
  ['brown', { P: 'd', p: 'e' }, '#8c5a33', 'engine.pt.brown'], ['denim', { P: 'B', p: 'N' }, '#5385c0', 'engine.pt.denim'], ['khaki', { P: '~', p: '=' }, '#9b9463', 'engine.pt.khaki'], ['white', { P: 'W', p: 'V' }, '#fbf8f1', 'engine.pt.white']];
// 服の種類: [記号, ラベル, {f: 正面, b: 背面}]。体(SIT_F など)の上半身6行に重ねる16幅の柄。C/c=服 o=柄の2色目
export const OUTFITS = WARDROBE_OUTFITS;
// 小物: [記号, ラベル, {y, x, f: 正面, b: 背面, hat}]。頭(髪)と同じ位置に重ねる(14幅は x 省略、16幅は x: -1)。後ろから見えない物は b なし。
// hat=帽子(髪の0行目より上=おだんご・アフロのてっぺんは描かない)
export const ACCS = WARDROBE_ACCS;
export const lookup = (list, k) => (list.find(x => x[0] === k) || list[0])[1];
const partOf = (list, k) => (list.find(x => x[0] === k) || list[0])[2];
// 好きな色: 128番より後ろの1文字(コード128〜0xD7FF)を、同じ色なら使い回して割り当てる。PALに足すので、描く側は今までの色の記号と同じに扱える。
// palState.n は割り当てた数。エンジンは増えていたらパレットの表(DK・RGBA)を作り直す。shortcut: 上限(約5万5千色)を超えたら黒の輪郭色に落とす。本当に足りなくなったら使われていない色を回収する
const colorChars = new Map();
export const palState = { n: 0 };
export function colorChar(hex) {
  let ch = colorChars.get(hex);
  if (ch) return ch;
  if (128 + colorChars.size >= 0xD800) return 'K';
  ch = String.fromCharCode(128 + colorChars.size);
  colorChars.set(hex, ch); PAL[ch] = hex; palState.n = colorChars.size;
  return ch;
}
// 置き換えの値の #hex は色の記号に直す(パレットの記号はそのまま)
const chars = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v[0] === '#' ? colorChar(v) : v]));
// 色の指定は、選択肢の記号か #rrggbb。#rrggbb は影・つやを shade.js で作る
const roles = (list, shade, v) => (isHex(v) ? chars(shade(v)) : lookup(list, v));
// o(柄の2色目)は既定で白。服の色に o があればそれ
export const mkMap = o => Object.assign({ F: 'k', o: 'W' }, roles(HAIR_COLS, shadeHair, o.hc), lookup(SKINS, o.sk), roles(CLOTHES, shadeCloth, o.cl), roles(PANTS, shadePants, o.pt));

// みんなのパーツ(u:<id>)。髪はHF/HBに足し、服・小物はここに持つ。先頭が __proto__ などでも安全なよう prototype なしの入れ物
const CUSTOM = { ot: Object.create(null), ac: Object.create(null) };
export const outfitOf = k => CUSTOM.ot[k] || partOf(OUTFITS, k);
const accOf = k => CUSTOM.ac[k] || partOf(ACCS, k);
/** parts: [{id, kind, data}]。前に入れた分は全部入れ替える */
export function setCustomParts(parts) {
  for (const k of Object.keys(HF)) if (k.startsWith('u:')) { delete HF[k]; delete HB[k]; }
  CUSTOM.ot = Object.create(null); CUSTOM.ac = Object.create(null);
  for (const { id, kind, data } of parts || []) {
    try {
      const key = 'u:' + id;
      if (kind === 'hair') { const [f, b] = composeHair(data); HF[key] = f; HB[key] = b; }
      else if (kind === 'ot') CUSTOM.ot[key] = { f: data.f, b: data.b };
      else if (kind === 'ac') CUSTOM.ac[key] = { y: data.y, x: data.x || 0, hat: !!data.hat, f: data.f, b: data.b || null };
    } catch { /* 壊れた絵は使わない(既定の見た目のまま) */ }
  }
}

/* ============================================================
   小物
   ============================================================ */
export const HAND = ['..K.K...', '.KSKSKK.', '.KSKSKSK', 'KKSSSSSK', 'KSKSSSSK', 'KSSSSSSK', '.KSSSSK.', '..KKKK..'];
// エモーション。記号と順番はサーバーの presence.ts の EMOTES と同じ(emotes.test.ts で確かめる)
export const EMOTES = [['dance', 'engine.emote.dance'], ['jump', 'engine.emote.jump'], ['spin', 'engine.emote.spin'], ['banzai', 'engine.emote.banzai'], ['clap', 'engine.emote.clap'], ['heart', 'engine.emote.heart'], ['good', 'engine.emote.good'], ['wow', 'engine.emote.wow'], ['what', 'engine.emote.what'], ['sweat', 'engine.emote.sweat']];
// 頭の上とパレットに出す絵(emote-sprites.js)
export const EMOTE_ICON = EMOTE_ICONS;
export const SIGN = ['.kkkkkkk.', 'kWWWWWWWk', 'kWWNNWWWk', 'kWNNWWYWk', 'kWNNWWWWk', 'kWWNNWWWk', 'kWWWWWWWk', '.kkkkkkk.', '..k...k..'];
export const DECO_SPR = DESK_SPRITES;
export const DECOS = DESK_DECOS;
export const CLOCK = ['..kkk..', '.kWWWk.', 'kWWKWWk', 'kWWKKWk', 'kWWWWWk', '.kWWWk.', '..kkk..'];


/* ============================================================
   小さなキャンバス(顔・全身・小物のアイコン)
   ============================================================ */
// stamps=[[rows, 色の置き換え, x, y, 左右反転], ...] を w×h の canvas に描く。輪郭線は自動で付く。scale 倍の画素で描く(表示の拡大はCSSでもよい)
export function paintSprite(canvas, w, h, stamps, bg, scale = 1) {
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const [rows, map, ox, oy, flip] of stamps) for (let v = 0; v < rows.length; v++) { const row = rows[v], n = row.length; for (let u = 0; u < n; u++) { const ch = row[flip ? n - 1 - u : u]; if (ch === '.') continue; const x = ox + u, y = oy + v; if (x >= 0 && y >= 0 && x < w && y < h) grid[y][x] = (map && map[ch]) || ch; } }
  const out = grid.map(r => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!grid[y][x] && ((grid[y][x - 1]) || (grid[y][x + 1]) || (grid[y - 1] && grid[y - 1][x]) || (grid[y + 1] && grid[y + 1][x]))) out[y][x] = 'K';
  canvas.width = w * scale; canvas.height = h * scale;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out[y][x]) { g.fillStyle = PAL[out[y][x]]; g.fillRect(x * scale, y * scale, scale, scale); }
  return canvas;
}
// 座りの絵で腕が柄の2色目(o)の服。ポーズで動かす腕も o にする(下ろした腕と色が変わらないように)
const O_SLEEVES = ['jersey', 'vest'];
/**
 * 人のスタンプ([rows, 色の置き換え, x, y])。重ね順は体→服の柄→髪→まばたき→小物(→ポーズの腕)。
 * 位置は16幅の体の左上が(0,0)。頭(髪)は hd.y 行目(+bob)、体は12行目から。座り(SIT_F/B)と立ち・歩き(ST_TOP+LEGS[frame])
 * pose(座り・立ち): 'up'=バンザイ 'clap'=顔の前で手を合わせる。体と服の柄から下ろした腕を消し、腕(POSE_ARMS)を髪と小物の上に重ねる
 */
export function personStamps(p, back = false, stand = false, frame = 0, bob = 0, blink = false, pose = null) {
  const map = p.map || mkMap(p), ot = outfitOf(p.ot), ac = accOf(p.ac), H = back ? HB : HF, hd = H[p.hair] || H.short;
  const arms = POSE_ARMS[pose];
  // 下ろした腕と手 = 体と服の柄の2〜5行目(全体の14〜17行目。立ちは手の先が6行目まで)の左右4列。pose がなければ同じ配列をそのまま返す
  const cut = rows => (arms ? rows.map((r, i) => (i >= 2 && i < (stand ? 7 : 6) ? '....' + r.slice(4, 12) + '....' : r)) : rows);
  let hr = hd.r, hy = hd.y;
  if (ac && ac.hat && hy < 0) { hr = hr.slice(-hy); hy = 0; }
  const hx = 1 + (hd.x || 0), s = stand ? [[cut(back ? ST_TOP_B : ST_TOP_F), map, 0, 12], [LEGS[frame], map, 0, 19]] : [[cut(back ? SIT_B : SIT_F), map, 0, 12]];
  if (ot) s.push([cut(back ? ot.b : ot.f), map, 0, 12]);
  s.push([hr, map, hx, hy + bob]);
  // Close both pixels of each eye, then draw the little shaded eyelids.
  if (blink && !back) s.push([['...S....S.....', '...s....s.....'], map, 1, 7 + bob]);
  if (!back) s.push([['ss'], map, 7, 10 + bob]); // every front face gets the same tiny, shaded mouth on skin
  const ar = ac && (back ? ac.b : ac.f);
  if (ar) s.push([ar, map, 1 + (ac.x || 0), ac.y + bob]);
  if (arms) s.push([back ? arms.b : arms.f, O_SLEEVES.includes(p.ot) ? Object.assign({}, map, { C: map.o, c: map.o }) : map, -2, arms.y]);
  return s;
}
export const shiftStamps = (stamps, dx, dy) => stamps.map(([r, m, x, y]) => [r, m, x + dx, y + dy]);
// 顔(16×16)。p は {hair, map, ...} か VoLook。UIの着替えプレビューは office.js で広い枠に描く
export function faceStamps(p) { return shiftStamps(personStamps(p), 0, 2); }
// 立ち姿の全身(24×32。広い髪型と輪郭の余白を確保)
export function bodyStamps(p, back = false) { return shiftStamps(personStamps(p, back, true), 4, 4); }
