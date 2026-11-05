/* eslint-disable */
// バーチャルオフィスの描画とHUD。グローバルを汚さないよう、全部mountOfficeの中に閉じている(destroyで後片付け)。
// 入口の型はoffice.d.ts。人・席・チャット・出来事はVoState(src/lib/virtual-office/types.ts)から作り直す。
import { hudHtml } from './hud.js';
import { seatsOf } from './map.js';
import { makeBackdrop } from './backdrop.js';
import { CATALOG, planOf, DEFAULT_FLOOR } from './catalog.js';
import PLUGIN_DRAW from '../plugins/generated/draw.js';
import { REACTION_ICONS } from './emote-sprites.js';
import { isHex } from './shade.js';
import { PAL, HPH, MUG_HAND, HAIRS, HAIR_COLS, SKINS, CLOTHES, PANTS, OUTFITS, ACCS, lookup, mkMap, HAND, EMOTES, EMOTE_ICON, SIGN, DECO_SPR, DECOS, CLOCK, paintSprite, palState, outfitOf, setCustomParts, faceStamps, personStamps, bodyStamps, shiftStamps } from './sprites.js';

// 文言はconfig.t(key, vars)から取る。渡されなければキーそのまま
const tOf = config => (key, vars) => (config.t ? config.t(key, vars) : key);
// config.menuの項目(href=リンク / onClick=ボタン)を要素にする
const menuEls = (items, after) => (items || []).map(m => {
  const el = document.createElement(m.href ? 'a' : 'button');
  el.className = 'pbtn'; el.textContent = m.label;
  if (m.href) el.href = m.href; else el.addEventListener('click', () => { after?.(); m.onClick?.(); });
  return el;
});
// マップが空(部屋がひとつも無い)ときは、案内とメニューだけ出す
function mountEmpty(root, config) {
  root.innerHTML = '<div class="vo-empty"><h1></h1><p></p><div class="acts"></div></div>';
  root.querySelector('h1').textContent = config.appName || '';
  root.querySelector('p').textContent = tOf(config)('engine.empty');
  root.querySelector('.acts').append(...menuEls(config.menu));
  return { update() {}, setParts() {}, setPluginState() {}, miniOpen: () => false, worldCanvas: () => document.createElement('canvas'), destroy() { root.innerHTML = ''; } };
}

export function mountOffice(root, config) {
if (!config.map.floors.some(f => f.rooms.length)) return mountEmpty(root, config);
root.classList.add('vo-root');
const _t = tOf(config);
const preview = !!config.preview; // エディタのプレビュー: HUD・DOMの重ね物・操作の送信・描画以外のタイマーなし。カメラは床の全体、階のボタンだけ残す
if (preview) root.classList.add('vo-preview');
root.innerHTML = hudHtml(_t);
if (config.dock && !preview) { const d = document.createElement('div'); d.className = 'dock'; d.append(config.dock); root.querySelector('.hud-bar').after(d); } // プラグインが小さい窓を置く所(HUDの中)
// 後片付け: window・documentに付けたリスナーとタイマーはdestroyでまとめて外す(HUDの中の要素はinnerHTMLごと消える)
const cleanups = [], timers = new Set();
let destroyed = false;
const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; };
const every = (fn, ms) => { const id = setInterval(() => { if (!destroyed) fn(); }, ms); cleanups.push(() => clearInterval(id)); return id; };
const parenEsc = x => x.replace(/[()]/g, '\\$&');
const baseTitle = () => document.title.replace(new RegExp(`^(${parenEsc(_t('engine.title.rest'))})?(${parenEsc(_t('engine.title.reply'))})?(\\(!\\) )?(\\(@?\\d+\\) )?`), ''); // タブ名の先頭の未読数を外したもの(ページのtitleはNextが入れる)
// 時刻・日付は端末の時差に関係なくconfig.timeZone(IANA。省略は端末の時間帯)。Intlの書式は1回だけ作る
const tzFmt = (() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); } })();
const zoned = (d = new Date()) => { const o = {}; for (const q of tzFmt.formatToParts(d)) o[q.type] = q.value; return { y: o.year, mo: o.month, d: o.day, h: +o.hour, mi: o.minute }; };
const zonedHM = d => { const z = zoned(d); return `${z.h}:${z.mi}`; };
// 時間帯(朝5〜9時・昼9〜16時・夕16〜18時・夜18時〜)
const zonedTime = () => { const h = zoned().h; return h >= 5 && h < 9 ? 'morning' : h >= 9 && h < 16 ? 'day' : h >= 16 && h < 18 ? 'evening' : 'night'; };
// 入室のあいさつ(11時より前は「おはようございます」、それ以降は「おつかれさまです」)
const greeting = () => _t(zoned().h < 11 ? 'engine.say.morning' : 'engine.say.day');
/* ============================================================
   パレット: 1文字=1色。x/z/i は窓の外(空・雲/遠景・遠くの窓明かり)で時間帯ごとに差し替える。
   '*' は照明そのもの(夜でも暗くしない)
   ============================================================ */
const SKYLIGHT = { morning: ['#878b90', '#9a9fa5'], day: ['#8e8b84', '#a29e95'], evening: ['#957f6e', '#a8917d'], night: ['#777980', '#888a91'] };
const DARK = { a: 'b', b: 'c', c: 'd', d: 'e', e: 'K', f: 'g', g: 'h', h: 'U', W: 'V', V: 'U', U: 'm', l: 'm', m: 'n', n: 'k', k: 'K', K: 'K',
  B: 'N', N: 'k', T: 'J', J: 'k', R: 'Q', Q: 'e', Y: 'O', O: 'd', p: 'q', q: 'r', r: 'k', G: 'H', H: 'B', S: 's', s: 't', t: 'd', L: 'Z', M: 'm', I: 'h' };
// 空(x=空z=雲・遠景i=夜に灯る窓)。朝は青白く、夕方はオレンジ
const SKY = {
  morning: { x: '#c4def2', z: '#eef6fc', i: '#eef6fc' },
  day: { x: '#8fcbe0', z: '#d4f0f6', i: '#d4f0f6' },
  evening: { x: '#f08a4e', z: '#ffc890', i: '#ffd77e' },
  night: { x: '#1c2240', z: '#2e3760', i: '#f5c851' },
};
// 色味: [混ぜる色, 割合, 明るさ]。lit=照明ありdim=夜に人のいない区画out=屋外
// 室内は電気がついているので天気の色は混ぜない(屋外と空だけ)
const LIGHT = {
  morning: { lit: ['#dcecff', 0.12, 1.03], dim: ['#dcecff', 0.12, 1.03], out: ['#cfe2f6', 0.2, 1.02] },
  day: { lit: null, dim: null, out: null },
  evening: { lit: ['#ff9a50', 0.2, 0.95], dim: ['#ff9a50', 0.2, 0.95], out: ['#ff7a3c', 0.34, 0.88] },
  night: { lit: ['#ffe2a8', 0.06, 0.92], dim: ['#1c2240', 0.55, 0.5], out: ['#1c2240', 0.52, 0.52] },
};
const WX_OUT = { cloudy: ['#8f96a3', 0.24, 0.9], rain: ['#465060', 0.42, 0.72], snow: ['#e8ecf2', 0.35, 1.02] };
const SKY_WX = { cloudy: ['#a3aab6', 0.65], rain: ['#5f6878', 0.8], snow: ['#d3d8e0', 0.6] };
const SKY_WX_NIGHT = { cloudy: ['#2b3046', 0.5], rain: ['#1e2232', 0.65], snow: ['#4a5068', 0.5] };
const WEATHERS = [['sunny', 'weather.sunny', 18], ['cloudy', 'weather.cloudy', 16], ['rain', 'weather.rain', 14], ['snow', 'weather.snow', 2]];
const params = new URLSearchParams(location.search);
// 時間帯と天気はconfig.timeOfDay・config.weatherKindで固定できる(ハーネス用)。固定しなければ時間帯はconfig.timeZoneの時刻、天気はconfig.weatherの値
let PSTATE = config.initial?.plugins ?? {}, PSIG = JSON.stringify(PSTATE); // プラグインごとの状態(絵に渡す)。PSIGは変わったか見る用
let SEASON = config.initial?.season ?? null; // いまの季節の飾りのid(applyStateで更新)。itemのseasonがこれと同じときだけ描く
let TIME_FIXED = !!config.timeOfDay; // 固定したときは時計の10秒ごとの切り替えで戻らない
let TIME = config.timeOfDay || zonedTime();
let WEATHER = config.weatherKind || config.weather?.kind || 'sunny';
const MINI = params.get('mini') === '1';

const cc = ch => ch.charCodeAt(0);
const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
function tint(hex, t) { if (!t) return hex; const c = hex2rgb(hex), m = hex2rgb(t[0]); return rgb2hex(c.map((v, i) => (v * (1 - t[1]) + m[i] * t[1]) * t[2])); }
const toU32 = hex => { const [r, g, b] = hex2rgb(hex); return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; };
// 追加の色: 明るい木のフローリング(明・中・目地)、テラコッタ(明・濃い)、セージ(明・濃い)、銅色のガラス、紺グレーの壁
Object.assign(PAL, { '0': '#e9d4ad', '9': '#dfc79e', '-': '#c7a87b', ';': '#c4815f', ',': '#9b5e47', ':': '#8a9d90', '|': '#66796d', '"': '#cf8a4a', '`': '#4d5868', '?': '#c9979b', '_': '#a26f76', '/': '#c9a24c' }); // ? _ = ティーサロンのくすんだローズ(明・濃い)、/ = ケーキスタンドの落ち着いた金
Object.assign(DARK, { '0': '-', '9': '-', '-': 'c', ';': ',', ',': 'e', ':': '|', '|': 'k', '"': ',', '`': 'k', '?': '_', '_': 'e', '/': 'I' });
// パレットの表は、好きな色(128番より後ろ。sprites.jsのcolorChar)が増えたぶんだけ大きくする。DK=影の色(好きな色は自分のまま)
let DK = new Uint8Array(128), PAL_N = 0;
for (const k in PAL) DK[cc(k)] = cc(DARK[k] || k);
// lit=照明あり / dim=夜に人のいない区画 / out=屋外
const RGBA = { lit: new Uint32Array(128), dim: new Uint32Array(128), out: new Uint32Array(128) };
let CUR_SKY = {};
function buildPalettes() {
  PAL_N = palState.n;
  const size = 128 + PAL_N;
  if (DK.length < size) { const d = new Uint8Array(size); d.set(DK); for (let i = DK.length; i < size; i++) d[i] = i; DK = d; }
  if (RGBA.lit.length < size) for (const m of ['lit', 'dim', 'out']) RGBA[m] = new Uint32Array(size);
  const sky = Object.assign({}, SKY[TIME]);
  const swx = (TIME === 'night' ? SKY_WX_NIGHT : SKY_WX)[WEATHER];
  if (swx) { sky.x = mixHex(sky.x, swx[0], swx[1]); sky.z = mixHex(sky.z, swx[0], swx[1] * 0.6); }
  CUR_SKY = sky;
  for (const mode of ['lit', 'dim', 'out']) {
    for (const k in PAL) {
      let hex = k === 'L' ? SKYLIGHT[TIME][0] : k === 'M' ? SKYLIGHT[TIME][1] : PAL[k];
      if (k === 'x' || k === 'z' || k === 'i') hex = sky[k];
      else if (k !== '*') { hex = tint(hex, LIGHT[TIME][mode]); if (mode === 'out' && WX_OUT[WEATHER]) hex = tint(hex, WX_OUT[WEATHER]); }
      RGBA[mode][cc(k)] = toU32(hex);
    }
  }
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ============================================================
   アイソメ: 1タイル=16単位。画面 x=X-Y, y=(X+Y)/2-Z
   ============================================================ */
const T = 16, WH = 42, WT = 4, SLAB = 8;
// 座標はワールド単位(床・部屋・壁は16単位のマス)。画面x=X-Y, y=(X+Y)/2-Z。表示のときに画面全体を左右反転する(=90度回転と同じで、鏡像にはならない)
// 描く範囲は全階の部屋のrectsを合わせたもの(負の座標もよい)。階は同じ座標に1階ずつ描く
const MAP = config.map;
const FLOORS = MAP.floors;
const ALL_RECTS = FLOORS.flatMap(f => f.rooms.flatMap(r => r.rects));
const XB = Math.min(...ALL_RECTS.map(q => q[0])), YA = Math.min(...ALL_RECTS.map(q => q[1])), XE = Math.max(...ALL_RECTS.map(q => q[2])), YE = Math.max(...ALL_RECTS.map(q => q[3]));
const FW = XE - XB, FH = YE - YA; // 床の配列の大きさ
const fIdx = (X, Y) => (Y - YA) * FW + X - XB;
const GZ = 112; // 下の階から地面まで(パンできる範囲の余白)
const FLOOR_H = 56; // 1階ぶんの高さ(雨・雪のずれに使う)
const MARG = 16;
const OFFICE_OX = YE - XB + WT + MARG, OFFICE_OY = 60 + MARG - ((XB + YA) >> 1);
const OFFICE_W = OFFICE_OX + XE - YA + WT + MARG, OFFICE_H = OFFICE_OY + ((XE + YE) >> 1) + SLAB + MARG;
// 全階の外接矩形(カメラの「全体」用)
const BOX = { x0: OFFICE_OX + XB - YE - WT, x1: OFFICE_OX + XE - YA + WT, y0: OFFICE_OY + ((XB + YA) >> 1) - WH - 8, y1: OFFICE_OY + ((XE + YE) >> 1) + SLAB };
// 描き込み先
let OX, OY, CW, CH, L, LZ, FB, ZB;
const makeTarget = (ox, oy, w, h) => ({ ox, oy, w, h, L: new Uint16Array(w * h), LZ: new Uint8Array(w * h), FB: new Uint16Array(w * h), ZB: new Uint8Array(w * h) });
let bx0, by0, bx1, by1;
let CUR_T = null;
// 描く範囲(画素。x0・y0は含む、x1・y1は含まない)。既定は画面ぜんぶ。renderWorldが見える所だけに絞る
let CX0 = 1, CY0 = 1, CX1 = 1, CY1 = 1;
function setTarget(t) { CUR_T = t; OX = t.ox; OY = t.oy; CW = t.w; CH = t.h; CX0 = 1; CY0 = 1; CX1 = CW - 1; CY1 = CH - 1; L = t.L; LZ = t.LZ; FB = t.FB; ZB = t.ZB; bx0 = CW; by0 = CH; bx1 = -1; by1 = -1; }
const OFFICE = makeTarget(OFFICE_OX, OFFICE_OY, OFFICE_W, OFFICE_H);
setTarget(OFFICE);
// TR: 置き物を転置(x↔yを入れ替え=画面の鏡像)で描いているあいだの原点[x,y]。PX・PY・wpが座標を入れ替え、boxは左右の面の色を入れ替えて明るさの向きを保つ。それ以外はnull
let TR = null;
const trX = (X, Y) => TR[0] + Y - TR[1], trY = (X, Y) => TR[1] + X - TR[0];
const PX = (X, Y) => (TR ? OX + trX(X, Y) - trY(X, Y) : OX + X - Y), PY = (X, Y, Z) => (TR ? OY + ((trX(X, Y) + trY(X, Y)) >> 1) - Z : OY + ((X + Y) >> 1) - Z);
const MIRF = { SE: 'SW', SW: 'SE', NE: 'NW', NW: 'NE' };
const tf = f => (TR ? MIRF[f] : f);
let CUR_AREA = 254;
let GHOST = false; // trueのあいだに確定する画素は市松に間引く(離席中の人を半分すけて見せる)
function lp(x, y, c) {
  x = Math.round(x); y = Math.round(y); // 歩く人は小数の位置を持つので、ここで画素にそろえる
  if (x < CX0 || y < CY0 || x >= CX1 || y >= CY1 || !c) return;
  const i = y * CW + x;
  L[i] = c; LZ[i] = CUR_AREA;
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
}
const wp = (X, Y, Z, c) => lp(PX(X, Y), PY(X, Y, Z), c);
// マウスを重ねている人(id)。drawPerson・drawStandingがOL2を立て、次のflushで輪郭の外にもう1周、明るい色を足す(絵の形に沿ったホバーの枠)
let HOVER_PID = null, OL2 = null;
function ring(x0, y0, x1, y1, KK) {
  const marks = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * CW + x; if (!L[i] && (L[i - 1] || L[i + 1] || L[i - CW] || L[i + CW])) marks.push(i); }
  for (const i of marks) { L[i] = KK; LZ[i] = CUR_AREA; }
}
// レイヤーを確定。ol=trueなら外側に1pxの輪郭線
function flush(ol = true, oc = 'K') {
  if (bx1 < 0) return;
  const o2 = ol ? OL2 : null, g = o2 ? 2 : 1; OL2 = null;
  const x0 = Math.max(0, bx0 - g), x1 = Math.min(CW - 1, bx1 + g), y0 = Math.max(0, by0 - g), y1 = Math.min(CH - 1, by1 + g);
  if (ol) { ring(x0, y0, x1, y1, cc(oc)); if (o2) ring(x0, y0, x1, y1, cc(o2)); }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * CW + x; if (L[i]) { if (!GHOST || ((x + y) & 1)) { FB[i] = L[i]; ZB[i] = LZ[i]; } L[i] = 0; } }
  bx0 = CW; by0 = CH; bx1 = -1; by1 = -1;
}
// 描きかけのレイヤーを捨てる(プラグインの絵が途中で投げたとき)
function discardLayer() { for (let y = Math.max(0, by0); y <= by1; y++) for (let x = Math.max(0, bx0); x <= Math.min(CW - 1, bx1); x++) L[y * CW + x] = 0; bx0 = CW; by0 = CH; bx1 = -1; by1 = -1; }
// 描きかけのレイヤーのx0〜x1列で、yTop(x) 行から下を消す。先に描いた物が手前にある(描く順と前後が逆の)所だけに使う
function hideL(x0, x1, yTop) { for (let x = Math.max(x0, bx0); x <= Math.min(x1, bx1); x++) for (let y = Math.max(by0, yTop(x)); y <= by1; y++) L[y * CW + x] = 0; }
// 箱: 上=明 / 左面(+Y向き)=中 / 右面(+X向き)=暗。eは上辺のハイライト色
function box(X0, Y0, Z0, X1, Y1, Z1, t, l, r, e) {
  if (TR) [l, r] = [r, l];
  const ct = cc(t), cl = cc(l), cr = cc(r), ce = e ? cc(e) : 0;
  for (let X = X0; X < X1; X++) for (let Y = Y0; Y < Y1; Y++) wp(X, Y, Z1, ct);
  for (let X = X0; X <= X1; X++) for (let Z = Z0; Z <= Z1; Z++) wp(X, Y1, Z, (Z === Z1 && ce) ? ce : cl);
  for (let Y = Y0; Y < Y1; Y++) for (let Z = Z0; Z <= Z1; Z++) wp(X1, Y, Z, (Z === Z1 && ce) ? ce : cr);
}
const mc = (map, ch) => cc((map && map[ch]) || ch);
function paintL(Yp, X0, Zt, rows, map) { for (let v = 0; v < rows.length; v++) { const row = rows[v]; for (let u = 0; u < row.length; u++) { const ch = row[u]; if (ch !== '.') wp(X0 + u, Yp, Zt - v, mc(map, ch)); } } }
function paintR(Xp, Yl, Zt, rows, map) { for (let v = 0; v < rows.length; v++) { const row = rows[v]; for (let u = 0; u < row.length; u++) { const ch = row[u]; if (ch !== '.') wp(Xp, Yl - u, Zt - v, mc(map, ch)); } } }
function spr(x, y, rows, map, flip) { for (let v = 0; v < rows.length; v++) { const row = rows[v], n = row.length; for (let u = 0; u < n; u++) { const ch = row[flip ? n - 1 - u : u]; if (ch !== '.') lp(x + u, y + v, mc(map, ch)); } } }
// 葉っぱの塊(左上が明るく右下が暗い丸を重ねる)
function canopy(cx, cy, blobs, cols) {
  const [c1, c2, c3] = cols || ['p', 'q', 'r'];
  for (const [dx, dy, r] of blobs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + r) continue;
      const s = (x + y) / r;
      lp(cx + dx + x, cy + dy + y, cc(s < -0.6 ? c1 : (s > 0.5 ? c3 : c2)));
    }
  }
}

/* ============================================================
   小物。置き物の一覧(階ごとのobjs)から呼ぶ。描くだけで、一覧には足さない
   引数はワールド座標。X,Y=足もとの範囲の小さいほうの角、Z=床からの高さ
   dir=正面(扉・画面・取っ手のある面)が向く方向 'x+'|'x-'|'y+'|'y-'。カメラに見えるのは +X と +Y の面なので、
   x- / y- のときは背面と側面を描く
   大きさの「幅×奥行」は正面から見た幅と奥行き。dir が y± なら X方向に幅・Y方向に奥行、x± なら X方向に奥行・Y方向に幅
   ============================================================ */
// 正面を手前にした局所座標(w=正面の幅の方向、d=正面から奥へ)→ワールド。dirが変わっても同じ形を回して置ける
function propFrame(X, Y, W, D, dir) {
  const ax = dir[0] === 'x', p = dir[1] === '+';
  const rect = (w0, d0, w1, d1) => (ax ? (p ? [X + D - d1, Y + W - w1, X + D - d0, Y + W - w0] : [X + d0, Y + w0, X + d1, Y + w1])
    : (p ? [X + w0, Y + D - d1, X + w1, Y + D - d0] : [X + W - w1, Y + d0, X + W - w0, Y + d1]));
  return {
    p, // 正面がカメラ側(手前はdの小さいほう)。falseなら手前はdの大きいほう
    rs: dir === 'y+' || dir === 'x-', // 見える側面と手前がwの大きいほう
    // 箱。l=+Y向きの面の色。+X向きの面はその1段暗い色(DARK)
    bx(w0, d0, z0, w1, d1, z1, t, l, e) { const [x0, y0, x1, y1] = rect(w0, d0, w1, d1); box(x0, y0, z0, x1, y1, z1, t, l, String.fromCharCode(DK[cc(l)]), e); },
    // 正面(d=箱のd0)か背面(d=箱のd1)に1画素。+X向きの面では1段暗くする(lit=明かりなので暗くしない)
    face(d, w, z, ch, lit) { const c = ax && !lit ? DK[cc(ch)] : cc(ch); if (ax) wp(p ? X + D - d : X + d, p ? Y + W - 1 - w : Y + w, z, c); else wp(p ? X + w : X + W - 1 - w, p ? Y + D - d : Y + d, z, c); },
    // 見える側面(w=箱の端。rsならw1、でなければw0)に1画素。dは奥行のマス
    side(w, d, z, ch) { if (ax) wp(p ? X + D - 1 - d : X + d, p ? Y + W - w : Y + w, z, cc(ch)); else wp(p ? X + w : X + W - w, p ? Y + D - 1 - d : Y + d, z, DK[cc(ch)]); },
    // 上の面に1画素(w・dともマス)
    top(w, d, z, ch) { if (ax) wp(p ? X + D - 1 - d : X + d, p ? Y + W - 1 - w : Y + w, z, cc(ch)); else wp(p ? X + w : X + W - 1 - w, p ? Y + D - 1 - d : Y + d, z, cc(ch)); },
    pt(w, d) { return ax ? (p ? [X + D - d, Y + W - w] : [X + d, Y + w]) : (p ? [X + w, Y + D - d] : [X + W - w, Y + d]); },
  };
}
// 小さいランプの点滅(animTは描くたびに進む)。場所ごとにずらす
const propBlink = (a, b, k) => (animT + a * 5 + b * 3 + k) % (3 + (a + b + k) % 4) < 2;

// 1. 電子レンジのラック(幅18×奥行12・高さ26): 白いスチールの2段ラック、上に電子レンジ、下の段に段ボールと水のボトル
function drawMicrowaveRack(X, Y, dir) {
  const f = propFrame(X, Y, 18, 12, dir), near = [f.rs ? 17 : 0, f.p ? 0 : 11];
  const post = (w, d) => f.bx(w, d, 0, w + 1, d + 1, 16, 'W', 'l');
  const shelf = z => { f.bx(0, 0, z, 18, 12, z + 1, 'W', 'l'); for (let w = 0; w < 18; w++) for (let d = 0; d < 12; d++) if (w % 3 === 1 || d % 3 === 1) f.top(w, d, z + 1, 'l'); };
  for (const [w, d] of [[0, 0], [17, 0], [0, 11], [17, 11]]) if (w !== near[0] || d !== near[1]) post(w, d);
  flush();
  shelf(3); flush();
  const items = [() => { f.bx(2, 3, 4, 9, 10, 10, 'b', 'c'); for (let d = 3; d < 10; d++) f.top(5, d, 10, 'a'); }, // 段ボール
    () => { for (const w of [11, 14]) { f.bx(w, 5, 4, w + 2, 7, 11, 'G', 'H'); f.bx(w, 5, 11, w + 1, 6, 12, 'B', 'B'); } }]; // 水のボトル2本
  (f.rs ? items : items.slice().reverse()).forEach(g => { g(); flush(); });
  post(near[0], near[1]); flush();
  shelf(15); flush();
  f.bx(1, 1, 16, 17, 11, 26, 'W', 'V', 'W'); flush(); // 電子レンジ
  if (f.p) {
    for (let w = 2; w < 12; w++) for (let z = 18; z < 25; z++) f.face(1, w, z, z === 24 || w === 2 ? 'n' : (w - z + 30) % 9 === 0 ? 'n' : 'k'); // 扉の窓と映り込み
    for (let z = 18; z < 25; z++) f.face(1, 12, z, 'U'); // 扉と操作部の境目
    for (let w = 13; w < 16; w++) f.face(1, w, 24, 'K'); f.face(1, 14, 24, 'q', true); // 表示
    for (const z of [22, 20]) { f.face(1, 13, z, 'm'); f.face(1, 15, z, 'm'); }
  } else for (let w = 4; w < 14; w += 2) for (let z = 21; z < 25; z++) f.face(11, w, z, 'U'); // 背面の通気
  for (let d = 3; d < 9; d++) for (const z of [21, 23]) f.side(f.rs ? 17 : 1, d, z, 'U'); // 側面の通気
  flush(false);
}

// 2. 冷蔵庫(14×14・高さ22): 白い2ドアの小さい冷蔵庫
function drawFridge(X, Y, dir) {
  const f = propFrame(X, Y, 14, 14, dir);
  f.bx(0, 0, 0, 14, 14, 22, 'W', 'V', 'W'); flush();
  if (f.p) {
    for (let w = 1; w < 13; w++) { f.face(0, w, 14, 'U'); f.face(0, w, 1, 'U'); } // 2ドアの境目・下の通気
    for (let z = 16; z < 20; z++) f.face(0, 11, z, 'm');
    for (let z = 8; z < 13; z++) f.face(0, 11, z, 'm'); // 取っ手
    for (const [w, z, c] of [[3, 19, 'R'], [6, 18, 'Y'], [2, 10, 'B']]) for (const [dw, dz] of [[0, 0], [1, 0], [0, -1], [1, -1]]) f.face(0, w + dw, z + dz, c, true); // マグネット
  } else for (let w = 2; w < 12; w++) for (let z = 2; z < 13; z++) if (z % 2 === 0 || w % 3 === 2) f.face(14, w, z, 'U'); // 背面の放熱の網
  flush(false);
}

// 3. グラスの棚(len×6・高さ6。axis 'x' ならX方向にlen): カウンターの裏。黒い細い板に透明なグラスを2列(奥・手前)。Z=板の下の高さ
const GLASS_SPR = [['HWH', 'W.H', 'WGH', 'HHH'], ['HWH', 'WGH', '.H.', '.H.', 'HHH'], ['HWH', 'W.H', 'W.H', 'WGH', 'HHH']]; // タンブラー・ワイングラス・背の高いグラス
function drawGlassRack(X, Y, len, axis, Z = 0) {
  const f = propFrame(X, Y, len, 6, axis === 'x' ? 'y+' : 'x+');
  f.bx(0, 0, Z, len, 6, Z + 1, 'n', 'k', 'm'); flush();
  for (const [d, w0] of [[4.5, 2], [1.5, 4]]) {
    for (let w = w0, i = 0; w < len - 1; w += 4, i++) { const s = GLASS_SPR[(i + (w0 >> 1)) % 3], [gx, gy] = f.pt(w, d); sprAt(gx, gy, Z + 1, s, 1, s.length - 1); }
    flush(false);
  }
}

// 4. エアコンの室外機(1台 幅18×奥行8・高さ14をaxisの方向にn台)。丸いファンの格子はカメラ側(axis 'x' なら +Y、'y' なら +X)
function drawACUnits(X, Y, n, axis) {
  const f = propFrame(X, Y, 18 * n, 8, axis === 'x' ? 'y+' : 'x+');
  for (let k = 0; k < n; k++) {
    const w0 = (f.rs ? k : n - 1 - k) * 18; // 奥の台から
    f.bx(w0 + 2, 1, 0, w0 + 4, 7, 1, 'n', 'n'); f.bx(w0 + 14, 1, 0, w0 + 16, 7, 1, 'n', 'n'); flush(); // 脚
    f.bx(w0, 0, 1, w0 + 18, 8, 14, 'f', 'g', 'f'); flush();
    for (let w = w0; w < w0 + 13; w++) for (let z = 2; z < 14; z++) {
      const r = Math.hypot(w + 0.5 - (w0 + 6.5), z - 7.5);
      if (r <= 5.8) f.face(0, w, z, r > 4.9 ? 'h' : r < 1.2 ? 'U' : z % 2 ? 'n' : 'k'); // ファンの格子(外周・中心・横の桟)
    }
    for (let z = 2; z < 13; z++) f.face(0, w0 + 13, z, 'h');
    for (let w = w0 + 14; w < w0 + 17; w++) { f.face(0, w, 4, 'h'); f.face(0, w, 3, 'h'); } // 配管のカバー
    for (let d = 1; d < 7; d++) for (const z of [5, 7, 9, 11]) f.side(f.rs ? w0 + 18 : w0, d, z, 'h'); // 側面の吸い込み口
    flush(false);
  }
}

// 5. ロッカー(1列 幅10×奥行12・高さ40をaxisの方向にn列)。dirはaxisと直角の向きで、使うのは + か - だけ
// 7. 掃除用具入れ(幅10×奥行10・高さ40): 細い1枚扉で上に通気の切れ込みが多い
function steelLocker(X, Y, n, D, dir, vents) {
  const W = n * 10, H = 40, f = propFrame(X, Y, W, D, dir);
  f.bx(0, 0, 0, W, D, H, 'W', 'l'); flush();
  for (let i = 1; i < n; i++) for (let d = 0; d < D; d++) f.top(i * 10, d, H, 'l'); // 列のつなぎ目
  if (f.p) for (let i = 0; i < n; i++) {
    const w0 = i * 10;
    for (let w = w0; w < w0 + 10; w++) { f.face(0, w, 0, 'n'); f.face(0, w, 1, 'n'); f.face(0, w, H - 2, 'm'); } // 台・扉の上の縁
    for (let z = 2; z < H - 1; z++) f.face(0, w0, z, 'm'); // 扉のすき間
    for (const z of vents) for (let w = w0 + 3; w < w0 + 7; w++) f.face(0, w, z, 'n'); // 通気の切れ込み
    for (let z = 18; z < 22; z++) f.face(0, w0 + 8, z, 'k'); f.face(0, w0 + 8, 23, 'm'); // 取っ手と鍵穴
  } else for (let i = 1; i < n; i++) for (let z = 0; z < H; z++) f.face(D, i * 10, z, 'm');
  flush(false);
}
function drawCleaningLocker(X, Y, dir) { steelLocker(X, Y, 1, 10, dir, [36, 34, 32, 30, 28, 6]); }

// 6. 19インチラック(幅14×奥行18・高さ42): 黒い枠に機器を下から積む。緑・橙のランプはanimTで点滅
function drawRackServer(X, Y, dir) {
  const f = propFrame(X, Y, 14, 18, dir);
  f.bx(0, 0, 0, 14, 18, 42, 'n', 'k', 'n'); flush();
  for (let d = 3; d < 16; d += 3) for (let w = 3; w < 11; w++) f.top(w, d, 42, 'k'); // 天板の通気
  const lamp = (d, w, z, on, off) => f.face(d, w, z, propBlink(w, z, d) ? on : off, true);
  if (f.p) {
    for (let w = 1; w < 13; w++) for (let z = 2; z < 40; z++) f.face(0, w, z, 'K'); // 空き(奥が暗い)
    for (const w of [1, 12]) for (let z = 3; z < 39; z += 2) f.face(0, w, z, 'n'); // 取り付け穴
    // [下のZ, 高さ, 種類]
    for (const [z0, h, k] of [[2, 6, 'ups'], [10, 5, 'srv'], [15, 5, 'srv'], [22, 2, 'patch'], [24, 3, 'sw'], [28, 3, 'srv1'], [31, 3, 'srv1']]) {
      for (let w = 2; w < 12; w++) for (let z = z0; z < z0 + h; z++) f.face(0, w, z, z === z0 + h - 1 ? 'm' : z === z0 ? 'k' : 'n');
      if (k === 'ups') { for (let w = 4; w < 8; w++) f.face(0, w, z0 + 3, 'G', true); lamp(0, 9, z0 + 3, 'p', 'p'); }
      else if (k === 'patch') { for (let w = 3; w < 11; w += 2) f.face(0, w, z0, 'l'); }
      else if (k === 'sw') { for (let w = 3; w < 11; w++) { f.face(0, w, z0 + 1, w % 2 ? 'K' : 'k'); if (w % 2) lamp(0, w, z0 + 2, 'p', 'r'); } }
      else {
        lamp(0, 3, z0 + h - 2, 'p', 'p'); lamp(0, 4, z0 + 1, 'O', 'd'); // 電源(つきっぱなし)・アクセス
        for (let w = 6; w < 11; w += 2) for (let z = z0 + 1; z < z0 + h - 1; z++) f.face(0, w, z, 'm'); // ディスクの段
      }
    }
  } else {
    for (let w = 1; w < 13; w++) for (let z = 2; z < 40; z++) f.face(18, w, z, (w + z) % 2 ? 'K' : 'k'); // 背面の扉(パンチング)
    for (let z = 4; z < 38; z++) { f.face(18, 9, z, 'B'); f.face(18, 10, z, (z >> 2) % 2 ? 'Y' : 'B'); } // ケーブルの束
    for (let z = 6; z < 36; z += 4) { f.face(18, 3, z, 'm'); lamp(18, 5, z, 'p', 'r'); } // 電源タップ・リンクのランプ
  }
  flush(false);
}

// 8. 立てる仕切り板(len×2・高さh。axis 'x' ならX方向にlen)。style 'frost'=すりガラス(向こうが少し透ける) / 'white'=白いパネル
function drawPanel(X, Y, len, axis, h, style) {
  const f = propFrame(X, Y, len, 2, axis === 'x' ? 'y+' : 'x+');
  f.bx(0, 0, 0, len, 2, 1, 'm', 'n'); flush();
  if (style === 'frost') {
    for (let w = 2; w < len - 2; w++) for (let z = 1; z < h - 1; z++) { if ((w + z) % 2 === 0) f.face(0, w, z, 'G', true); else if ((w * 3 + z) % 7 === 0) f.face(0, w, z, 'W', true); } // ガラスは向きで暗くしない(既存のガラスの壁と同じ)
    flush(false);
    if (len >= 16 && h >= 16) { const [gx, gy] = f.pt(len * 0.35, 0); glintAt(PX(gx, gy), PY(gx, gy, Math.round(h * 0.6))); flush(false); } // 映り込み
  } else {
    f.bx(2, 0, 1, len - 2, 2, h - 1, 'W', 'V'); flush(true, 'U');
    for (let w = 2; w < len - 2; w++) f.face(0, w, Math.round(h / 2), 'U'); // 真ん中の継ぎ目
    flush(false);
  }
  f.bx(0, 0, 1, 2, 2, h, 'W', 'l'); f.bx(len - 2, 0, 1, len, 2, h, 'W', 'l'); f.bx(0, 0, h - 1, len, 2, h, 'W', 'l'); flush(true, 'n'); // アルミの枠
}

/* ============================================================
   机の上のパソコン(きせかえ)。Z=机の天板の高さ(省略は12。島の机と同じ)。dir=画面が向く方向(座る人のほう)。on=画面がついている(省略はつく。空席は false)
   画面は monitor と同じ screenFace で描く
   ============================================================ */
// ノートPC(幅10×奥行8・画面の高さ7)。'mac'=銀色で薄い(縁も天板も銀) / 'win'=黒〜濃いグレー。画面の裏(天板)の色でどちらか分かる
function drawLaptop(X, Y, kind, dir, Z = 12, on = true) {
  const f = propFrame(X, Y, 10, 8, dir), mac = kind === 'mac';
  f.bx(0, 0, Z, 10, 7, Z + 1, mac ? 'l' : 'n', mac ? 'l' : 'k', mac ? 'W' : 'm'); flush(); // 本体
  for (let w = 1; w < 9; w++) for (let d = 3; d < 6; d++) f.top(w, d, Z + 1, mac ? 'n' : 'k'); // キーボード
  for (let w = 3; w < 7; w++) for (let d = 0; d < 2; d++) f.top(w, d, Z + 1, mac ? 'V' : 'm'); // タッチパッド
  flush(false);
  f.bx(0, 7, Z + 1, 10, 8, Z + 8, mac ? 'W' : 'n', mac ? 'l' : 'k', mac ? 'W' : 'n'); flush(); // 画面(裏が天板)
  if (f.p) {
    for (let w = 0; w < 10; w++) for (let z = Z + 1; z < Z + 8; z++) f.face(7, w, z, 'k', true); // 黒い縁
    screenFace((u, v, c) => f.face(7, 1 + u, Z + 2 + v, String.fromCharCode(c), true), 8, 5, on);
  }
}
// 外部モニター(1枚 幅12×奥行6・高さ13。n=2は幅の方向に並べる)。黒い枠と細いスタンド。パネルは足もとの奥側(奥行3〜5)に寄せてある
function drawExtMonitor(X, Y, n, dir, Z = 12, on = true) {
  const f = propFrame(X, Y, 12 * n, 6, dir);
  for (let k = 0; k < n; k++) {
    const w0 = (f.rs ? k : n - 1 - k) * 12, c = w0 + 6;
    f.bx(c - 3, 1, Z, c + 3, 6, Z + 1, 'n', 'n'); flush(); // 台座
    f.bx(c - 1, 4, Z + 1, c + 1, 6, Z + 6, 'n', 'n'); flush(); // 首(手前のノートPCの画面に下の段が隠れない高さ)
    f.bx(w0 + 1, 3, Z + 6, w0 + 11, 5, Z + 13, 'k', 'k', 'n'); flush(true, 'K'); // パネル
    if (f.p) screenFace((u, v, ch) => f.face(3, w0 + 2 + u, Z + 7 + v, String.fromCharCode(ch), true), 8, 6, on);
  }
}
// 外付けキーボード。分割型は左右を別々に描き、輪郭の間にも机が見えるようにする。
function drawKeyboard(X, Y, kind, dir, Z) {
  const f = propFrame(X, Y, 12, 6, dir), colorful = kind === 'colorful';
  if (kind === 'split') {
    f.bx(0, 1, Z, 4, 6, Z + 1, 'n', 'k'); flush();
    f.bx(8, 0, Z, 12, 5, Z + 1, 'n', 'k'); flush();
    for (const [w, d] of [[1, 2], [3, 2], [1, 4], [3, 4], [8, 1], [10, 1], [8, 3], [10, 3]]) f.top(w, d, Z + 1, 'l');
    f.top(3, 1, Z + 1, 'W'); f.top(8, 0, Z + 1, 'W'); // 親指キー
  } else {
    f.bx(0, 0, Z, 12, 6, Z + 1, colorful ? 'l' : 'k', colorful ? 'm' : 'K'); flush();
    for (const d of [2, 4]) for (let w = 1; w < 12; w += 2) {
      const key = colorful ? (w === 1 && d === 4 ? 'Y' : w === 5 ? 'p' : w === 9 ? 'B' : 'W') : 'l';
      f.top(w, d, Z + 1, key);
    }
    for (let w = 4; w <= 8; w++) f.top(w, 1, Z + 1, colorful ? 'W' : 'l'); // スペースバー
  }
  flush(false);
}
// HUDの選択肢の絵(13×13。spriteCanvas / iconCanvasで描く。輪郭線は描くときに付く)
const PC_ICONS = {
  mac: ['.............', '.............', '..lllllllll..', '..lGGGGGGGl..', '..lGmmmmGGl..', '..lGGGGGGGl..', '..lGmmmGGGl..', '..lBBBBBBBl..', '..lllllllll..', '.WWWWWWWWWWW.', '.lllllllllll.', '.............', '.............'],
  win: ['.............', '.............', '..kkkkkkkkk..', '..kGGGGGGGk..', '..kGmmmmGGk..', '..kGGGGGGGk..', '..kGmmmGGGk..', '..kBBBBBBBk..', '..kkkkkkkkk..', '.mmmmmmmmmmm.', '.nnnnnnnnnnn.', '.............', '.............'],
  mon1: ['.............', '.kkkkkkkkkkk.', '.kGGGGGGGGGk.', '.kGmmmmGGGGk.', '.kGGGGGGGGGk.', '.kGmmmGGGGGk.', '.kGGGGGGGGGk.', '.kBBBBBBBBBk.', '.kkkkkkkkkkk.', '.....nnn.....', '.....nnn.....', '...nnnnnnn...', '.............'],
  mon2: ['.............', '.............', '.kkkkk.kkkkk.', '.kGGGk.kGGGk.', '.kGmGk.kGmmk.', '.kGGGk.kGGGk.', '.kGmmk.kGmGk.', '.kBBBk.kBBBk.', '.kkkkk.kkkkk.', '...n.....n...', '...n.....n...', '..nnn...nnn..', '.............'],
  colorful: ['.............', '.............', '.............', '.mmmmmmmmmmm.', '.mYmWmpmBmWm.', '.mmmmmmmmmmm.', '.mWmWmpmBmWm.', '.mmmmmmmmmmm.', '.mmmWWWWWmmm.', '.mmmmmmmmmmm.', '.............', '.............', '.............'],
  dark: ['.............', '.............', '.............', '.kkkkkkkkkkk.', '.klklklklklk.', '.kkkkkkkkkkk.', '.klklklklklk.', '.kkkkkkkkkkk.', '.kkklllllkkk.', '.kkkkkkkkkkk.', '.............', '.............', '.............'],
  split: ['.............', '.nnnn........', '.nlmn...nnnn.', '.nnnn...nlmn.', '.nlmn...nnnn.', '.nnnn...nlmn.', '..nWn...nnnn.', '.........nWn.', '.............', '.............', '.............', '.............', '.............'],
};

/* ============================================================
/* ============================================================
   階・部屋・床・壁・席。マップのfloors[0]が最下階。見る階は1つ(FLOOR)で、どの階も同じ座標に描く
   ============================================================ */
// rects: 部屋の範囲(ワールド座標 [X0,Y0,X1,Y1))。sign: 表札の位置 [X,Y,Z] と付け方(wallY=壁から吊る / floor=床に立てる)。floor: 床の柄(catalog.jsのFLOOR_KINDS。省略は部屋の種類ごとの既定)
const roomOf = r => ({ id: r.id, name: r.name, kind: r.kind, rects: r.rects, out: !!r.outdoor, floor: r.floor || (r.outdoor ? 'deck' : DEFAULT_FLOOR[r.kind]) || 'carpet-tile', ...(r.sign && { sign: [r.sign[0], r.sign[1], r.signZ || 0], mount: r.signMount === 'wall' ? 'wallY' : 'floor', wallY: r.sign[1] }) });
const inRect = (X, Y, q) => X >= q[0] && X < q[2] && Y >= q[1] && Y < q[3];
const md = (a, n) => ((a % n) + n) % n;
// 床の柄。座標は絶対値(マップの範囲が変わっても柄は動かない)。返すのはパレットの1文字
const FLOOR_FN = {
  'carpet-tile': (X, Y) => { const lx = md(X, 16), ly = md(Y, 16); return lx === 0 || ly === 0 ? 'n' : (((X >> 4) + (Y >> 4)) & 1 ? lx % 3 === 1 : ly % 3 === 1) ? 'm' : 'Z'; }, // 16のタイルを縦横交互の目で敷く
  carpet: (X, Y) => (md(X * 7 + Y * 5, 19) === 0 ? 'h' : 'g'),
  'carpet-stripe': (X, Y) => ((Y >> 2) & 1 ? 'r' : 'm'),
  stone: (X, Y) => (md(X * 5 + Y * 3, 13) === 0 || md(X * 3 + Y * 7, 17) === 0 ? 'm' : 'l'),
  wood: (X, Y) => ((Y & 7) === 7 || ((X + md((Y >> 3) * 23, 64)) & 63) === 0 ? 'b' : 'a'), // 幅8の板をXの向きに張る。継ぎ目は列ごとにずらす
  parquet: (X, Y) => { const row = Math.floor(Y / 6), off = md(row * 37, 56), k = Math.floor((X + off) / 56); return md(Y, 6) === 5 || md(X + off, 56) === 0 ? '-' : md(row * 13 + k * 7, 9) < 3 || md(X * 7 + Y * 3 + k, 29) === 0 ? '9' : '0'; }, // 幅6の板。板ごとに少し色を変える
  checker: (X, Y) => (((X >> 3) + (Y >> 3)) & 1 ? 'W' : 'V'),
  tile: (X, Y) => (md(X, 16) === 15 || md(Y, 16) === 15 ? 'V' : 'W'),
  'tile-blue': (X, Y) => ((X & 7) === 7 || (Y & 7) === 7 ? 'H' : 'G'),
  deck: (X, Y) => (md(Y, 6) === 0 ? 'n' : md(X * 3 + Y, 11) === 0 ? 'U' : 'm'),
};
// 壁(歩けない線と、壁の絵)。扉のところは壁に隙間(gaps)を開ける。壁の位置はすべて8の倍数
const wallsOf = fm => fm.walls.map(w => ({ ...w, gaps: fm.doors.filter(d => d.axis === w.axis && d.at === w.at && d.a >= w.a && d.b <= w.b).map(d => [d.a, d.b]) }));
// 階ごとの部屋・床・壁・扉。areaMap: 床の1マスごとの部屋の番号(夜の明かりの区画。254=部屋の外 / 255は屋外の絵)、floorC: 床の色(0=床なし。床の形は部屋のrectsを合わせたもの)
const FLS = FLOORS.map(fm => {
  const rooms = fm.rooms.map(roomOf);
  const f = { id: fm.id, name: fm.name, fm, rooms, walls: wallsOf(fm), doors: fm.doors.map(d => ({ ...d, k: fm.id + ':' + d.id })), objs: [], ev: 0, areaMap: new Uint8Array(FW * FH).fill(254), floorC: new Uint8Array(FW * FH), outAreas: new Set() };
  rooms.forEach((r, i) => {
    const fn = FLOOR_FN[r.floor] || FLOOR_FN['carpet-tile'], a = Math.min(i + 1, 250); // shortcut: 1階に250室まで(番号がUint8。254・255は予約)
    if (r.out) f.outAreas.add(a);
    for (const q of r.rects) for (let Y = q[1]; Y < q[3]; Y++) for (let X = q[0]; X < q[2]; X++) { const k = fIdx(X, Y); if (f.areaMap[k] === 254) { f.areaMap[k] = a; f.floorC[k] = cc(fn(X, Y)); } }
  });
  return f;
});
const FL = Object.fromEntries(FLS.map(f => [f.id, f]));
const ROOMS = FLS.flatMap(f => f.rooms);
const ROOM_FLOOR = {}, ROOM_BY_ID = {}, AREA_ID = {};
for (const f of FLS) f.rooms.forEach((r, i) => { ROOM_FLOOR[r.id] = f.id; ROOM_BY_ID[r.id] = r; AREA_ID[r.id] = Math.min(i + 1, 250); });
const roomById = id => ROOM_BY_ID[id];
const floorOf = room => ROOM_FLOOR[room];
const floorAtF = (f, X, Y) => X >= XB && X < XE && Y >= YA && Y < YE && f.floorC[fIdx(X, Y)] !== 0;
function areaAt(X, Y, f = FL[FLOOR]) {
  X = Math.round(X); Y = Math.round(Y);
  return f && X >= XB && X < XE && Y >= YA && Y < YE ? f.areaMap[fIdx(X, Y)] : 254;
}
const isIsland = id => roomById(id)?.kind === 'work';
const roomName = (id, from) => (FLS.length > 1 && floorOf(id) !== floorOf(from) ? _t('engine.floorRoom', { floor: FL[floorOf(id)].name, room: roomById(id).name }) : roomById(id).name); // トーストの部屋の名前。from(元の部屋。入室はnull)と階が違えば階を付ける
const doorOpen = {}; for (const f of FLS) for (const d of f.doors) doorOpen[d.k] = 0;

/* ---------- 席。席は置き物のカタログから出す(map.jsのseatsOf)。席の部屋は席の位置を含む部屋。会議室(kind meeting)の席は、席ではなく入室先の椅子と立ち見(MEETS)に使う ---------- */
const DESK_P = 24, DESK_D = 18; // 1席の幅(約1m)・片側の机の奥行き
const ALLSEATS = seatsOf(MAP).map(s => ({ ...s, cx: s.x, cy: s.y, label: s.label || _t('engine.seat.no', { no: s.no }) }));
const HAS_SEATS = new Set(ALLSEATS.map(s => s.room));
const SEATS = ALLSEATS.filter(s => roomById(s.room).kind !== 'meeting');
{ let k = 0; for (const s of SEATS) if (s.type === 'office') s.k = ++k; } // 机の小物を席ごとに変える通し番号
const SEAT_BY_ID = new Map(ALLSEATS.map(s => [s.id, s])); // 会議室の席も引ける(会議室に置いた家具の絵が自分の席を見る)。席の一覧(SEATS)には入れない
// 転置で描いているあいだは、席を絵の向き(転置の前)の座標・向きで返す(絵は転置前の座標で描く)
const nat = st => (TR && st ? { ...st, cx: trX(st.cx, st.cy), cy: trY(st.cx, st.cy), face: MIRF[st.face] } : st);
const seatById = id => nat(SEAT_BY_ID.get(id));
// 絵が使う席。部屋の外に出た席は一覧に無いので、どこにも座っていない席として返す(落ちない)
const dseat = id => seatById(id) || nat({ id, cx: 0, cy: 0, x: 0, y: 0, face: 'SW', type: 'none', k: 0, item: '' });
const seatsOfItem = id => SEATS.filter(st => st.item === id).map(nat);
const CUSTOM_SEATS = new Set(['booth', 'focus', 'egg', 'bench', 'pbooth']); // 家具の絵の中で人も描く席(椅子の物を別に置かない)
let FLOOR = (SEATS.find(s => s.type === 'office' && isIsland(s.room)) || SEATS[0])?.floor || FLS[0].id; // 見る階
if (preview && config.camera && FLS.some(f => f.id === config.camera.floor)) FLOOR = config.camera.floor; // プレビューの描き直しで見ていた階を保つ
// 会議室(いくつでも)。spots=席(椅子と立ち見)、c=椅子の真ん中、plusAt=入りきれない人数「+N」を出す所(扉の外)、inAt=歩いて入る人の行き先(扉の内側)
const MEETS = ROOMS.filter(r => r.kind === 'meeting').map(r => {
  const f = FL[floorOf(r.id)], spots = ALLSEATS.filter(s => s.room === r.id), chairs = spots.filter(s => s.type === 'meet'), q = r.rects[0], mid = [(q[0] + q[2]) >> 1, (q[1] + q[3]) >> 1];
  let door = null;
  for (const [x0, y0, x1, y1] of r.rects) for (const d of f.doors) { const m = (d.a + d.b) / 2; if (!door && d.axis === 'x' && (d.at === y0 || d.at === y1) && m >= x0 && m < x1) door = { x: m, y: d.at, nx: 0, ny: d.at === y0 ? -1 : 1 }; if (!door && d.axis === 'y' && (d.at === x0 || d.at === x1) && m >= y0 && m < y1) door = { x: d.at, y: m, nx: d.at === x0 ? -1 : 1, ny: 0 }; }
  door = door || { x: mid[0], y: q[1], nx: 0, ny: -1 };
  return { id: r.id, room: r, floor: f.id, spots, chairs: chairs.length, c: chairs.length ? [0, 1].map(i => chairs.reduce((a, s) => a + (i ? s.cy : s.cx), 0) / chairs.length) : mid, plusAt: [door.x + door.nx * 24, door.y + door.ny * 24, 30], inAt: { x: door.x - door.nx * 12, y: door.y - door.ny * 12 } };
});
const MEET = Object.fromEntries(MEETS.map(m => [m.id, m]));
const isMeet = id => !!MEET[id];

/* ============================================================
   家具
   ============================================================ */
// 画面の中身(ノートPC・外部モニターが使う)。put(u, v, 色コード)、v=0が下。on=falseなら消えた画面
function screenFace(put, w, h, on) {
  for (let u = 0; u < w; u++) for (let v = 0; v < h; v++) {
    let c = 'K';
    if (on) { c = 'G'; if (v === h - 1) c = 'B'; else if ((v === 3 && u < w - 3) || (v === 1 && u > 1 && u < w - 1)) c = 'm'; }
    else if (u === 1 && v > 2) c = 'n'; // 消えている画面の映り込み
    put(u, v, cc(c));
  }
  flush(false);
}
function sprAt(X, Y, Z, rows, ax, ay, map) { spr(PX(X, Y) - ax, PY(X, Y, Z) - ay, rows, map); }
function steam(x, y, ph) {
  const f = (animT + ph) % 3;
  const pts = [[[0, 0], [1, -2], [0, -4]], [[1, -1], [0, -3], [1, -5]], [[0, -1], [-1, -3], [0, -5]]][f];
  for (const [dx, dy] of pts) lp(x + dx, y + dy, cc('W'));
  flush(false);
}
function deskDeco(X, Y, Z, kind) {
  const s = DECO_SPR[kind]; if (!s) return;
  sprAt(X, Y, Z, s, Math.floor(s[0].length / 2), s.length - 1); flush();
  if (kind === 'mug') steam(PX(X, Y) - 1, PY(X, Y, Z) - 10, 2);
}
function leaveSign(X, Y, Z) { sprAt(X, Y, Z, SIGN, 4, SIGN.length - 1); flush(); }
function mugOnDesk(X, Y, Z, col) { sprAt(X, Y, Z, col === 'w' ? ['.WWW.', 'WWWVV', 'WWVV.', '.VV..'] : ['.RRR.', 'RRRRQ', 'RRRQ.', '.QQ..'], 2, 3); flush(); }
// 机の上の小物(席ごとに少しずつ違う): 白い内線電話・消毒液・卓上扇風機。パソコンは座っている人のきせかえ(deskPC)
function deskPhone(X, Y, Z) { box(X, Y, Z, X + 5, Y + 4, Z + 2, 'W', 'V', 'U'); box(X + 1, Y, Z + 2, X + 5, Y + 1, Z + 3, 'W', 'V', 'U'); flush(); wp(X + 2, Y + 3, Z + 2, cc('m')); flush(false); }
function disinfectant(X, Y, Z) { box(X, Y, Z, X + 2, Y + 2, Z + 5, 'W', 'G', 'H'); box(X, Y, Z + 5, X + 1, Y + 1, Z + 7, 'W', 'W', 'V'); flush(); }
function deskFan(X, Y, Z) { box(X, Y, Z, X + 1, Y + 1, Z + 6, 'W', 'V', 'U'); flush(); sprAt(X, Y, Z + 6, ['.WWW.', 'WlWlW', 'WWkWW', 'WlWlW', '.WWW.'], 2, 4); flush(); }
// パンチングパネル(穴あきの白い卓上仕切り)の上にフィギュア: 「机を飾る」の見本
function punchPanel(X0, Y0, along, Z) {
  if (along === 'x') { box(X0, Y0, Z, X0 + 14, Y0 + 1, Z + 12, 'W', 'W', 'V', 'W'); for (let u = 1; u < 14; u += 2) for (let v = 2; v < 12; v += 2) wp(X0 + u, Y0 + 1, Z + v, cc('U')); }
  else { box(X0, Y0, Z, X0 + 1, Y0 + 14, Z + 12, 'W', 'V', 'W', 'W'); for (let u = 1; u < 14; u += 2) for (let v = 2; v < 12; v += 2) wp(X0 + 1, Y0 + u, Z + v, cc('U')); }
  flush(true, 'U');
  const [fx, fy] = along === 'x' ? [X0 + 3, Y0] : [X0, Y0 + 3];
  for (let i = 0; i < 3; i++) { const x = PX(fx + (along === 'x' ? i * 4 : 0), fy + (along === 'x' ? 0 : i * 4)), y = PY(fx, fy, Z + 12); lp(x, y - 1, cc(['R', 'B', 'Y'][i])); lp(x, y - 2, cc(['R', 'B', 'Y'][i])); lp(x, y - 3, cc('S')); }
  flush(false);
}

// 島の机(片側n席)。机をつなげて向かい合わせ: 白い天板・白い脚・人の側に白い袖机・真ん中に黒い配線トレー(仕切りは飾りが隠れるので置かない)
// u=机の並ぶ向き、v=人の側の机のへりから島の中心線へ。side 0は中心線の手前(-Y/-X)でカメラ側を向く、side 1は背中がカメラ側
function islandFrame(isl, s) {
  const L = isl.n * DESK_P, u0 = (isl.axis === 'x' ? isl.cx : isl.cy) - L / 2, c0 = isl.axis === 'x' ? isl.cy : isl.cx;
  const edge = s === 0 ? c0 - DESK_D : c0 + DESK_D;
  const at = (u, v) => { const w = s === 0 ? edge + v : edge - v; return isl.axis === 'x' ? [u0 + u, w] : [w, u0 + u]; };
  const lbox = (ua, va, ub, vb, z0, z1, t, l, r, e) => { const [x1, y1] = at(ua, va), [x2, y2] = at(ub, vb); box(Math.min(x1, x2), Math.min(y1, y2), z0, Math.max(x1, x2), Math.max(y1, y2), z1, t, l, r, e); };
  return { L, u0, c0, edge, at, lbox };
}
// 机の上のパソコンは座っている人のきせかえ(p.pc='mac'|'win'、p.mon=外部モニター0〜2枚)。空いている机には何も置かない(フリーアドレス)。
// ノートPCを人の側(局所v 1〜9)、外部モニターをその奥(v 9〜15)。corner(u0,v0,u1,v1)=机の局所の範囲→ワールドの小さいほうの角、c=席の真ん中、dir=人のほう
// 離席中(p.away)は画面を消し、机に「離席中」の札(局所sign=[u,v]。省略は机の端のほう。nullなら札なし)を立てる
function deskPC(p, corner, c, dir, Z, sign = [2 * c - 8, 12]) {
  const on = !p.away, mon = p.mon || 0, keyboard = p.keyboard && p.keyboard !== 'none';
  const shift = keyboard ? (dir[1] === '+' ? 7 : -7) : 0;
  const lap = () => drawLaptop(...corner(c - 5 + shift, 1, c + 5 + shift, 9), p.pc || 'mac', dir, Z, on);
  const ext = () => { if (mon) drawExtMonitor(...corner(c - 6 * mon, 9, c + 6 * mon, 15), mon, dir, Z, on); };
  const keys = () => { if (keyboard) { const u = dir[1] === '+' ? c - 11 : c - 1; drawKeyboard(...corner(u, 1, u + 12, 7), p.keyboard, dir, Z); } };
  if (dir[1] === '+') { ext(); lap(); keys(); } else { keys(); lap(); ext(); } // カメラから遠いほうを先に描く
  if (p.away && sign) leaveSign(...corner(sign[0], sign[1], sign[0], sign[1]), Z);
}
// 机でない所(カウンター・会議室のテーブル・ローテーブル)に座った人は、ノートPCだけ持って来て前に置く(外部モニター・飾りは机に置いたまま=出さない。離席中は画面を消す)。X,Y=置く所の小さいほうの角
function carryPC(p, X, Y, dir, Z) { if (p) drawLaptop(X, Y, p.pc || 'mac', dir, Z, !p.away); }
// 長方形の机の局所座標: u=机の幅の向き、v=人の側のへりから奥へ。face=座る人の向き
function deskCorner(face, x0, y0, x1, y1) {
  const at = (u, v) => (face === 'SW' ? [x0 + u, y0 + v] : face === 'NE' ? [x0 + u, y1 - v] : face === 'SE' ? [x0 + v, y0 + u] : [x1 - v, y0 + u]);
  return (u0, v0, u1, v1) => { const [ax, ay] = at(u0, v0), [bx, by] = at(u1, v1); return [Math.min(ax, bx), Math.min(ay, by)]; };
}
const PC_DIR = { SW: 'y-', NE: 'y+', SE: 'x-', NW: 'x+' }; // 座る人の向き → パソコンの正面(人のほう)
function deskExtras(st, put, Z) { // 空いている机の小物。put(dx, dv): 机の上の位置(5x5の小物が机からはみ出さない所)
  if (st.k % 3 === 0) deskPhone(...put(-6, 1), Z); // となりの席(人が座ると小物が端に寄る)とくっつかないよう、席の真ん中寄り
  if (st.k % 5 === 2) disinfectant(...put(7, 1), Z);
  if (st.fan) deskFan(...put(8, 3), Z); // props.fanの席に卓上扇風機
}
function drawIslandSide(isl, s) {
  const { L, at, lbox } = islandFrame(isl, s), D = DESK_D, ax = isl.axis === 'x';
  for (const u of [1, L - 3]) { lbox(u, 1, u + 2, 3, 0, 10, 'W', 'V', 'U'); lbox(u, D - 3, u + 2, D - 1, 0, 10, 'W', 'V', 'U'); }
  flush(true, 'U');
  for (let i = 0; i < isl.n; i++) { const c = i * DESK_P + DESK_P / 2; lbox(c + 2, 2, c + 9, 11, 0, 9, 'W', 'V', 'U', 'W'); }
  flush(true, 'U');
  lbox(0, 0, L, D, 10, 12, 'W', 'V', 'U', 'W'); flush(true, 'U');
  const dir = ax ? (s ? 'y+' : 'y-') : (s ? 'x+' : 'x-'); // パソコンの正面は座る人のほう
  const corner = (u0, v0, u1, v1) => { const [ax0, ay0] = at(u0, v0), [bx, by] = at(u1, v1); return [Math.min(ax0, bx), Math.min(ay0, by)]; };
  for (let i = 0; i < isl.n; i++) {
    const no = s * isl.n + i + 1, st = dseat(`${isl.id}-${isl.rev ? 2 * isl.n + 1 - no : no}`), occ = occupantOf(st), c = i * DESK_P + DESK_P / 2; // rev: 180度回した島は番号が逆順
    const put = (dx, dv) => { const [x, y] = at(c + dx, dv); return s === 0 ? [x, y] : ax ? [x, y - 5] : [x - 5, y]; };
    const dk = occ && !occ.away ? decoOf(occ) : null;
    if (occ) { // 座っている机は小物をパソコン・飾りからどけて机の端へ(位置は画面上の重なりをモニター0〜2枚で数えて決めた)
      // 電話は人の背中がカメラ側の席でモニター1枚までのときだけ。人がカメラを向く席は人・パソコン・となりのモニターで空きが無いので片付ける
      const hasKeyboard = occ.keyboard && occ.keyboard !== 'none';
      const pos = (u, v, du, dv) => corner(c + u, v, c + u + du, v + dv), ph = !hasKeyboard && (occ.mon || 0) < 2 && st.k % 3 === 0, pd = ax ? [5, 4] : [4, 5];
      const mug = (u, v) => { if (occ.cup && !dk && !hasKeyboard) mugOnDesk(...pos(u, v, 0, 0), 12, occ.cup); };
      if (s) { // 人の背中がカメラ側: パソコンは奥、小物は手前
        deskPC(occ, corner, c, dir, 12, [c, D - 3]);
        if (st.fan) deskFan(...pos(-13, 8, 1, 1), 12);
        if (ph) deskPhone(...pos(9, 7, ...pd), 12);
        mug(12, 0);
      } else { // 人がカメラを向く: 小物はカメラから遠い順に描いてからパソコン
        if (!hasKeyboard && st.k % 5 === 2) disinfectant(...pos(10, 2, 2, 2), 12);
        mug(12, 7);
        deskPC(occ, corner, c, dir, 12, [c, D - 3]); // 離席中の札は自分の席の正面・島の中心線ぎわ
      }
    } else deskExtras(st, put, 12);
    if (dk === 'panel') { const [x, y] = at(c - 7, s ? D - 1 : D - 2); punchPanel(x, y, ax ? 'x' : 'y', 12); }
    // 背中がカメラ側の席は、席の真ん中寄りに置くと自分の名札に隠れ、手前の角だと となりの人の名札に隠れるので、手の先の側の島の中心線ぎわ(×2で両方の名札の外)
    else if (dk) deskDeco(...(s ? at(c + 3, D - 1) : at(c - 7, D - 3)), 12, dk);
  }
  if (s) { for (let u = 1; u < L - 1; u++) for (const v of [D - 2, D - 1]) { const [x, y] = at(u, v); wp(x, y, 12, cc('k')); } } // 机のあいだの黒い配線トレー
  flush(false);
}
// 1席ぶんの白い机(2席ぶんの幅)。パソコンは座っている人のきせかえ(不在なら何も置かない)
function drawHeadDesk(st, desk) {
  const [x0, y0, x1, y1] = desk, occ = occupantOf(st), f = st.face, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 3, y0 + 1], [x0 + 1, y1 - 3], [x1 - 3, y1 - 3]]) box(x, y, 0, x + 2, y + 2, 10, 'W', 'V', 'U');
  flush(true, 'U');
  if (f === 'SW') box(x1 - 14, y0 + 2, 0, x1 - 4, y1 - 3, 9, 'W', 'V', 'U', 'W'); else if (f === 'SE') box(x0 + 2, y1 - 14, 0, x1 - 3, y1 - 4, 9, 'W', 'V', 'U', 'W'); else box(x0 + 3, y0 + 4, 0, x1 - 2, y0 + 14, 9, 'W', 'V', 'U', 'W'); // 袖机
  flush(true, 'U');
  box(x0, y0, 10, x1, y1, 12, 'W', 'V', 'U', 'W'); flush(true, 'U');
  if (f === 'SW') { deskPhone(x0 + 2, y0 + 12, 12); disinfectant(x1 - 5, y0 + 4, 12); } // 電話は外部モニターの陰にならない手前の端
  else if (f === 'SE') deskPhone(x0 + 3, y1 - 9, 12);
  else { deskPhone(x1 - 8, y0 + 3, 12); disinfectant(x1 - 4, y1 - 5, 12); }
  if (occ) deskPC(occ, deskCorner(f, x0, y0, x1, y1), (f === 'SW' || f === 'NE' ? x1 - x0 : y1 - y0) / 2, PC_DIR[f], 12);
}

// 椅子＋座っている人。オフィスチェアはライムグリーンのメッシュに白いフレーム(紺・赤が1脚ずつ)
let hoverSeat = null;
function chair(cx, cy, face, type, empty, hover, tint) {
  const back = face === 'NE' || face === 'NW';
  let col = type === 'tea' ? (tint === 'sage' ? [':', '|', 'e'] : ['?', '_', 'e']) : type === 'dine' ? ['a', 'b', 'c'] : type === 'table' ? ['c', 'd', 'e'] : type === 'cafe' || type === 'fold' ? ['l', 'm', 'n'] : type === 'shell' ? (tint === 'sage' ? [':', '|', 'k'] : ['W', 'V', 'U']) : type === 'meet' ? (tint === 'yellow' ? ['Y', 'O', 'd'] : ['B', 'N', 'k']) : type === 'armchair' || tint === 'hb' || tint === 'black' ? ['n', 'k', 'K'] : tint === 'navy' ? ['B', 'N', 'k'] : tint === 'red' ? ['R', 'Q', 'e'] : ['p', 'q', 'r'];
  if (hover) col = ['H', 'B', 'N'];
  const office = type === 'office', oc = office ? (empty && !hover ? 'r' : 'K') : type === 'tea' ? 'e' : type === 'dine' && empty && !hover ? 'd' : (empty && !hover && type !== 'armchair' && type !== 'desk' ? 'h' : 'K'); // ティーサロンの椅子は輪郭を濃い木の枠に。食堂の空いた椅子は木の濃い色(明るい床に溶けないように)
  const hb = type === 'armchair' ? (back ? 15 : 24) : tint === 'hb' ? (back ? 15 : 25) : back ? 13 : (empty ? 15 : 17);
  const bw = type === 'armchair' ? 5 : 4, be = office ? 'W' : type === 'tea' ? 'd' : undefined; // be: 背もたれの上辺(teaは木の笠木)
  const backBox = () => {
    if (face === 'SW') box(cx - bw, cy - 5, 9, cx + bw, cy - 3, hb, col[0], col[1], col[2], be);
    else if (face === 'NE') box(cx - bw, cy + 3, 9, cx + bw, cy + 5, hb, col[0], col[1], col[2], be);
    else if (face === 'SE') box(cx - 5, cy - bw, 9, cx - 3, cy + bw, hb, col[0], col[1], col[2], be);
    else box(cx + 3, cy - bw, 9, cx + 5, cy + bw, hb, col[0], col[1], col[2], be);
    if (tint === 'hb' && !back) { flush(true, oc); if (face === 'SW') box(cx - 2, cy - 5, hb, cx + 2, cy - 3, hb + 4, 'n', 'k', 'K'); else if (face === 'SE') box(cx - 5, cy - 2, hb, cx - 3, cy + 2, hb + 4, 'n', 'k', 'K'); } // ヘッドレスト
    if (office && !hover && tint !== 'hb' && tint !== 'black') { // メッシュの目
      if (face === 'SW') { for (let X = cx - 3; X < cx + 4; X++) for (let Z = 10; Z < hb; Z++) if ((X + Z) & 1) wp(X, cy - 3, Z, cc(col[1])); }
      else if (face === 'SE') { for (let Y = cy - 3; Y < cy + 4; Y++) for (let Z = 10; Z < hb; Z++) if ((Y + Z) & 1) wp(cx - 3, Y, Z, cc(col[1])); }
      else if (face === 'NE') { for (let X = cx - 3; X < cx + 4; X++) for (let Z = 10; Z < hb; Z++) if ((X + Z) & 1) wp(X, cy + 5, Z, cc(col[1])); }
      else { for (let Y = cy - 3; Y < cy + 4; Y++) for (let Z = 10; Z < hb; Z++) if ((Y + Z) & 1) wp(cx + 5, Y, Z, cc(col[1])); }
    }
    flush(true, oc);
  };
  if (type === 'stool') { // カウンターのスツール: 黒い革の座面と背もたれ、クロームの脚と足置きリング。背もたれは座る人の後ろ(NW向きはカメラ側なので人より後に描く)
    const bx = face === 'NW' ? cx + 4 : cx - 5;
    const backRest = () => { box(bx, cy - 3, 14, bx + 1, cy + 3, 22, hover ? 'H' : 'k', hover ? 'B' : 'k', hover ? 'N' : 'K'); box(bx, cy - 4, 13, bx + 1, cy - 3, 22, 'W', 'l', 'm'); box(bx, cy + 3, 13, bx + 1, cy + 4, 22, 'W', 'l', 'm'); flush(true, 'K'); };
    return {
      base() {
        box(cx - 4, cy - 4, 0, cx + 4, cy + 4, 1, 'W', 'l', 'm'); flush(true, 'm');
        box(cx - 1, cy - 1, 1, cx + 1, cy + 1, 12, 'W', 'l', 'm'); flush(true, 'm');
        box(cx - 3, cy - 3, 5, cx + 3, cy + 3, 6, 'l', 'l', 'm'); flush(false);
        if (!back) backRest();
        box(cx - 4, cy - 4, 12, cx + 4, cy + 4, 14, hover ? 'H' : 'k', hover ? 'B' : 'K', hover ? 'N' : 'K', hover ? 'H' : 'n'); flush(true, 'K');
      },
      after() { if (back) backRest(); },
    };
  }
  return {
    base() {
      if (type === 'meet') { box(cx - 4, cy - 4, 0, cx + 4, cy - 3, 1, 'W', 'l', 'm'); box(cx - 4, cy + 3, 0, cx + 4, cy + 4, 1, 'W', 'l', 'm'); for (const [dx, dy] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) box(cx + dx, cy + dy, 1, cx + dx + 1, cy + dy + 1, 6, 'W', 'l', 'm'); } // クロームのループ脚
      else if (type === 'table' || type === 'shell' || type === 'cafe' || type === 'fold' || type === 'tea' || type === 'dine') { const L = type === 'cafe' ? ['b', 'c', 'd'] : type === 'tea' ? ['d', 'e', 'K'] : type === 'fold' || type === 'dine' ? ['m', 'm', 'n'] : ['k', 'k', 'K']; for (const [dx, dy] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) box(cx + dx, cy + dy, 0, cx + dx + 1, cy + dy + 1, 6, ...L); } // 2階の椅子の4本脚(カフェの椅子は木、ほかは黒いスチール)
      else { const F = office ? ['W', 'V', 'U'] : ['n', 'n', 'k']; box(cx - 4, cy - 1, 0, cx + 4, cy + 1, 1, ...F); box(cx - 1, cy - 4, 0, cx + 1, cy + 4, 1, ...F); flush(true, office ? 'U' : oc); box(cx - 1, cy - 1, 1, cx + 1, cy + 1, 6, 'l', 'm', 'n'); }
      flush(true, oc);
      if (!back) backBox();
      box(cx - 4, cy - 4, 6, cx + 4, cy + 4, 8, col[0], col[1], col[2]); flush(true, oc);
      if (type === 'armchair') { // ひじかけ(左右)
        if (face === 'SE' || face === 'NW') { box(cx - 4, cy - 6, 8, cx + 4, cy - 4, 12, col[1], col[1], col[2]); box(cx - 4, cy + 4, 8, cx + 4, cy + 6, 12, col[1], col[1], col[2]); }
        else { box(cx - 6, cy - 4, 8, cx - 4, cy + 4, 12, col[1], col[1], col[2]); box(cx + 4, cy - 4, 8, cx + 6, cy + 4, 12, col[1], col[1], col[2]); }
        flush(true, oc);
      }
    },
    after() { if (back) backBox(); },
  };
}
function drawSeatObj(st) {
  const occ = occupantOf(st);
  if (st.type === 'stand') { // 立ち位置: 人がいなければ床の印だけ
    const z0 = st.z0 || 0;
    if (occ) { GHOST = !!occ.away; drawStanding(PX(st.cx, st.cy), PY(st.cx, st.cy, z0), occ, st.face, 0); flush(); GHOST = false; if (st.smoke && !handsBusy(occ)) { const x = PX(st.cx, st.cy) + (st.face === 'SE' ? 4 : -5), y = PY(st.cx, st.cy, 0) - 16; lp(x, y, cc('W')); lp(x + 1, y, cc('O')); flush(false); steam(x, y - 2, occ.phase); } }
    else { const hv = hoverSeat === st.id; for (let i = -3; i <= 3; i++) { wp(st.cx + i, st.cy, z0, cc(hv ? 'B' : 'V')); wp(st.cx, st.cy + i, z0, cc(hv ? 'B' : 'V')); } flush(false); }
    return;
  }
  const c = chair(st.cx, st.cy, st.face, st.type, !occ, hoverSeat === st.id && !occ, st.chair);
  c.base();
  const z = st.type === 'stool' ? 14 : st.type === 'armchair' ? 9 : 8;
  if (occ) { GHOST = !!occ.away; drawPerson(PX(st.cx, st.cy), PY(st.cx, st.cy, z), occ, st.face); flush(); GHOST = false; personFx(occ, st.cx, st.cy, z, st.face); }
  c.after();
}
function drawMeetSpot(sp, p, hover) {
  if (sp.type === 'stand') { if (p) { GHOST = !!p.away; drawStanding(PX(sp.cx, sp.cy), PY(sp.cx, sp.cy, 0), p, sp.face, 0); flush(); GHOST = false; } return; }
  const c = chair(sp.cx, sp.cy, sp.face, 'meet', !p, hover && !p, sp.chair || null);
  c.base();
  if (p) { GHOST = !!p.away; drawPerson(PX(sp.cx, sp.cy), PY(sp.cx, sp.cy, 8), p, sp.face); flush(); GHOST = false; personFx(p, sp.cx, sp.cy, 8, sp.face); }
  c.after();
}
function drawMeetTable(X, Y, it, n = 4) { // 白い天板で両端が丸いテーブル。原点は天板の角(幅44×長さ22n)。椅子は両側にn脚ずつ
  const X0 = X, Y0 = Y, X1 = X + 44, Y1 = Y + 22 * n, cxm = X + 22, cym = (Y0 + Y1) / 2, rr = 22;
  for (const [x, y] of [[X0 + 10, Y0 + 12], [X1 - 12, Y0 + 12], [X0 + 10, Y1 - 14], [X1 - 12, Y1 - 14]]) box(x, y, 0, x + 2, y + 2, 10, 'm', 'm', 'n');
  flush();
  const inTop = (X, Y) => (Y >= Y0 + rr && Y < Y1 - rr) || (X - cxm + 0.5) ** 2 + (Y - (Y < Y0 + rr ? Y0 + rr : Y1 - rr) + 0.5) ** 2 <= rr * rr;
  for (let X = X0; X < X1; X++) for (let Y = Y0; Y < Y1; Y++) if (inTop(X, Y)) { wp(X, Y, 12, cc('W')); if (!inTop(X + 1, Y) || !inTop(X, Y + 1)) { wp(X, Y, 11, cc(inTop(X + 1, Y) ? 'V' : 'U')); wp(X, Y, 10, cc(inTop(X + 1, Y) ? 'V' : 'U')); } }
  flush(true, 'U');
  // 椅子に座った人のパソコン(SE側は原点から6〜14、NW側は30〜38で両端の丸みに収まる)と、そのあいだ(X464〜480)の小物。
  // カメラから遠い順(Xが離れていればXの小さい順、重なればYの小さい順)なので、SE側の4台→小物→NW側の4台。
  // 小物のYは、画面の上でNW側のパソコンの画面(手前)にも、SE側のパソコンの画面(奥)にもかからない所
  const all = ALLSEATS.filter(s => s.item === it.id && s.type === 'meet'), m = MEET[all[0]?.room], ppl = m ? meetLayout(m.id).spots : [];
  const chairs = all.map(s => ({ s, n: nat(s) })).sort((a, b) => (a.n.face === 'SE' ? 0 : 1) - (b.n.face === 'SE' ? 0 : 1) || a.n.cy - b.n.cy); // 絵の向きでSE側→NW側、奥から。回した卓でも描く順が同じになる
  const pc = i => { if (!chairs[i]) return; const { s: sp, n } = chairs[i], se = n.face === 'SE'; carryPC(m && ppl[m.spots.indexOf(sp)], se ? X + 6 : X + 30, n.cy - 5, se ? 'x-' : 'x+', 12); };
  for (let i = 0; i < n; i++) pc(i);
  box(cxm - 6, Y0 + 9, 12, cxm, Y0 + 15, 13, 'V', 'V', 'U'); flush(); // 書類
  box(cxm - 3, cym - 10, 12, cxm + 3, cym - 4, 14, 'k', 'k', 'K'); flush(); // 会議用スピーカー
  mugOnDesk(cxm, cym + 16, 12, 'w');
  box(cxm - 3, Y1 - 7, 12, cxm + 7, Y1 - 1, 13, 'l', 'm', 'n'); flush();
  box(cxm - 3, Y1 - 2, 13, cxm + 7, Y1 - 1, 18, 'm', 'n', 'n'); flush(); // テーブルのノートPC(モニター側の端。画面を低くして、両側の手前のパソコンにかからないようにした)
  for (let i = n; i < 2 * n; i++) pc(i);
}
function drawDisplayStand(X, Y, front) { // 大きいモニター(スタンド)。原点は足もとの角(幅36×奥行4)。画面は部屋の中を向くのでカメラからは背面
  for (const x of [X + 9, X + 25]) box(x, Y + 1, 0, x + 2, Y + 3, 16, 'm', 'm', 'n');
  flush();
  box(X, Y, 16, X + 36, Y + 4, 36, 'k', 'K', 'k', 'n'); flush(true, 'K');
  box(X + 14, Y + 1, 36, X + 22, Y + 3, 39, 'k', 'k', 'K'); flush(); // ビデオ会議用の小さいカメラ
  if (front) { for (let x = X + 2; x < X + 34; x++) for (let z = 18; z < 35; z++) wp(x, Y + 4, z, cc((x + z) % 9 === 0 ? 'B' : 'N')); flush(false); } // 向きがx-・y-のときは画面がカメラ側(青い待機画面)
}
function drawWhiteboard(X, Y, back) { // 黒い脚のキャスター付きホワイトボード。原点は足もとの角(幅50×奥行7)
  for (const x of [X + 3, X + 46]) { box(x, Y + 3, 0, x + 1, Y + 4, 32, 'k', 'k', 'K'); box(x - 3, Y + 1, 0, x + 4, Y + 6, 1, 'k', 'k', 'K'); }
  flush();
  box(X + 1, Y + 3, 10, X + 49, Y + 5, 32, 'W', 'W', 'V', 'l'); flush(true, 'k');
  if (!back) for (const [x0, len, z] of [[7, 20, 28], [7, 13, 25], [7, 17, 22], [29, 11, 18]]) for (let x = X + x0; x < X + x0 + len; x++) wp(x, Y + 5, z, cc(z === 28 ? 'B' : 'm'));
  flush(false);
}
// ガラスの仕切り(細い枠＋すりガラスの帯＋映り込み)
function glintAt(x, y) { for (let i = 0; i < 6; i++) lp(x + i, y - i, cc('W')); for (let i = 0; i < 3; i++) lp(x + i + 3, y - i + 2, cc('W')); }
function segsOf(a0, a1, gaps) {
  const segs = []; let s = null;
  for (let A = a0; A <= a1; A++) { const g = A === a1 || gaps.some(([a, b]) => A >= a && A < b); if (!g && s === null) s = A; if (g && s !== null) { segs.push([s, A]); s = null; } }
  return segs;
}
// 壁の1区切り(16単位)を描く。w=壁、[a,b)=この区切り、run=[壁の切れ目までの範囲]
const CUTH = 15; // 輪切りの壁の高さ(奥を歩く人の上半身が見える高さ)
function drawWallSeg(w, a, b, run) {
  const along = (p, z, c) => (w.axis === 'y' ? wp(w.at, p, z, c) : wp(p, w.at, z, c)); // 壁の表(見える面)
  const atStart = a === run[0], atEnd = b === run[1];
  const post = (p, z0, z1, c) => { if (w.axis === 'y') box(w.at - 1, p, z0, w.at + 1, p + 2, z1, ...c); else box(p, w.at - 1, z0, p + 2, w.at + 1, z1, ...c); };
  const rail = (z0, z1, c) => { if (w.axis === 'y') box(w.at - 1, a, z0, w.at + 1, b, z1, ...c); else box(a, w.at - 1, z0, b, w.at + 1, z1, ...c); };
  if (w.kind === 'cut') {
    const h = w.h || CUTH;
    if (w.axis === 'y') box(w.at - 2, a, 0, w.at + 2, b, h, 'U', 'V', 'W'); else box(a, w.at - 2, 0, b, w.at + 2, h, 'U', 'W', 'V');
    for (let p = a; p < b; p++) for (let z = 0; z < 2; z++) along(p, z, cc('h'));
    for (let p = a; p < b; p++) { if (w.axis === 'y') { wp(w.at + 2, p, h, cc('n')); } else wp(p, w.at + 2, h, cc('n')); }
    if (atStart || atEnd) { const p = atStart ? a : b - 1; for (let z = 0; z <= h; z++) w.axis === 'y' ? wp(w.at + 2, p, z, cc('m')) : wp(p, w.at + 2, z, cc('m')); }
    flush(false);
    return;
  }
  if (w.kind === 'glass') { // 下の枠・すりガラスの帯・上は透明・上の枠・柱
    const H = 36, fb = w.frost ? [8, 28] : [8, 22];
    for (let p = a; p < b; p++) for (let z = fb[0]; z <= fb[1]; z++) if (z === fb[1] || ((p + z) % 2 === 0)) along(p, z, cc(z === fb[1] ? 'W' : 'G'));
    if (w.blinds) for (let p = a; p < b; p++) for (let z = 25; z < 34; z += 2) if ((p + z) % 3) along(p, z, cc('V')); // 横型ブラインド(すけて見える)
    flush(false);
    rail(0, 2, ['n', 'n', 'k']); rail(H - 1, H, ['l', 'l', 'm']);
    flush(false);
    for (let p = a; p < b; p++) if (p === run[0] || p === run[1] - 2 || (p - run[0]) % 40 === 0) post(p, 2, H - 1, ['l', 'l', 'm']);
    flush(true, 'n');
    if (w.blinds && (a - run[0]) % 48 === 16) { box(w.at - 6, a + 6, 32, w.at - 3, a + 9, 35, 'k', 'k', 'K'); flush(); } // ガラスの向こうの黒い照明
    if ((a - run[0]) % 32 === 16) { const P = a + 4; glintAt(w.axis === 'y' ? PX(w.at, P + 8) : PX(P + 4, w.at), w.axis === 'y' ? PY(w.at, P + 8, 24) : PY(P + 4, w.at, 24)); flush(false); }
    return;
  }
  if (w.kind === 'slat') { // 白い板に横長のスリット(すき間から向こうの縦型ブラインドが見える)
    for (const [z0, z1] of [[0, 6], [8, 11], [13, 16], [18, 21], [23, 26], [28, 31], [33, 36]]) rail(z0, z1, ['W', 'W', 'V']);
    flush(true, 'U');
    if (atStart || atEnd) { post(atStart ? a : b - 2, 0, 36, ['W', 'V', 'V']); flush(true, 'U'); }
    return;
  }
  if (w.kind === 'panel') { // グレーベージュのパネル(下)＋白い支柱で区切った透明なガラスの帯(上)
    if (w.axis === 'y') box(w.at - 2, a, 0, w.at + 2, b, 24, 'W', 'V', 'V'); else box(a, w.at - 2, 0, b, w.at + 2, 24, 'W', 'V', 'V');
    for (let p = a; p < b; p++) if ((p - run[0]) % 32 === 31) for (let z = 1; z < 24; z++) along(p, z, cc('U'));
    flush(true, 'U');
    for (let p = a; p < b; p++) if (p === run[0] || p === run[1] - 2 || (p - run[0]) % 32 === 0) post(p, 24, 40, ['W', 'W', 'V']);
    rail(39, 40, ['W', 'V', 'V']);
    flush(true, 'U');
    if ((a - run[0]) % 32 === 16) { glintAt(w.axis === 'y' ? PX(w.at, a + 12) : PX(a + 4, w.at), w.axis === 'y' ? PY(w.at, a + 12, 33) : PY(a + 4, w.at, 33)); flush(false); }
    return;
  }
  if (w.kind === 'glasslow') { // 床から天井までの窓(輪切り): 細い枠とガラスの帯
    for (let p = a; p < b; p++) for (let z = 0; z <= CUTH; z++) { const frame = z < 2 || z === CUTH || p === run[0] || (p - run[0]) % 16 === 0; if (frame) along(p, z, cc(z < 2 ? 'n' : 'l')); else if ((p + z) % 5 === 0) along(p, z, cc('G')); }
    flush(false);
  }
}
// オートロックのカードリーダー: 扉の横のパネルの壁のカメラ側の面に黒いリーダー(ランプ: 赤=施錠 / 緑=開いている)。
// 扉の枠はパネルの端と支柱が兼ねる。壁より後に描くので扉とは別の置き物。
// 扉のa側に付ける(b側は手前の壁のパネルに隠れてランプが見えなかった)。r+1〜r+5がリーダー
const readerAt = d => d.a - 6;
function cardReader(d) {
  const on = doorOpen[d.k] > 0, lamp = on ? 'q' : 'R', blink = !on && animT % 4 < 2, r = readerAt(d);
  if (d.axis === 'y') {
    box(d.at + 2, r + 1, 13, d.at + 3, r + 5, 23, 'k', 'k', 'n'); flush(true, 'K'); // リーダー本体
    for (let Y = r + 2; Y < r + 4; Y++) { wp(d.at + 3, Y, 21, cc(lamp)); wp(d.at + 3, Y, 20, cc(blink ? 'K' : lamp)); wp(d.at + 3, Y, 16, cc('l')); } // ランプ・カードをかざす所
    for (const Z of [18, 14]) wp(d.at + 3, r + 3, Z, cc('m'));
  } else {
    box(r + 1, d.at + 2, 13, r + 5, d.at + 3, 23, 'k', 'n', 'k'); flush(true, 'K');
    for (let X = r + 2; X < r + 4; X++) { wp(X, d.at + 3, 21, cc(lamp)); wp(X, d.at + 3, 16, cc('l')); }
  }
  flush(false);
}
// 扉: 引き戸は開いているコマ数(0〜4)だけ左右にずれる。普通のドア(swing)は開くと外側に90度ひらく
function drawDoor(d) {
  const op = Math.min(4, doorOpen[d.k]) * ((d.b - d.a) / 10), mid = (d.a + d.b) / 2, w = d.axis;
  const pane = (p0, p1, z0, z1, t, l, r) => { if (p1 - p0 < 1) return; if (w === 'y') box(d.at - 1, p0, z0, d.at + 1, p1, z1, t, l, r); else box(p0, d.at - 1, z0, p1, d.at + 1, z1, t, l, r); };
  if (d.kind === 'lockw') { // 白い引き戸(オートロック)。縦長のすりガラスの小窓と取っ手
    const H = d.h || CUTH + 4;
    for (const [p0, p1] of [[d.a, mid - op], [mid + op, d.b]]) { pane(p0, p1, 0, H, 'W', 'V', 'V'); }
    flush(true, 'U');
    for (const [p0, p1, hp] of [[d.a, mid - op, mid - op - 2], [mid + op, d.b, mid + op + 1]]) if (p1 - p0 >= 6) { for (let Z = 6; Z < H - 2; Z++) { wp(d.at + 1, Math.round((p0 + p1) / 2), Z, cc('G')); } for (let Z = 8; Z < 13; Z++) wp(d.at + 1, Math.round(hp), Z, cc('m')); }
    flush(false);
    return;
  }
  if (d.kind === 'lock' || d.kind === 'glass') {
    const H = d.h || CUTH;
    for (const [p0, p1] of [[d.a, mid - op], [mid + op, d.b]]) {
      if (p1 - p0 < 1) continue;
      const P0 = Math.round(p0);
      for (let P = P0; P < p1; P++) for (let Z = 2; Z < H; Z++) if ((P + Z) % 3 === 0 || Z === H - 1 || P === P0) { const c = cc(Z === H - 1 || P === P0 ? 'n' : 'G'); if (w === 'y') wp(d.at, P, Z, c); else wp(P, d.at, Z, c); }
      flush(false);
      pane(p0, p1, 0, 2, 'n', 'n', 'k'); flush(false);
    }
    return;
  }
  if (d.kind === 'swing') { // 外に出る普通のドア(グレーがかった白・レバーの取っ手)
    const L = d.b - d.a;
    if (doorOpen[d.k] > 0) { box(d.at - L, d.a, 0, d.at, d.a + 2, CUTH + 4, 'V', 'V', 'U', 'W'); flush(true, 'n'); }
    else {
      pane(d.a, d.b, 0, CUTH + 4, 'V', 'V', 'U'); flush(true, 'n');
      for (let p = d.a + 2; p < d.b - 2; p++) wp(d.at + 1, p, CUTH + 3, cc('U'));
      box(d.at + 1, d.b - 6, 9, d.at + 3, d.b - 3, 10, 'l', 'm', 'n'); flush(false); // レバー
    }
    return;
  }
  if (d.kind === 'wood' || d.kind === 'wc') {
    const c = d.kind === 'wood' ? ['d', 'd', 'e'] : ['V', 'V', 'U'];
    pane(d.a, mid - op, 0, d.h || CUTH, ...c); pane(mid + op, d.b, 0, d.h || CUTH, ...c); flush(true, 'n');
    if (d.kind === 'wc') { paintR(d.at + 1, d.b - 3, 13, ['..R...B..', '.RRR.BBB.', '..R...B..', '.R.R.B.B.']); flush(false); }
  }
}
// エレベーター(入口): 扉は+Y側を向く。階数表示つき
const EV_GLYPH = { 1: ['kYk', 'YYk', 'kYk', 'kYk', 'YYY'], 2: ['YYY', 'kkY', 'YYY', 'Ykk', 'YYY'], 3: ['YYY', 'kkY', 'kYY', 'kkY', 'YYY'], 4: ['YkY', 'YkY', 'YYY', 'kkY', 'kkY'], 5: ['YYY', 'Ykk', 'YYY', 'kkY', 'YYY'], F: ['YYY', 'Ykk', 'YYk', 'Ykk', 'Ykk'] }; // 階数表示の字(3×5)
function drawElevatorShaft(ex, ey, w = 64, d = 72, gap = 32) { // 原点は箱の角(幅w×奥行d、扉の開口gap)。扉は+Y側
  const X0 = ex, X1 = ex + w, Y0 = ey, Y1 = ey + d, H = 30, op = Math.min(4, FL[FLOOR].ev) * (gap / 8), mid = ex + w / 2, h2 = gap / 2;
  box(X0, Y0, 0, X1, Y1, H, 'm', 'X', 'Z', 'l');
  for (let X = X0; X <= X1; X++) for (let Z = 0; Z < H; Z++) if ((X * 7 + Z * 13) % 11 === 0) wp(X, Y1, Z, cc('Z'));
  for (let X = mid - h2 - 3; X < mid + h2 + 3; X++) for (let Z = 0; Z < 26; Z++) { // 扉と枠
    let ch = (X < mid - h2 || X >= mid + h2 || Z >= 23) ? 'l' : null;
    if (!ch) { const left = X < mid, dd = left ? mid - X : X - mid + 1; ch = dd <= op ? (Z > 18 ? 'n' : 'k') : (X === mid - 1 - op || X === mid + op ? 'n' : (Z % 7 === 3 ? 'l' : 'V')); }
    wp(X, Y1, Z, cc(ch));
  }
  // 階数表示(最下階から数えた番号とF)と矢印(画面全体を左右反転するので、ここでは裏返して描く)
  const dg = EV_GLYPH[Math.min(FLS.indexOf(FL[FLOOR]) + 1, 5)], fg = EV_GLYPH.F;
  paintL(Y1, mid - 6, 30, ['kkkkkkkkkkkk', ...dg.map((r, i) => 'k' + r + 'k' + fg[i] + 'k' + (i < 3 ? '*' : 'k') + 'kk'), 'kkkkkkkkkkkk'].map(r => [...r].reverse().join('')));
  for (const z of [11, 14]) wp(mid + h2 + 5, Y1, z, cc('Y'));
  // 奥の外壁(高さWH)は先に描いてあるが、この箱より手前。壁の上面とその上の輪郭線から下は壁に隠れる
  hideL(OX + X1, CW - 1, x => OY + (Math.max(x - OX - 2 * WT, 2 * X1 - x + OX) >> 1) - WH - 1);
  flush();
}
function drawBookshelf(X, Y) { // 背の高い本棚(幅32×奥行10・高さ40)。正面(+X)に、段ごとに色とりどりの背表紙
  const f = propFrame(X, Y, 32, 10, 'x+');
  f.bx(0, 0, 0, 32, 10, 40, 'e', 'e', 'd', 'c'); flush();
  const cols = ['R', 'B', 'Y', 'G', 'q', 'W', 'N', 'O'];
  for (let w = 0; w < 32; w++) for (let z = 1; z < 40; z++) {
    const side = w < 2 || w > 29, board = z < 4 || z > 37 || (z - 4) % 9 === 0; // 左右の枠・底の台・段の板
    if (side || board) f.face(0, w, z, 'd');
    else { const zb = z - 4 - (((z - 4) / 9) | 0) * 9, k = ((w - 2) / 3) | 0, h = 5 + (k * 7) % 4; f.face(0, w, z, zb <= h && (w - 2) % 3 < 2 ? cols[(k * 5 + (((z - 4) / 9) | 0) * 3) % 8] : 'k'); } // 背表紙(幅2・高さ5〜8)
  }
  flush(false);
}
function drawVendingMachine(X, Y) { // 飲み物の自販機(幅24×奥行16・高さ44)。正面(+X)に見本の段・ボタン・取り出し口。夜は見本の窓が光る
  const f = propFrame(X, Y, 24, 16, 'x+');
  f.bx(0, 0, 0, 24, 16, 44, 'R', 'R', 'R'); flush();
  const lit = isLit(), can = ['B', 'W', 'Y', 'G', 'R', 'O'];
  for (let w = 2; w < 17; w++) for (let z = 22; z < 40; z++) { // 見本の窓(3段)
    const row = ((z - 22) / 6) | 0, zz = (z - 22) % 6, k = ((w - 2) / 3) | 0;
    f.face(0, w, z, zz === 5 ? 'm' : (w - 2) % 3 < 2 && zz < 4 ? can[(k + row * 2) % 6] : (lit ? '*' : 'l'), lit);
  }
  for (let z = 22; z < 40; z++) { f.face(0, 1, z, 'k'); f.face(0, 17, z, 'k'); }
  for (let w = 1; w <= 17; w++) { f.face(0, w, 21, 'k'); f.face(0, w, 40, 'k'); }
  for (let z = 24; z < 38; z += 4) for (let w = 19; w < 22; w++) { f.face(0, w, z, 'k'); f.face(0, w, z + 1, lit ? '*' : 'U', lit); } // ボタン
  for (let w = 19; w < 22; w++) f.face(0, w, 12, 'k'); // 硬貨の口
  for (let w = 3; w < 17; w++) for (let z = 3; z < 11; z++) f.face(0, w, z, z === 10 || z === 3 || w === 3 || w === 16 ? 'm' : 'k'); // 取り出し口
  flush(false);
}
function drawReceptionCounter(X, Y) { // 受付カウンター(奥行16×幅64・高さ28)。来客側の+X面に化粧板、天板に小さいベル
  const f = propFrame(X, Y, 64, 16, 'x+');
  f.bx(0, 0, 0, 64, 16, 22, 'a', 'b', 'a'); flush();
  for (let w = 0; w < 64; w++) for (let z = 1; z < 22; z++) { // 化粧板(縦の目地で区切った羽目板)
    f.face(0, w, z, w % 16 === 0 || w === 63 || z === 1 || z === 21 ? 'c' : (z === 6 || z === 16) && w % 16 > 1 && w % 16 < 15 ? 'a' : 'b');
  }
  f.bx(0, 0, 22, 64, 16, 25, 'W', 'V', 'U', 'W'); flush(true, 'U'); // 天板
  const [bx, by] = f.pt(46, 8);
  box(bx - 3, by - 3, 25, bx + 3, by + 3, 26, 'Y', 'Y', 'O', 'W'); box(bx - 1, by - 1, 26, bx + 1, by + 1, 28, 'Y', 'Y', 'O', 'W'); flush(); // ベル
  const [mx, my] = f.pt(30, 8);
  box(mx - 2, my - 3, 25, mx + 2, my + 3, 26, 'k', 'k', 'K'); flush(); // メモ台
}
function drawStairs(X0, Y0) { // 階段の口(幅48×奥行56)。+Y側の開口の中に、上へ向かう段が見える
  const X1 = X0 + 48, Y1 = Y0 + 56, H = 30;
  box(X0, Y0, 0, X1, Y1, H, 'm', 'X', 'Z', 'l');
  for (let X = X0 + 8; X < X1 - 8; X++) for (let Z = 0; Z < 24; Z++) wp(X, Y1, Z, cc(Z % 5 === 4 && Z > 3 ? 'n' : 'k')); // 開口(暗い)と、のぼる段の線
  for (let X = X0 + 6; X <= X1 - 6; X++) wp(X, Y1, 24, cc('l'));
  for (const x of [X0 + 6, X1 - 7]) for (let Z = 0; Z < 25; Z++) wp(x, Y1, Z, cc('l')); // 枠
  hideL(OX + X1, CW - 1, x => OY + (Math.max(x - OX - 2 * WT, 2 * X1 - x + OX) >> 1) - WH - 1);
  flush();
}
function drawEntranceDoor(X0, Y0) { // 玄関の戸の枠(幅40)と、足もとのマット
  box(X0, Y0 + 8, 0, X0 + 40, Y0 + 18, 1, 'k', 'k', 'K'); flush(true, 'K'); // マット
  for (const x of [X0, X0 + 37]) box(x, Y0, 0, x + 3, Y0 + 5, 30, 'l', 'm', 'n', 'W');
  box(X0, Y0, 26, X0 + 40, Y0 + 5, 30, 'l', 'm', 'n', 'W'); flush(true, 'n');
  for (let X = X0 + 3; X < X0 + 37; X++) for (let Z = 1; Z < 26; Z++) if ((X + Z) % 8 === 0) wp(X, Y0 + 5, Z, cc('V')); // ガラスの映り込み
  flush(false);
}
// L字のカウンター(石目の白い天板・濃い茶色の木の前面)。カウンターの裏にグラスの棚(open-shelf・wall-monitorは仕切りの壁ぎわに別の置き物として置く)
function drawBarCounter(X, Y, it) { // 原点はカウンターの外接矩形の角。L字の2辺(S0・S1)と、人の側のスツール(席1〜4と5)
  const front = ([x0, y0, x1, y1]) => { box(x0, y0, 0, x1, y1, 15, 'e', 'e', 'e'); for (let Y = y0; Y < y1; Y++) for (let Z = 1; Z < 15; Z++) if ((Y - y0) % 26 === 25) wp(x1, Y, Z, cc('d')); for (let X = x0; X < x1; X++) for (let Z = 1; Z < 15; Z++) if ((X - x0) % 26 === 25) wp(X, y1, Z, cc('d')); flush(); };
  const top = ([x0, y0, x1, y1]) => { box(x0 - 2, y0 - 1, 15, x1 + 1, y1 + 1, 17, 'V', 'l', 'l', 'W'); for (let X = x0 - 2; X < x1 + 1; X++) for (let Y = y0 - 1; Y < y1 + 1; Y++) if ((X * 5 + Y * 3) % 17 === 0 || (X * 3 + Y * 11) % 29 === 0) wp(X, Y, 17, cc('l')); flush(); }; // 石目の天板
  const S0 = [X + 3, Y + 2, X + 17, Y + 80], S1 = [X + 3, Y + 80, X + 43, Y + 94];
  front(S0);
  drawGlassRack(X + 17, Y + 6, 70, 'y', 6); // カウンターの裏(内側)にグラスが並ぶ
  top(S0);
  // スツール1〜4のパソコンは人の側のへりに寄せて正面に。カウンターの小物はそのあいだ。カメラから遠い順(Yの小さい順)に描く
  const pc = i => carryPC(occupantOf(dseat(`${it.id}-${i}`)), X + 4, Y - 13 + i * 20, 'x-', 17);
  pc(1);
  box(X + 6, Y + 18, 17, X + 11, Y + 26, 19, 'q', 'q', 'r'); box(X + 7, Y + 19, 19, X + 10, Y + 25, 20, 'W', 'W', 'V'); flush(); // ティッシュ(1と2のあいだ)
  pc(2);
  const p5 = occupantOf(dseat(`${it.id}-5`));
  carryPC(p5, X + 8, Y + 37, 'x+', 17); // 5の席のパソコンはスツール2と3のパソコンのあいだ(斜めに見るので画面では5の人の前に来る)
  pc(3);
  pc(4);
  front(S1); top(S1);
  box(X + 9, Y + 86, 17, X + 15, Y + 88, 18, 'k', 'k', 'K'); flush(); // テレビのリモコン(パソコンを置けるよう、1辺目から2辺目の端へ移した)
  box(X + 23, Y + 83, 17, X + 35, Y + 91, 21, 'b', 'c', 'd', 'a'); flush(); // 木のお菓子の箱(置き菓子)
  for (const [x, y, c] of [[25, 85, 'R'], [28, 88, 'Y'], [31, 85, 'q'], [33, 88, 'B']]) { wp(X + x, Y + y, 21, cc(c)); wp(X + x + 1, Y + y, 21, cc(c)); }
  flush(false);
}
function drawBarShelf(X, Y) { // 壁(仕切り)ぎわの奥行きの浅い黒いオープン棚(ボトルは部屋の中を向く)。カメラからは仕切りの上に天板と、上の白い丸い頭の扇風機・裸電球のランプ・ゴルフボールの置物が見える
  const X0 = X, X1 = X + 6, Y0 = Y, Y1 = Y + 26, H = 26;
  box(X0, Y0, 0, X1, Y1, H, 'k', 'k', 'K', 'n'); flush();
  box(X0 + 2, Y0 + 3, H, X0 + 4, Y0 + 5, H + 4, 'W', 'l', 'm'); flush(); sprAt(X0 + 3, Y0 + 4, H + 4, ['.WWW.', 'WWlWW', 'WlllW', 'WWlWW', '.WWW.'], 2, 4); flush(); // 扇風機
  const lit = TIME === 'night' || TIME === 'evening';
  box(X0 + 1, Y0 + 9, H, X0 + 4, Y0 + 12, H + 1, 'c', 'd', 'd'); flush(); sprAt(X0 + 2, Y0 + 10, H + 1, lit ? ['.*.', '***', '*Y*', '.l.'] : ['.W.', 'WGW', 'WGW', '.l.'], 1, 3); flush(); // 裸電球のランプ
  box(X0 + 1, Y0 + 15, H, X0 + 4, Y0 + 18, H + 1, 'k', 'k', 'K'); flush(); wp(X0 + 2, Y0 + 16, H + 2, cc('W')); wp(X0 + 2, Y0 + 16, H + 3, cc('W')); flush(false); // ゴルフボール
}
function drawBarMonitor(X, Y) { // 壁(仕切り)に掛けた薄型のモニター(画面は部屋の中)。カメラからは仕切りの上のガラスごしに黒い背面が見える
  box(X, Y, 22, X + 2, Y + 28, 38, 'k', 'k', 'K', 'n'); flush(true, 'K');
}
// 黒い2人がけソファ。原点は座面の角(幅48×奥行20)。y+ は奥(背もたれが-Y側)、y- は手前(背もたれが+Y側)
function drawSofa(X, Y, dir, it) {
  const front = dir === 'y+', X0 = X, X1 = X + 48, Y0 = Y, Y1 = Y + 20;
  const ids = [`${it.id}-1`, `${it.id}-2`];
  if (front) { box(X0, Y0 - 4, 0, X1, Y0, 17, 'n', 'k', 'K', 'n'); flush(); }
  box(X0 - 3, Y0 - (front ? 4 : 0), 0, X0, Y1 + (front ? 0 : 4), 11, 'n', 'k', 'K', 'n'); flush();
  box(X0, Y0, 0, X1, Y1, 6, 'k', 'k', 'K'); flush();
  ids.forEach((id, i) => { const st = dseat(id), occ = occupantOf(st), hv = hoverSeat === id && !occ; box(X0 + i * 24, Y0, 6, X0 + i * 24 + 24, Y1, 9, hv ? 'H' : 'n', hv ? 'B' : 'k', hv ? 'N' : 'K'); flush(); });
  ids.forEach(id => { const st = dseat(id), occ = occupantOf(st); if (occ) { GHOST = !!occ.away; drawPerson(PX(st.cx, st.cy), PY(st.cx, st.cy, 9), occ, st.face); flush(); GHOST = false; personFx(occ, st.cx, st.cy, 9, st.face); } });
  if (!front) { box(X0, Y1, 0, X1, Y1 + 4, 17, 'n', 'k', 'K', 'n'); flush(); }
  box(X1, Y0 - (front ? 4 : 0), 0, X1 + 3, Y1 + (front ? 0 : 4), 11, 'n', 'k', 'K', 'n'); flush();
}
// ガラス天板のローテーブル。原点は角(幅36×奥行16)。ids: 画面を出す4席のid([奥の左, 奥の右, 手前の左, 手前の右])
function drawCoffeeTable(X, Y, ids) {
  const X0 = X, X1 = X + 36, Y0 = Y, Y1 = Y + 16;
  for (const [x, y] of [[X0 + 2, Y0 + 2], [X1 - 4, Y0 + 2], [X0 + 2, Y1 - 4], [X1 - 4, Y1 - 4]]) box(x, y, 0, x + 2, y + 2, 7, 'k', 'k', 'K');
  flush();
  box(X0, Y0, 7, X1, Y1, 9, 'G', 'H', 'B', 'W'); flush(); // ガラスの天板
  // ソファの人のパソコンは正面のへり(向かい合う2台は画面が背中合わせ)。小物は左右のパソコンのあいだ。Xの小さい順に描く
  const pc = (id, X) => { const st = dseat(id); if (!st) return; carryPC(occupantOf(st), X, st.face === 'SW' ? Y0 : Y1 - 8, PC_DIR[st.face], 9); };
  pc(ids[0], X0); pc(ids[2], X0);
  box(X0 + 12, Y0 + 5, 9, X0 + 18, Y0 + 11, 12, 'W', 'V', 'U'); flush(); mugOnDesk(X0 + 22, Y0 + 6, 9, 'w');
  pc(ids[1], X1 - 10); pc(ids[3], X1 - 10);
}
// 窓ぎわの木の机。窓を背にして部屋の中を向くので、画面はカメラ側。原点は椅子の位置。
// 2つ並べるときはつなぎ目に仕切り(drawPanel)が立つので、机は仕切りの両側の2つに分ける(並べ替えを正しくするため)。mirror=仕切りの+Y側の机
function drawWindowDesk(X, Y, st, mirror) {
  const k = mirror ? 1 : 0, X0 = X - 32, X1 = X - 14, y0 = Y - (k ? 23 : 24), y1 = Y + (k ? 24 : 23), occ = occupantOf(st);
  box(X0, y0, 0, X0 + 3, y1, 12, 'd', 'e', 'd'); flush(); // 部屋の側の前板
  if (k) box(X0, y1 - 3, 0, X1, y1, 12, 'd', 'e', 'd'); else box(X0, y0, 0, X1, y0 + 3, 12, 'd', 'e', 'd');
  flush(); // 外側の側板
  box(X0 - 1, k ? y0 : y0 - 1, 12, X1 + 1, k ? y1 + 1 : y1, 14, 'd', 'e', 'e', 'c'); flush(); // 天板
  box(X1 - 8, k ? y1 - 12 : y0 + 6, 14, X1 - 2, k ? y1 - 6 : y0 + 12, 15, 'W', 'V', 'U'); flush(); // 書類
  box(X0 + 4, k ? y1 - 6 : y0 + 4, 14, X0 + 6, k ? y1 - 4 : y0 + 6, 24, 'Y', 'O', 'd'); flush(); // デスクライト
  if (occ) deskPC(occ, deskCorner('NW', X0, y0, X1, y1), (y1 - y0) / 2, 'x+', 14); // パソコンは座っている人のきせかえ(不在なら何も置かない)
}
function drawLowCabinet(X, Y) { // 壁ぎわの低い棚(トロフィーと本)。原点は足もとの角(幅40×奥行10)
  box(X, Y, 0, X + 40, Y + 10, 16, 'd', 'e', 'd', 'c'); flush();
  sprAt(X + 7, Y + 5, 16, ['.YYY.', 'YYYYY', '.YYY.', '..Y..', '.OOO.'], 2, 4); flush();
  for (let i = 0; i < 8; i++) { const x = PX(X + 18 + i * 2, Y + 5), y = PY(X + 18 + i * 2, Y + 5, 16); for (let v = 0; v < 6; v++) lp(x, y - v, cc(['N', 'Q', 'r', 'k', 'B', 'd'][i % 6])); }
  flush();
}
// 給湯コーナーとトイレ
function drawKitchen(X, Y) { // 給湯コーナー: 奥の壁ぎわにカウンター・シンク・電気ケトル・水切りかご。原点は足もとの角(幅56×奥行10)
  const X0 = X, X1 = X + 56, Y0 = Y, Y1 = Y + 10;
  box(X0, Y0, 0, X1, Y1, 15, 'V', 'V', 'U', 'W');
  const rows = []; for (let v = 0; v < 16; v++) { let row = ''; for (let u = 0; u <= X1 - X0; u++) { let ch = 'V'; if (v === 0) ch = 'W'; else if (u % 14 === 0 || v === 15) ch = 'U'; else if (v === 4 && (u % 14 === 6 || u % 14 === 8)) ch = 'm'; row += ch; } rows.push(row); }
  paintL(Y1, X0, 15, rows);
  flush();
  box(X0 + 22, Y0 + 2, 14, X0 + 32, Y0 + 8, 15, 'l', 'm', 'n'); flush(); // シンク
  box(X0 + 29, Y0 + 2, 15, X0 + 30, Y0 + 3, 21, 'l', 'l', 'm'); flush();
  box(X0 + 5, Y0 + 3, 15, X0 + 10, Y0 + 8, 22, 'W', 'V', 'U', 'W'); box(X0 + 6, Y0 + 3, 22, X0 + 9, Y0 + 5, 23, 'k', 'k', 'K'); flush(); // 電気ケトル
  mugOnDesk(X0 + 14, Y0 + 7, 15, 'r'); mugOnDesk(X0 + 18, Y0 + 6, 15, 'w');
  box(X0 + 38, Y0 + 2, 15, X0 + 52, Y0 + 7, 17, 'W', 'V', 'U'); flush(); // 水切りかご
}
function drawToiletInside(X, Y) { // トイレの中(タイル張り・洗面台・便器)。原点は足もとの角(幅42×奥行13)
  box(X, Y, 0, X + 16, Y + 6, 12, 'W', 'V', 'U', 'W'); flush();
  box(X + 4, Y + 1, 12, X + 12, Y + 4, 13, 'l', 'm', 'n'); flush();
  box(X + 32, Y, 0, X + 42, Y + 4, 18, 'W', 'V', 'U', 'W'); box(X + 33, Y + 4, 0, X + 41, Y + 13, 8, 'W', 'V', 'U', 'W'); flush();
}
function drawAshtray(X, Y) { // 灰皿スタンド
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 1, 'n', 'n', 'k'); flush();
  box(X - 1, Y - 1, 1, X + 1, Y + 1, 18, 'l', 'm', 'n'); flush();
  box(X - 4, Y - 4, 18, X + 4, Y + 4, 21, 'l', 'm', 'n', 'W'); flush();
  wp(X, Y, 21, cc('k')); wp(X + 1, Y, 21, cc('k')); flush(false);
}
function drawOutdoorRain(f) { // 屋外(outdoor)の部屋は雨・雪が降る
  if (WEATHER !== 'rain' && WEATHER !== 'snow') return;
  CUR_AREA = 255;
  const R = rng(17), rain = WEATHER === 'rain';
  for (const o of f.rooms.filter(r => r.out).map(r => r.rects[0])) for (let i = 0; i < 60; i++) {
    const X = o[0] + R() * (o[2] - o[0]), Y = o[1] + R() * (o[3] - o[1]), ph = R() * 60, Z = 70 - ((animT * (rain ? 9 : 2) + ph) % 70);
    const x = PX(X, Y), y = PY(X, Y, Z);
    if (rain) { lp(x, y, cc('l')); lp(x - 1, y + 2, cc('l')); } else { lp(x, y, cc('W')); lp(x + 1, y, cc('W')); }
    if (rain && Z < 9) { lp(PX(X, Y) - 1, PY(X, Y, 0), cc('l')); lp(PX(X, Y) + 1, PY(X, Y, 0), cc('l')); }
  }
  flush(false);
}
// 窓ぎわ・壁ぎわの小物: ハンガーラック・白い空気清浄機・からし色のキャビネット・白いゴミ箱
function drawHangerRackX(X0, X1, Y) { // ハンガーラック(窓と平行): 木のハンガーと紺の上着
  for (const x of [X0, X1 - 1]) { box(x, Y - 3, 0, x + 1, Y + 3, 1, 'l', 'l', 'm'); box(x, Y, 1, x + 1, Y + 1, 32, 'W', 'l', 'm'); }
  box(X0, Y, 31, X1, Y + 1, 32, 'W', 'l', 'm'); flush(true, 'm');
  for (let x = X0 + 3; x < X1 - 3; x += 3) for (let z = 24; z < 31; z++) wp(x, Y, z, cc(z === 30 ? 'm' : z > 27 ? 'c' : 'd'));
  for (let x = X1 - 9; x < X1 - 3; x++) for (let z = 12; z < 28; z++) wp(x, Y + 1, z, cc(z > 25 ? 'N' : 'k'));
  flush(false);
}
function drawPillarStub(X0, Y0) { // 出っ張った柱(輪切り)。原点は角(幅16×奥行10)
  box(X0, Y0, 0, X0 + 16, Y0 + 10, CUTH, 'U', 'f', 'f', 'W'); for (let X = X0; X < X0 + 16; X++) wp(X, Y0, CUTH, cc('n')); for (let Y = Y0; Y < Y0 + 10; Y++) wp(X0 + 16, Y, CUTH, cc('n')); flush(true, 'U');
}
function drawMustardCabinetX(X0, X1, Y0, back) { box(X0, Y0, 0, X1, Y0 + 9, 14, 'Y', 'O', 'O', 'Y'); if (!back) for (let X = X0; X < X1; X++) wp(X, Y0 + 9, 7, cc('d')); flush(); } // back: 扉の線なし
function drawAirPurifier(X, Y) { box(X - 3, Y - 3, 0, X + 3, Y + 3, 15, 'W', 'V', 'U', 'W'); for (let y = Y - 2; y < Y + 3; y++) wp(X + 3, y, 11, cc('l')); wp(X + 3, Y, 13, cc('q')); flush(); }
function drawTrashBin(X, Y) { box(X - 2, Y - 2, 0, X + 2, Y + 2, 7, 'W', 'V', 'U', 'W'); for (let i = -2; i < 2; i++) { wp(X + i, Y + 2, 6, cc('G')); wp(X + 2, Y + i, 6, cc('G')); } flush(); } // 袋のかかった白いゴミ箱
function drawWoodDesk(b, X, Y, st) { // 広めの机: 明るい木の天板にグレーのスチール脚、黒いPC本体。原点は椅子の位置。bは机の箱(椅子から見て前)
  const occ = occupantOf(st), X0 = X + b[0], X1 = X + b[3], Y0 = Y + b[1], Y1 = Y + b[4], f = st.face;
  for (const [x, y] of [[X0 + 1, Y0 + 1], [X1 - 3, Y0 + 1], [X0 + 1, Y1 - 3], [X1 - 3, Y1 - 3]]) box(x, y, 0, x + 2, y + 2, 11, 'l', 'm', 'n');
  flush();
  box(X0, Y0, 11, X1, Y1, 13, 'a', 'b', 'c', 'a'); flush();
  box(X0 + 6, Y0 + 4, 0, X0 + 12, Y0 + 12, 14, 'k', 'k', 'K', 'n'); flush(); // PC本体(机の下)
  box(X0 + 4, Y1 - 10, 13, X0 + 10, Y1 - 4, 14, 'W', 'V', 'U'); flush(); // 書類
  if (occ) deskPC(occ, deskCorner(f, X0, Y0, X1, Y1), (f === 'SW' || f === 'NE' ? X1 - X0 : Y1 - Y0) / 2, PC_DIR[f], 13); // パソコンは座っている人のきせかえ
}
function plantSmallOn(X, Y, Z) {
  box(X - 3, Y - 3, Z, X + 3, Y + 3, Z + 5, 'W', 'V', 'U'); flush();
  const x = PX(X, Y), y = PY(X, Y, Z + 5);
  canopy(x, y - 2, [[0, -3, 3], [-3, -1, 2], [3, -1, 2]]); flush();
}
const BLOBS_BIG = [[0, -14, 4], [-5, -11, 4], [5, -11, 4], [-1, -8, 5], [-7, -5, 4], [6, -5, 4], [0, -3, 5], [-4, 1, 4], [4, 1, 4]];
const BLOBS_MED = [[0, -12, 3], [-4, -9, 3], [3, -9, 3], [0, -7, 3], [-5, -4, 3], [4, -4, 3], [-1, -2, 3], [3, -1, 2]];
function plantBig(X, Y, pot) {
  const P = pot || ['W', 'V', 'U'];
  box(X - 5, Y - 5, 0, X + 5, Y + 5, 10, P[0], P[1], P[2]); flush();
  wp(X, Y, 10, cc('e')); wp(X, Y, 11, cc('e')); wp(X, Y, 12, cc('e')); flush(false);
  canopy(PX(X, Y), PY(X, Y, 11) - 6, BLOBS_BIG); flush();
}
function plantMed(X, Y, pot) {
  const P = pot || ['O', 'O', 'd'];
  box(X - 4, Y - 4, 0, X + 4, Y + 4, 7, P[0], P[1], P[2]); flush();
  canopy(PX(X, Y), PY(X, Y, 7) - 2, BLOBS_MED); flush();
}
function drawPrinter(X0, Y0, back) { // 複合機(コピー機): 白い本体に給紙カセットの段、上にグレーの原稿台のふた、手前に紙ののった給紙トレイ、横に小さい操作パネル(文字なし・飾り)
  const X1 = X0 + 20, Y1 = Y0 + 16;
  box(X0, Y0, 0, X1, Y1, 15, 'W', 'V', 'U', 'W');
  if (!back) { for (let X = X0 + 1; X < X1; X++) for (const Z of [5, 10]) wp(X, Y1, Z, cc('U')); // 給紙カセットの段
    for (const Z of [3, 8]) for (let X = X0 + 8; X < X0 + 12; X++) wp(X, Y1, Z, cc('m')); } // 取っ手(向きがx-・y-の背面は無し)
  flush(true, 'U');
  box(X0 + 1, Y0 + 1, 15, X1 - 1, Y1 - 1, 18, 'l', 'm', 'n', 'l'); flush(); // 原稿台のふた
  for (let X = X0 + 3; X < X1 - 3; X++) wp(X, Y1 - 1, 17, cc('k')); flush(false); // ふたを開ける手前のすき間
  if (back) { for (let X = X0 + 3; X < X1 - 3; X += 2) for (const Z of [4, 6, 8, 10]) wp(X, Y1, Z, cc('U')); flush(false); return; } // 背面は通風口だけ
  box(X0 + 5, Y1, 9, X1 - 5, Y1 + 4, 10, 'l', 'm', 'n'); flush(); // 手前の給紙トレイ
  box(X0 + 6, Y1, 10, X1 - 6, Y1 + 3, 11, 'W', 'W', 'V'); flush(); // トレイの紙
  box(X1, Y1 - 8, 13, X1 + 3, Y1 - 2, 16, 'n', 'n', 'k', 'l'); flush(); // 横の小さい操作パネル
  for (let Y = Y1 - 7; Y < Y1 - 4; Y++) wp(X1 + 1, Y, 16, cc('H')); // 画面
  wp(X1 + 1, Y1 - 3, 16, cc('R')); wp(X1 + 2, Y1 - 3, 16, cc('q')); flush(false); // ボタン
}
function drawCorkBoard(X0, X1, Y) { // 壁ぎわに立てた脚つきのコルクの掲示板。色の付いた紙を画びょうで留めてある(文字なし・飾り)
  for (const x of [X0 + 2, X1 - 3]) { box(x, Y - 1, 0, x + 1, Y + 4, 1, 'e', 'e', 'K'); box(x, Y, 1, x + 1, Y + 1, 10, 'e', 'e', 'K'); } // 足と脚
  flush();
  box(X0, Y, 10, X1, Y + 2, 30, 'd', 'b', 'd', 'c'); flush(true, 'e');
  for (let X = X0 + 1; X < X1; X++) for (let Z = 11; Z < 30; Z++) wp(X, Y + 2, Z, cc((X * 7 + Z * 3) % 11 === 0 ? 'c' : 'b')); // コルクの粒
  for (let X = X0; X <= X1; X++) { wp(X, Y + 2, 10, cc('d')); wp(X, Y + 2, 30, cc('d')); }
  for (let Z = 10; Z <= 30; Z++) { wp(X0, Y + 2, Z, cc('d')); wp(X1, Y + 2, Z, cc('d')); } // 木の枠
  for (const [x, z, w, h, col, pin] of [[2, 27, 5, 6, 'W', 'R'], [8, 28, 4, 5, 'Y', 'B'], [13, 26, 5, 7, 'p', 'R'], [3, 19, 6, 5, 'G', 'K'], [11, 18, 5, 6, 'S', 'B']]) {
    for (let X = X0 + x; X < X0 + x + w; X++) for (let Z = z - h + 1; Z <= z; Z++) wp(X, Y + 2, Z, cc(col));
    wp(X0 + x + (w >> 1), Y + 2, z, cc(pin)); // 画びょう
  }
  flush(false);
}
function drawHallTable(X, Y) { // 小さい台に植物と消毒液(エレベーターホール。原点は台の角・10×10)
  box(X, Y, 0, X + 10, Y + 10, 12, 'W', 'V', 'U', 'W'); flush();
  box(X + 1, Y + 1, 12, X + 6, Y + 6, 15, 'W', 'V', 'U'); flush(); canopy(PX(X + 3, Y + 3), PY(X + 3, Y + 3, 15) - 2, [[0, -3, 3], [-3, -1, 2], [3, -1, 2]]); flush();
  disinfectant(X + 6, Y + 6, 12);
}
function drawCoatRack(X, Y) {
  box(X - 4, Y - 1, 0, X + 4, Y + 1, 1, 'n', 'n', 'k'); box(X - 1, Y - 4, 0, X + 1, Y + 4, 1, 'n', 'n', 'k'); flush();
  box(X, Y, 1, X + 1, Y + 1, 34, 'd', 'd', 'e'); flush();
  const x = PX(X, Y), y = PY(X, Y, 34);
  spr(x - 5, y + 2, ['..NN.....', '.NNNN.RR.', '.NNNNRRRR', '.NNNNRRRR', '.NNN.RRRR', '..N...RR.', '.........'], null);
  flush();
}
function drawUmbrellaStand(X, Y) {
  box(X - 4, Y - 4, 0, X + 4, Y + 4, 9, 'n', 'n', 'k', 'm'); flush();
  const x = PX(X, Y), y = PY(X, Y, 9);
  for (const [dx, h, c] of [[-2, 8, 'B'], [0, 11, 'R'], [2, 9, 'Y']]) { for (let i = 0; i < h; i++) lp(x + dx, y - i, cc(c)); lp(x + dx, y - h, cc('k')); lp(x + dx + 1, y - h, cc('k')); }
  flush();
}

/* ============================================================
   壁と窓。外壁(window・outer)は、床が壁のカメラ側(+X・+Y)にあれば奥の壁として高さいっぱいに、床が壁の奥側(-X・-Y)にあればカメラ側の壁として腰の高さで切って描く(中が見える)
   ============================================================ */
function windowRows(w, h, seed, blinds) {
  const R = rng(seed), rows = [];
  const mid = Math.floor(w / 2), tr = Math.floor(h * 0.32);
  const bh = new Array(w).fill(0);
  let u = 1; while (u < w - 1) { const bw = 4 + Math.floor(R() * 6), hh = 4 + Math.floor(R() * 9); for (let i = 0; i < bw && u + i < w; i++) bh[u + i] = hh; u += bw + (R() < 0.4 ? 1 : 0); }
  const cloud = [Math.floor(R() * Math.max(1, w - 12)) + 3, 3 + Math.floor(R() * 3)];
  const night = TIME === 'night';
  for (let v = 0; v < h; v++) {
    let row = '';
    for (let u2 = 0; u2 < w; u2++) {
      let ch = 'x';
      const fb = h - 1 - v;
      if (fb < bh[u2]) ch = ((u2 % 3 === 1) && (fb % 3 === 1) && fb < bh[u2] - 1) ? (night ? 'i' : 'W') : 'z';
      const dx = u2 - cloud[0], dy = v - cloud[1];
      if (WEATHER !== 'sunny' || !night) if ((dy === 0 && dx >= 1 && dx <= 6) || (dy === 1 && dx >= 0 && dx <= 9) || (dy === -1 && dx >= 3 && dx <= 5)) ch = night ? 'z' : 'W';
      if (night && WEATHER === 'sunny' && ch === 'x' && ((u2 * 7 + v * 13 + seed) % 23 === 0)) ch = 'W';
      if ((WEATHER === 'rain' || WEATHER === 'snow') && fb >= bh[u2]) {
        const k = (u2 * 5 + v + animT * (WEATHER === 'rain' ? 3 : 1)) % (WEATHER === 'rain' ? 7 : 11);
        if (k === 0 && (u2 + seed) % 2 === 0) ch = WEATHER === 'rain' ? 'l' : 'W';
      }
      if (blinds && (u2 % 5 < 3) && (u2 < w * 0.42 || u2 > w * 0.82)) ch = (u2 % 5 === 1) ? 'f' : 'V'; // クリーム色の縦型ブラインド(両端に寄せてある)
      if (blinds && v === 1) ch = 'f';
      if (v === 0 || v === h - 1 || u2 === 0 || u2 === w - 1) ch = 'W';
      if (v === h - 2 && u2 > 0 && u2 < w - 1) ch = 'V';
      if (!blinds && (u2 === mid || v === tr)) ch = 'W';
      if (!blinds && u2 === mid + 1 && v > 0 && v < h - 1) ch = 'V';
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
const WIN_Z0 = 14, WIN_H = 24, WIN_W = 34, WIN_P = 40; // 窓の帯: 床からの高さ・高さ・窓1枚の幅・間隔(幅34の窓と幅6の柱)
// 壁のどちら側が床か。床が壁の奥側(-)だけにあればカメラ側の壁('cam')、そうでなければ奥側の壁('back')。p=壁に沿った位置
function wallSide(f, w, p) {
  const a = w.axis === 'y' ? floorAtF(f, w.at - 1, p) : floorAtF(f, p, w.at - 1), b = w.axis === 'y' ? floorAtF(f, w.at, p) : floorAtF(f, p, w.at);
  return a && !b ? 'cam' : 'back';
}
// 壁の線(axis y=Xがat・Yに沿う / x=Yがat・Xに沿う)に沿った箱と点。o=線からの厚み方向、p=線に沿う方向
const wbox = (w, o0, p0, z0, o1, p1, z1, ...c) => (w.axis === 'y' ? box(w.at + o0, p0, z0, w.at + o1, p1, z1, ...c) : box(p0, w.at + o0, z0, p1, w.at + o1, z1, ...c));
const wpt = (w, o, p, z, c) => (w.axis === 'y' ? wp(w.at + o, p, z, c) : wp(p, w.at + o, z, c));
const wallArea = (f, w, p) => { const i = wallSide(f, w, p) === 'cam' ? w.at - 1 : w.at; return w.axis === 'y' ? areaAt(i, p, f) : areaAt(p, i, f); }; // 壁の中側の部屋(夜の明かり)
// 奥側の外壁。厚みは床の外側。windowは窓の帯(縦型ブラインド)と窓台つき
function drawBackWall(f, w) {
  const col = w.axis === 'y' ? ['V', 'U', 'f', 'W'] : ['V', 'f', 'U', 'W'];
  for (const [a, b] of segsOf(w.a, w.b, w.gaps || [])) {
    const backs = [];
    for (let p = a; p < b; p += 8) {
      const q = Math.min(p + 8, b);
      if (wallSide(f, w, p) !== 'back') continue;
      CUR_AREA = wallArea(f, w, p);
      wbox(w, -WT, p, 0, 0, q, WH, ...col);
      for (let pp = p; pp < q; pp++) for (let Z = 0; Z < 13; Z++) wpt(w, 0, pp, Z, cc(Z < 3 ? 'U' : Z === 12 ? 'V' : Z === 11 ? 'U' : 'f')); // 幅木・腰の線
      backs.push([p, q]);
    }
    const wins = [];
    if (w.kind === 'window') for (let s = a + 8; s + WIN_W <= b - 4; s += WIN_P) if (wallSide(f, w, s) === 'back' && wallSide(f, w, s + WIN_W - 1) === 'back') wins.push(s);
    for (const s of wins) { CUR_AREA = wallArea(f, w, s); if (w.axis === 'y') paintR(w.at, s + WIN_W, WIN_Z0 + WIN_H - 1, windowRows(WIN_W, WIN_H, s * 5 + 11, true)); else paintL(w.at, s, WIN_Z0 + WIN_H - 1, windowRows(WIN_W, WIN_H, s * 7 + 3, true)); }
    CUR_AREA = 254;
    for (const [p, q] of backs) wbox(w, -WT, p, WH, 0, q, WH, ...col);
    flush();
    for (const s of wins) { CUR_AREA = wallArea(f, w, s); wbox(w, 0, s - 1, WIN_Z0 - 2, 3, s + WIN_W + 1, WIN_Z0, 'W', 'V', 'U', 'W'); }
    flush();
  }
}
// カメラ側の外壁の1区切り: 腰の高さで切る。窓の所は窓台の高さ
function drawOuterStub(w, a, b, run) {
  const win = w.kind === 'window' && md((a + b) / 2 - run[0] - 8, WIN_P) < WIN_W;
  wbox(w, -3, a, 0, 0, b, win ? 10 : 8, win ? 'W' : 'n', 'X', 'Z', 'm');
  flush();
}
// 屋外の手すり(rail): 低い台・細い柱・上の横木。床の外側に立てる
function drawRail(f, w, a, b) {
  const s = wallSide(f, w, a) === 'cam' ? 0 : -3;
  wbox(w, s, a, 0, s + 3, b, 3, 'l', 'm', 'm'); flush();
  for (let p = a; p < b; p++) if (md(p - w.a, 6) === 2) wbox(w, s + 1, p, 3, s + 2, p + 1, 10, 'l', 'l', 'm');
  flush(false);
  wbox(w, s, a, 10, s + 3, b, 12, 'W', 'V', 'l', 'W'); flush(true, 'm');
}
/* ============================================================
   床(色は一度だけ計算しておく。影だけ毎回)
   ============================================================ */
const SH = new Uint8Array(FW * FH);
function shadowRect(X0, Y0, X1, Y1, h) {
  const s = Math.round(h * 0.45);
  for (let Y = Math.max(YA, Y0 + 1); Y < Math.min(YE, Y1 + 2); Y++) for (let X = Math.max(XB, X0 + 1); X < Math.min(XE, X1 + s); X++) SH[fIdx(X, Y)] = 1;
}
const slabFace = Z => (Z === -2 ? 'e' : Z === -SLAB + 1 ? 'n' : 'Z');
function drawFloor(f) {
  CUR_AREA = 255;
  // 描く範囲(CX0〜CY1)に入る列だけ回す。行Yごとに、画面xが範囲に入るXと、画面yが範囲に入るX(スラブの深さ分と余白を足す)の重なり
  const rowX = Y => [Math.max(XB, CX0 - 3 - OX + Y, 2 * (CY0 - OY - 12) - Y), Math.min(XE, CX1 + 3 - OX + Y + 1, 2 * (CY1 - OY + 12) - Y + 1)];
  // 床スラブ(輪切りの断面はコンクリート)。床の外に面したカメラ側(+X・+Y)の辺
  for (let Y = YA; Y < YE; Y++) for (let X = rowX(Y)[0], xe = rowX(Y)[1]; X < xe; X++) {
    const i = fIdx(X, Y); if (!f.floorC[i]) continue;
    if (X + 1 >= XE || !f.floorC[i + 1]) for (let Z = -SLAB; Z <= 0; Z++) wp(X + 1, Y, Z, cc(Z === 0 ? 'b' : Z === -1 ? 'Z' : slabFace(Z)));
    if (Y + 1 >= YE || !f.floorC[i + FW]) for (let Z = -SLAB; Z <= 0; Z++) wp(X, Y + 1, Z, cc(Z === 0 ? 'b' : Z === -2 ? 'd' : Z === -SLAB + 1 ? 'Z' : 'X'));
  }
  flush(false);
  for (let Y = YA; Y < YE; Y++) for (let X = rowX(Y)[0], xe = rowX(Y)[1]; X < xe; X++) {
    const i = fIdx(X, Y); let c = f.floorC[i]; if (!c) continue;
    const a = f.areaMap[i];
    if (SH[i] || !(X - 2 >= XB && f.floorC[i - 1] && f.floorC[i - 2])) c = DK[c]; // 影と、奥の壁ぎわ2マス
    CUR_AREA = f.outAreas.has(a) ? 255 : a;
    // wp(X, Y, 0, c)と同じ(TRは無し・整数の座標)。床は1画素ずつ数十万回呼ぶのでlpを展開
    const x = OX + X - Y, y = OY + ((X + Y) >> 1);
    if (x < CX0 || y < CY0 || x >= CX1 || y >= CY1) continue;
    const j = y * CW + x; L[j] = c; LZ[j] = CUR_AREA;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  CUR_AREA = 255;
  flush();
}
function floorRing(cx, cy, r, c1, c2, fill) {
  CUR_AREA = areaAt(cx, cy);
  for (let Y = cy - r; Y <= cy + r; Y++) for (let X = cx - r; X <= cx + r; X++) {
    const d = Math.max(Math.abs(X - cx), Math.abs(Y - cy));
    if (d >= r - 1) wp(X, Y, 0, cc(c1)); else if (d === r - 2) wp(X, Y, 0, cc(c2)); else if (fill) wp(X, Y, 0, cc(fill));
  }
  flush(false);
}

/* ============================================================
   歩く(A*): 8単位のマス。壁の線はすべて8の倍数なので、マスの辺で塞げる(扉のところだけ通れる)。家具のある所と床の外は通れない。
   歩く経路は8単位のマス(wgx・wtx)
   ============================================================ */
const G = 8, NGX = Math.ceil(FW / G), NGY = Math.ceil(FH / G); // shortcut: 部屋のrectsは8の倍数の座標に乗せる(歩くマスはXB・YAから8単位)
const wgx = X => Math.floor((X - XB) / G), wgy = Y => Math.floor((Y - YA) / G);
const wtx = gx => XB + gx * G + 4, wty = gy => YA + gy * G + 4;
// 入口(props.entranceの置き物。カタログのentrance)。in: 入室した人が現れる所、tile: 扉の前のマス、at: 扉の前、box: 入口の箱(中の人は見せない)。入口の無い階は最初の部屋の真ん中
const ENTRANCE = {};
for (const f of FLS) {
  const it = f.fm.items.find(i => i.props?.entrance), c = it && CATALOG[it.type]?.entrance ? CATALOG[it.type] : null;
  if (c) { const b = c.boxes(it.dir, {})[0].b, at = { x: it.x + c.entrance.out[0], y: it.y + c.entrance.out[1] }; ENTRANCE[f.id] = { in: { x: it.x + c.entrance.in[0], y: it.y + c.entrance.in[1] }, tile: [wgx(at.x), wgy(at.y)], at, box: [it.x + b[0], it.y + b[1], it.x + b[3], it.y + b[4]] }; }
  else { const q = f.rooms[0]?.rects[0] || [0, 0, 0, 0], at = { x: (q[0] + q[2]) >> 1, y: (q[1] + q[3]) >> 1 }; ENTRANCE[f.id] = { in: { ...at }, tile: [wgx(at.x), wgy(at.y)], at, box: [0, 0, 0, 0] }; }
}
// 階ごとの歩ける所。block: 1=床の外 / 2=家具。edges: 1=右(+X)のマスへ行けない / 2=下(+Y)のマスへ行けない。soft: ボックス席・集中ソファなど家具に囲まれた席がある階は、出発と行き先の3マス以内だけ家具の上も通す(無ければ-1)
function makeGrid(f) {
  const B = new Uint8Array(NGX * NGY), E = new Uint8Array(NGX * NGY);
  for (let gy = 0; gy < NGY; gy++) for (let gx = 0; gx < NGX; gx++) if (!floorAtF(f, wtx(gx), wty(gy))) B[gy * NGX + gx] = 1;
  const mark = (x0, y0, x1, y1) => { for (let gy = wgy(y0); gy <= wgy(y1 - 1); gy++) for (let gx = wgx(x0); gx <= wgx(x1 - 1); gx++) if (gx >= 0 && gy >= 0 && gx < NGX && gy < NGY) B[gy * NGX + gx] = B[gy * NGX + gx] || 2; };
  for (const o of f.objs) if (o.block) mark(o.x0 + 1, o.y0 + 1, o.x1 - 1, o.y1 - 1);
  for (const w of f.walls) for (const [a, b] of segsOf(w.a, w.b, w.gaps || [])) {
    if (w.axis === 'y') { const g = wgx(w.at) - 1; if (g >= 0) for (let gy = 0; gy < NGY; gy++) { const c = wty(gy); if (c >= a && c < b) E[gy * NGX + g] |= 1; } }
    else { const g = wgy(w.at) - 1; if (g >= 0) for (let gx = 0; gx < NGX; gx++) { const c = wtx(gx); if (c >= a && c < b) E[g * NGX + gx] |= 2; } }
  }
  f.block = B; f.edges = E; f.soft = SEATS.some(s => s.floor === f.id && CUSTOM_SEATS.has(s.type)) ? 3 : -1;
}
function buildGrid() { FLS.forEach(makeGrid); }
const edgeBlocked = (E, x, y, nx, ny) => (nx > x ? E[y * NGX + x] & 1 : nx < x ? E[y * NGX + nx] & 1 : ny > y ? E[y * NGX + x] & 2 : E[ny * NGX + x] & 2);
function findPath(sx, sy, tx, ty, fl) { // 二分ヒープのA*。返すのはマスの並び [[gx, gy], ...]。fl=階のid
  const N = NGX * NGY, key = (x, y) => y * NGX + x, g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const B = FL[fl].block, E = FL[fl].edges, soft = FL[fl].soft, near = (x, y, ax, ay) => Math.max(Math.abs(x - ax), Math.abs(y - ay)) <= soft;
  const free = (x, y) => x >= 0 && y >= 0 && x < NGX && y < NGY && (!B[key(x, y)] || (x === tx && y === ty) || (x === sx && y === sy) || (B[key(x, y)] === 2 && (near(x, y, sx, sy) || near(x, y, tx, ty))));
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  const heap = []; // [f, k]
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  if (!free(sx, sy) || !free(tx, ty)) return null;
  g[key(sx, sy)] = 0; push(h(sx, sy), key(sx, sy));
  while (heap.length) {
    const [, k] = pop(); if (done[k]) continue; done[k] = 1;
    const x = k % NGX, y = (k / NGX) | 0;
    if (x === tx && y === ty) { const path = []; for (let c = k; c >= 0; c = came[c]) path.unshift([c % NGX, (c / NGX) | 0]); return path; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!free(nx, ny) || edgeBlocked(E, x, y, nx, ny)) continue;
      const nk = key(nx, ny), ng = g[k] + (soft > 0 && B[nk] === 2 ? 4 : 1); // 家具の上は遠回りしてでも避ける
      if (ng < g[nk]) { g[nk] = ng; came[nk] = k; push(ng + h(nx, ny), nk); }
    }
  }
  return null;
}
/* ============================================================
   置き物の一覧(並べ替えて奥から描く)
   ============================================================ */
// 置き物の箱(並べ替えと歩けない範囲)はカタログ(CATALOG[type].boxes)から作る。絵はDRAW[type]。壁と扉は階のマップから
for (const fl of FLS) {
  const fm = fl.fm, out = fl.objs, walls = fl.walls, rooms = fl.rooms;
  // pt: 明るさ(area)を決める点。無ければ箱の真ん中。扉は壁の+側の部屋で決める
  const add = (x0, y0, z0, x1, y1, z1, draw, block = true, pt = [(x0 + x1) >> 1, (y0 + y1) >> 1]) => out.push({ x0, y0, z0, x1, y1, z1, draw, block, pt, area: rooms.some(r => r.out && r.rects.some(q => inRect(pt[0], pt[1], q))) ? 'out' : undefined });
  for (const it of fm.items) {
    const c = CATALOG[it.type];
    if (!c?.dirs) continue; // プラグインが外れて、カタログに無い置き物は飛ばす
    if (!c.dirs.includes(it.dir)) throw new Error(`Unsupported item: ${it.type} ${it.dir}`);
    const props = { ...c.props, ...it.props }, [nd, tr] = planOf(c.art || c.dirs, c.sym, it.dir); // 絵の向きndと、転置で描くか(catalog.jsのplanOf)
    const live = !it.season || it.season === SEASON; // shortcut: 歩けない範囲は開いた時点の季節で決める(季節がまたぐ瞬間は開き直すまで古い)
    const paint = part => () => { if (it.season && it.season !== SEASON) return; TR = tr ? [it.x, it.y] : null; try { DRAW[it.type]?.(it.x, it.y, nd, props, it, part); } finally { TR = null; } };
    (c.boxes?.(it.dir, props) || []).forEach(({ b, block = true, draw = true }, part) => add(it.x + b[0], it.y + b[1], b[2], it.x + b[3], it.y + b[4], b[5], draw ? paint(part) : () => {}, block && live));
  }
  // 壁は16単位ずつに分けて並べ替える(扉のところは開ける)。奥側の外壁は先に描く(drawBackWall)。カメラ側の外壁(window・outer)は腰の高さで切り、手すり(rail)は床の外側に立てる
  for (const w of walls) { if (w.kind === 'none') continue; for (const run of segsOf(w.a, w.b, w.gaps || [])) for (let a = run[0]; a < run[1]; a += 16) {
    const b = Math.min(run[1], a + 16), back = wallSide(fl, w, (a + b) >> 1) === 'back', outer = w.kind === 'window' || w.kind === 'outer', rail = w.kind === 'rail';
    if (outer && back) continue;
    const o0 = outer ? -3 : rail ? (back ? -3 : 0) : -2, o1 = outer ? 0 : rail ? o0 + 3 : 2;
    const h = outer ? 10 : rail ? 12 : w.kind === 'glass' || w.kind === 'slat' ? 38 : w.kind === 'panel' ? 40 : (w.h || CUTH);
    const draw = () => (outer ? drawOuterStub(w, a, b, run) : rail ? drawRail(fl, w, a, b) : drawWallSeg(w, a, b, run));
    const i = back ? w.at : w.at - 1, pt = outer || rail ? (w.axis === 'y' ? [i, (a + b) >> 1] : [(a + b) >> 1, i]) : undefined;
    if (w.axis === 'y') add(w.at + o0, a, 0, w.at + o1, b, h, draw, false, pt);
    else add(a, w.at + o0, 0, b, w.at + o1, h, draw, false, pt);
  } }
  for (const w of walls) if (w.kind === 'panel') for (const [g0, g1] of w.gaps || []) { // パネルの壁の扉の上にも上の白い枠を渡す(壁の上端の線をつなぐ)
    const bx = w.axis === 'y' ? [w.at - 1, g0, 39, w.at + 1, g1, 40] : [g0, w.at - 1, 39, g1, w.at + 1, 40];
    add(...bx, () => { box(...bx, 'W', 'V', 'V'); flush(true, 'U'); }, false);
  }
  // 扉のカメラ側はat+2まで(レバーのあるswingだけat+3)。壁の面のカードリーダー(at+2〜at+3)と箱が重なると前後が逆になり、並べ替えが循環する
  for (const d of fl.doors) { const f = d.at + (d.kind === 'swing' ? 3 : 2); const pt = d.axis === 'y' ? [d.at, (d.a + d.b) >> 1] : [(d.a + d.b) >> 1, d.at]; if (d.axis === 'y') add(d.at - (d.kind === 'swing' ? d.b - d.a : 2), d.a - 3, 0, f, d.b + 6, 30, () => drawDoor(d), false, pt); else add(d.a - 3, d.at - 2, 0, d.b + 6, f, 30, () => drawDoor(d), false, pt); }
  for (const d of fl.doors) if (d.kind === 'lock' || d.kind === 'lockw') { const r = readerAt(d); add(...(d.axis === 'y' ? [d.at + 2, r + 1, 13, d.at + 3, r + 5, 23] : [r + 1, d.at + 2, 13, r + 5, d.at + 3, 23]), () => cardReader(d), false); } // 壁の面のカードリーダー
}
// カタログidごとの絵。(X, Y, dir, props, it, part): X,Yは置き物の原点、partはboxesの何番目か。席は`${it.id}-${番号}`
const seatOf = (it, n = 1) => dseat(`${it.id}-${n}`);
/* ============================================================
   季節の飾り(置き物。マップのitemにseasonを付けると、そのイベントのときだけ描く)。絵は文字を含まない
   ============================================================ */
const isLit = () => TIME === 'night' || TIME === 'evening';
const standAt = (X, Y, Z, rows, map) => { sprAt(X, Y, Z, rows, rows[0].length >> 1, rows.length - 1, map); }; // 足もとの真ん中に立てる
const dbl = rows => rows.flatMap(r => { const w = [...r].map(ch => ch + ch).join(''); return [w, w]; }); // 2倍の大きさ
const potBox = (X, Y, r, h, c, z0 = 0) => { box(X - r, Y - r, z0, X + r, Y + r, z0 + h, ...(c || ['k', 'n', 'k']), 'n'); flush(); };
const BLOBS_TREE = [[0, -12, 7], [-9, -7, 6], [9, -7, 6], [-4, -17, 6], [5, -18, 6], [-14, -1, 5], [14, 0, 5], [0, -3, 7], [-7, 2, 5], [8, 3, 5], [-2, -24, 5]];
const TREE_COLS = { sakura: [['+', 'R', 'R'], ['W', '+']], maple: [['Y', 'O', 'R'], ['R', 'Y']], peach: [['W', '+', 'R'], ['W', 'R']] };
function seasonTree(X, Y, style) {
  const cols = TREE_COLS[style] || TREE_COLS.sakura;
  potBox(X, Y, 5, 8, null); box(X - 1, Y - 1, 8, X + 1, Y + 1, 34, 'd', 'd', 'e'); flush();
  const x = PX(X, Y), y = PY(X, Y, 34);
  canopy(x, y - 6, BLOBS_TREE, cols[0]); flush();
  const R = rng(X * 7 + Y); for (let i = 0; i < 40; i++) lp(x + Math.round((R() - 0.5) * 34), y - 6 + Math.round((R() - 0.7) * 32), cc(cols[1][i % 2])); flush(false); // 花・葉の粒
}
function kadomatsu(X, Y) { // 竹3本(切り口は斜め)・松・梅・わらの台
  box(X - 5, Y - 5, 0, X + 5, Y + 5, 9, 'b', 'c', 'd', 'a');
  for (const z of [3, 6]) for (let i = -5; i <= 5; i++) { wp(X + i, Y + 5, z, cc('e')); wp(X + 5, Y + i, z, cc('e')); }
  flush();
  const x = PX(X, Y), y = PY(X, Y, 9);
  [[-4, 18], [0, 25], [4, 15]].forEach(([dx, h]) => { for (let v = 0; v < h; v++) for (let u = 0; u < 3; u++) { if (v > h - 4 + u) continue; lp(x + dx + u - 1, y - v, cc(v === h - 4 + u ? 'W' : v > h - 6 + u ? 'p' : (v % 7 === 3 || u === 2 ? 'r' : 'q'))); } });
  flush();
  canopy(x, y - 3, [[-7, 0, 3], [7, 0, 3], [-4, -3, 3], [4, -3, 3], [0, -1, 3]], ['q', 'r', 'k']); flush();
  for (const [dx, dy] of [[-6, -2], [5, -4], [-2, -5], [7, 0]]) { lp(x + dx, y + dy, cc('R')); lp(x + dx + 1, y + dy, cc('W')); }
  flush(false);
}
const daruma = (X, Y) => { standAt(X, Y, 0, ['...RRRRR...', '..RRRRRRR..', '.RRWWWWWRR.', '.RWWKWKWWR.', 'RRWWWWWWWRR', 'RRRWWWWWRRR', 'RRYRRRRRYRR', 'RRRYRRRYRRR', 'RRRRYYYRRRR', '.RRRRRRRRR.', '..QQQQQQQ..']); flush(); };
const ONI = ['W.........W', 'WW.kkkkk.WW', '.Wkkkkkkk.W', '.ccccccccc.', 'cKYcccccYKc', 'cYYcccccYYc', 'ccccdcdcccc', 'cWcccccccWc', '.cWWWWWWWc.', '..ccccccc..'];
function oniStandee(X, Y) { // 豆まきの鬼の立て看板(金棒を持つ)
  const body = ONI.map(r => r + '.').concat(['...ccccc....', '.ccccccccc.k', 'cccccccccclk', 'ccccccccc.kl', 'cYkYkYkYc.lk', 'cYYkYYkYc.kl', '.YkYYkYY..lk', '.cc...cc..kk', '.cc...cc....', 'kkk...kkk...']).map(r => r.replace(/c/g, 'R').replace(/d/g, 'Q'));
  box(X - 5, Y - 3, 0, X + 5, Y + 3, 2, 'd', 'c', 'e'); flush(); standAt(X, Y, 2, dbl(body)); flush();
}
function balloonBunch(X, Y, palette) { // おもりから風船の束(ゆれる)
  const cols = { pink: ['R', '+', 'R', 'W', '+'], blue: ['B', 'H', 'W', 'G', 'B'], party: ['R', 'Y', 'B', 'q', 'R'] }[palette] || ['R', '+', 'R', 'W'];
  box(X - 2, Y - 2, 0, X + 2, Y + 2, 3, 'l', 'm', 'n'); flush();
  const x = PX(X, Y), y = PY(X, Y, 3), pos = [[0, -40], [-8, -34], [8, -35], [-4, -46], [5, -47], [-11, -44], [11, -43]].map(([dx, dy], i) => [dx, dy + ((animT + i) % 4 < 2 ? 0 : 1)]);
  for (const [dx, dy] of pos) for (let k = 0; k < -dy - 4; k++) lp(x + Math.round(dx * k / -dy), y - k, cc('l'));
  flush(false);
  pos.forEach(([dx, dy], i) => { const c = cols[i % cols.length]; spr(x + dx - 2, y + dy - 6, ['.' + c + c + c + '.', c + 'W' + c + c + c, c + 'W' + c + c + c, c + c + c + c + c, '.' + c + c + c + '.', '..' + c + '..']); });
  flush();
}
function hinaStand(X, Y) { // ひな壇(5段。+Xが手前)。上から内裏びな・三人官女・五人囃子・随身。金屏風とぼんぼり
  const D = 30, W = 32;
  for (let i = 0; i < 5; i++) box(X, Y, 0, X + D - i * 6, Y + W, 6 * (i + 1), 'R', 'R', 'Q', 'R');
  flush();
  box(X, Y + 4, 30, X + 2, Y + W - 4, 44, 'Y', 'O', 'O', 'Y'); flush();
  const doll = (x, y, robe, robe2) => spr(x - 2, y - 6, ['.kk.', '.WW.', robe + robe2 + robe2 + robe, robe + robe2 + robe2 + robe, robe + robe + robe + robe, robe + robe + robe + robe]);
  const tier = (k, dys, f) => dys.forEach((dy, i) => { const X1 = X + 27 - k * 6, Y1 = Y + dy, Z = 6 * (k + 1); f(PX(X1, Y1), PY(X1, Y1, Z), i); });
  tier(4, [12, 20], (x, y, i) => doll(x, y, i ? 'R' : 'k', i ? 'Y' : 'N'));
  tier(3, [8, 16, 24], (x, y) => doll(x, y, 'W', 'R'));
  tier(2, [5, 11, 16, 21, 27], (x, y, i) => spr(x - 1, y - 5, ['k.', 'WW', 'BW', 'BB', 'kk'].map(r => (i % 2 ? r.replace(/B/g, 'q') : r))));
  tier(1, [6, 26], (x, y) => doll(x, y, 'N', 'k'));
  tier(1, [12, 20], (x, y, i) => { canopy(x, y - 4, [[0, 0, 2]], i ? ['+', 'R', 'R'] : ['q', 'r', 'r']); });
  tier(0, [6, 13, 20, 26], (x, y, i) => spr(x - 1, y - 2, i % 2 ? ['kk', 'kY'] : ['YY', 'kk']));
  flush();
  for (const dy of [3, 29]) { const x = PX(X + 3, Y + dy), y = PY(X + 3, Y + dy, 30); spr(x - 1, y - 7, ['.W.', 'W*W', 'W*W', '.k.', '.k.', '.k.', 'kkk'], isLit() ? null : { '*': '+' }); }
  flush();
}
function peachVase(X, Y) { // 桃の花の枝を生けた花瓶
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 9, 'B', 'B', 'N', 'W'); flush();
  const x = PX(X, Y), y = PY(X, Y, 9), R = rng(X + Y), br = [[-7, -16], [0, -20], [7, -15], [-4, -12], [4, -13]];
  for (const [dx, dy] of br) for (let i = 0; i < 12; i++) lp(x + Math.round(dx * i / 11), y + Math.round(dy * i / 11), cc('e'));
  flush();
  for (let i = 0; i < 26; i++) { const t = R(), b = br[i % 5], px = x + Math.round(b[0] * (0.4 + t * 0.6)), py = y + Math.round(b[1] * (0.4 + t * 0.6)); lp(px, py, cc(i % 3 ? '+' : 'R')); lp(px + 1, py, cc('+')); lp(px, py - 1, cc(i % 4 ? 'W' : '+')); }
  flush(false);
}
function carpBanner(Xp, Y, Z, len, c, belly) { // 鯉(X=Xpの面に描く旗。頭がY、しっぽは-Yへ)
  for (let u = 0; u < len; u++) {
    const t = u / len, half = Math.round(len * 0.18 * (t < 0.15 ? 0.75 + t : t > 0.8 ? 1 - (t - 0.8) * 2.5 : 1)), wav = Math.round(Math.sin(t * 6 + Xp) * 1.5);
    for (let v = -half; v <= half; v++) {
      let ch = c;
      if (u < 2) ch = v === -half || v === half ? 'W' : 'R';
      else if (u > len * 0.85) { if (Math.abs(v) < (u - len * 0.85) * 0.7) continue; }
      else if (v > half * 0.4) ch = belly;
      else if ((u + (v & 1) * 2) % 4 === 0 && v < half * 0.3) ch = belly;
      if (u >= 3 && u <= 5 && v === Math.round(-half * 0.4)) ch = u === 4 ? 'k' : 'W';
      wp(Xp, Y - u, Z - v + wav, cc(ch));
    }
  }
  flush();
}
function koinobori(X, Y) { // 鯉のぼり: 矢車・五色の吹き流し・鯉3匹(高さ72)
  const h = 72, s = h / 136, y0 = Y - 1;
  box(X, Y, 0, X + 2, Y + 2, h, 'W', 'l', 'm', 'W'); flush();
  spr(PX(X, Y) - 3, PY(X, Y, h) - 6, ['..Y..', '.YRY.', 'YRWRY', '.YRY.', '..Y..']); flush();
  const cols = ['B', 'R', 'Y', 'W', 'q'];
  for (let u = 0; u < Math.round(44 * s); u++) for (let v = 0; v < 10; v++) wp(X + 1, y0 - u, h - 8 - v + Math.round(Math.sin(u / 6) * 1.5), cc(cols[v >> 1]));
  flush();
  [[28, 52, 'k', 'Y'], [50, 44, 'R', 'W'], [70, 36, 'B', 'H']].forEach(([dz, len, c, b]) => carpBanner(X + 1, y0, h - Math.round(dz * s), Math.round(len * s), c, b));
}
const AJ = { blue: ['H', 'B', 'N'], purple: ['l', 'B', 'N'], pink: ['+', 'R', 'Q'] };
function hydrangea(X, Y, color) { // 紫陽花の鉢
  const cols = AJ[color] || AJ.blue;
  potBox(X, Y, 5, 7, ['W', 'V', 'U']);
  const x = PX(X, Y), y = PY(X, Y, 7);
  canopy(x, y - 3, [[-6, -1, 4], [6, -1, 4], [0, -2, 4]], ['p', 'q', 'r']); flush();
  canopy(x, y - 6, [[-5, -2, 3], [5, -3, 3], [0, -6, 4], [-2, 1, 3], [4, 1, 3]], cols); flush();
  const R = rng(X * 3 + Y); for (let i = 0; i < 14; i++) lp(x + Math.round((R() - 0.5) * 16), y - 6 + Math.round((R() - 0.5) * 10), cc(cols[0])); flush(false);
}
function openUmbrella(X, Y) { // 開いて乾かしている傘
  const R = 6, rows = [];
  for (let v = 0; v <= R; v++) { let r = ''; const hw = Math.round(R * Math.sqrt(Math.min(1, (v + 1.5) / (R * 0.55)))); for (let u = -R; u <= R; u++) r += Math.abs(u) > hw || (v === R && (u & 1)) ? '.' : (Math.floor((u + R + 1) / 3) % 2 ? 'B' : 'W'); rows.push(r); }
  for (let i = 0; i < 4; i++) rows.push('.'.repeat(R) + 'k' + '.'.repeat(R));
  rows.push('.'.repeat(R - 1) + 'kk' + '.'.repeat(R));
  standAt(X, Y, 0, rows); flush();
}
function tanabataBamboo(X, Y) { // 笹飾り(色とりどりの短冊と輪飾り)
  const h = 58;
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 7, 'd', 'c', 'e', 'b'); flush();
  box(X, Y, 7, X + 2, Y + 2, h, 'q', 'q', 'r'); flush();
  const x = PX(X, Y), y = PY(X, Y, 0), R = rng(X * 5 + Y), cols = ['R', 'Y', 'B', '+', 'B', 'W', 'q', 'O', 'G', 'H'];
  canopy(x, y - h + 6, [[0, 0, 5], [-7, 5, 4], [7, 4, 4], [-11, 12, 4], [11, 12, 4], [-5, 15, 4], [6, 17, 4], [-13, 22, 3], [12, 23, 3], [0, 10, 4]], ['p', 'q', 'r']); flush();
  for (let i = 0; i < 18; i++) { const c = cols[i % cols.length], tx = x + Math.round((R() - 0.5) * 26), ty = y - h + 6 + Math.round(R() * 26); spr(tx, ty, [c, c, c, c, 'W']); } // 短冊(文字なし)
  for (const dx of [-9, 9]) for (let k = 0; k < 6; k++) spr(x + dx - 1, y - h + 14 + k * 3, [cols[(k + dx + 20) % cols.length].repeat(3), '.' + 'W' + '.']);
  flush();
}
function lanternTower(X, Y) { // 提灯の柱(夏まつり)。夕方から光る
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 3, 'd', 'c', 'e'); box(X, Y, 3, X + 1, Y + 1, 52, 'e', 'd', 'e'); flush();
  const x = PX(X, Y), y = PY(X, Y, 0), g = isLit() ? '*' : 'O';
  for (const [dy, n] of [[-50, 2], [-40, 3], [-30, 4]]) { for (let u = -n * 5; u <= n * 5; u++) lp(x + u, y + dy, cc('e')); flush(false); for (let i = 0; i < n; i++) for (const sg of [-1, 1]) spr(x + sg * (3 + i * 5) - 2, y + dy + 1, ['.' + (i % 2 ? 'W' : 'R') + (i % 2 ? 'W' : 'R') + '.', (i % 2 ? 'W' : 'R') + g + g + (i % 2 ? 'W' : 'R'), (i % 2 ? 'W' : 'R') + g + g + (i % 2 ? 'W' : 'R'), '.kk.']); flush(); }
}
function pampasVase(X, Y) { // すすきを生けた花瓶
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 10, 'n', 'k', 'K', 'm'); flush();
  const x = PX(X, Y), y = PY(X, Y, 10);
  for (const [dx, h, bend] of [[-5, 22, -4], [-2, 28, -2], [1, 30, 2], [4, 24, 4], [6, 18, 6], [-6, 16, -6]]) for (let v = 0; v < h; v++) { const u = Math.round(bend * (v / h) ** 2); lp(x + dx + u, y - v, cc(v > h - 9 ? ((v + dx) % 3 ? 'W' : 'g') : 'h')); if (v > h - 9) lp(x + dx + u + 1, y - v, cc('V')); }
  flush();
}
const moonRabbit = (X, Y) => { standAt(X, Y, 0, ['.+..+..', '.W..W..', '.WWWW..', 'WWRWWW.', 'WWWWWWW', '.WWWWWW', '.WW.WW.']); flush(); };
function pumpkin(x, y, r, face) { // かぼちゃのランタン(画面の位置=足もと。r=半径)。顔は夕方から光る
  const h = Math.round(r * 1.5), cy = y - h;
  for (let v = -h; v <= h; v++) for (let u = -r * 2; u <= r * 2; u++) {
    if ((u / (r * 2)) ** 2 + (v / h) ** 2 > 1) continue;
    const rib = r >= 3 && (Math.abs(u) === r || (r >= 6 && Math.abs(u) === r * 2 - 3));
    lp(x + u, cy + v, cc(rib ? 'c' : u > r * 1.3 || v > h - 2 ? 'c' : u < -r && v < 0 ? 'Y' : 'O'));
  }
  for (let v = 0; v < Math.max(2, r >> 1); v++) { lp(x, cy - h - v, cc('r')); lp(x + 1, cy - h - v, cc('q')); }
  flush();
  if (face) {
    const g = isLit() ? '*' : 'K', e = Math.max(1, r >> 1);
    for (let i = 0; i < e; i++) for (let j = 0; j <= i; j++) { lp(x - r + j - 1, cy - e + i, cc(g)); lp(x + r - j, cy - e + i, cc(g)); }
    for (let u = -r; u <= r; u++) { lp(x + u, cy + e, cc(g)); if (u % 3) lp(x + u, cy + e + 1, cc(g)); }
    flush(false);
  }
}
function pumpkinPile(X, Y, big) { const x = PX(X, Y), y = PY(X, Y, 0); if (big) { pumpkin(x - 13, y - 2, 4, true); pumpkin(x + 13, y - 1, 4, false); pumpkin(x, y, 7, true); pumpkin(x - 8, y + 4, 3, false); pumpkin(x + 9, y + 4, 3, true); } else { pumpkin(x, y, 4, true); pumpkin(x + 8, y + 2, 3, false); } }
const GHOST_ROWS = ['....WWWWW....', '..WWWWWWWWW..', '.WWWWWWWWWWW.', '.WWKKWWWKKWW.', 'WWWKKWWWKKWWW', 'WWWWWWWWWWWWW', 'WWWWWKKKWWWWV', 'WWWWWKKKWWWWV', 'WWWWWWWWWWWVV', 'WWWWWWWWWWWVV', '.WWWWWWWWWWV.', 'WWWWWWWWWWVVV', 'WW.WWW.WWW.VV', 'W...W...W...V'];
const floatingGhost = (X, Y) => { sprAt(X, Y, 20 + (animT % 6 < 3 ? 0 : 2), GHOST_ROWS, 6, 13); flush(); }; // ふわふわ浮く
function xmasTree(X, Y) { // 円すいの木に金のモール・玉・色の変わる明かり、てっぺんの星
  const h = 46;
  box(X - 5, Y - 5, 0, X + 5, Y + 5, 7, 'R', 'R', 'Q', 'Y'); flush();
  const x = PX(X, Y), y = PY(X, Y, 7), k1 = Math.round(h * 0.5), k2 = Math.round(h * 0.74);
  const tiers = [[0, Math.round(h * 0.27), 1, Math.round(h * 0.15)], [Math.round(h * 0.17), k1, 3, Math.round(h * 0.24)], [Math.round(h * 0.37), k2, 5, Math.round(h * 0.33)], [Math.round(h * 0.59), h, 7, Math.round(h * 0.42)]];
  for (let v = 0; v < h; v++) {
    let hw = 0; for (const [a, b, w0, w1] of tiers) if (v >= a && v < b) hw = Math.max(hw, Math.round(w0 + (w1 - w0) * (v - a) / (b - a)));
    for (let u = -hw; u <= hw; u++) {
      let c = u > hw / 3 ? 'r' : u < -hw / 2 ? 'p' : 'q';
      if ((u * 2 - v + 60) % 11 === 0 && Math.abs(u) < hw) c = 'Y';
      const k = (u * 7 + v * 13 + 230) % 23;
      if (k === 0 && Math.abs(u) < hw) c = ['R', 'B', 'W', 'Y'][(u + v + 40) % 4];
      if ((k === 5 || k === 14) && Math.abs(u) < hw) c = ['*', 'R', 'B', 'p', '+'][(u + v + animT + 50) % 5];
      lp(x + u, y - h + v, cc(c));
    }
  }
  for (let v = 0; v < 3; v++) lp(x, y - v, cc('d'));
  flush();
  spr(x - 2, y - h - 4, ['..Y..', '.YYY.', 'YY*YY', '.Y.Y.'], { Y: animT % 2 ? 'Y' : '*' }); flush();
}
function giftPile(X, Y) { // 箱を積んで、リボンを十字に
  const set = [['R', 'Q', 'Y'], ['B', 'N', 'W'], ['q', 'r', 'R'], ['Y', 'O', 'B']];
  [[-6, -2, 7, 6], [2, -5, 6, 8], [-2, 3, 8, 5], [-4, -3, 5, 5]].forEach(([dx, dy, s, h], i) => {
    const [c, cd, rb] = set[i], x0 = X + dx, y0 = Y + dy, zb = i === 3 ? 6 : 0, m = s >> 1;
    box(x0, y0, zb, x0 + s, y0 + s, zb + h, c, c, cd); flush();
    for (let d = 0; d < s; d++) { wp(x0 + m, y0 + d, zb + h, cc(rb)); wp(x0 + d, y0 + m, zb + h, cc(rb)); }
    for (let z = zb; z <= zb + h; z++) { wp(x0 + m, y0 + s, z, cc(rb)); wp(x0 + s, y0 + m, z, cc(rb)); }
    flush(false);
    sprAt(x0 + m, y0 + m, zb + h, [rb + rb + '.' + rb + rb, '.' + rb + rb + rb + '.'], 2, 1); flush();
  });
}
const snowman = (X, Y) => { standAt(X, Y, 0, ['..kkk..', '..kkk..', '.kkkkk.', '.WWWWW.', 'WWKWKWW', 'WWWOWWW', '.RRRRR.', '..RWWWR', '.WWWWW.', 'WWWKWWW', 'WWWWWWW', 'WWWKWWW', '.WWWWW.']); flush(); };
function poinsettia(X, Y) { potBox(X, Y, 3, 6, ['O', 'O', 'd']); const x = PX(X, Y), y = PY(X, Y, 6); spr(x - 5, y - 10, ['....RR....', '.RR.RR.RR.', '.RRRQRRR..', 'RRQRYRQRR.', '.RRRQRRRR.', 'qRR.RR.Rq.', '.qq.qq.qq.', '..qqqqqq..']); flush(); }

const DRAW = {
  'desk-island': (X, Y, dir, p, it, part) => drawIslandSide({ id: it.id, axis: dir[0], cx: X, cy: Y, n: p.perSide, rev: it.dir[1] === '-' }, part),
  desk: (X, Y, dir, p, it) => { const b = CATALOG.desk.boxes(dir)[0].b; drawHeadDesk(seatOf(it), [X + b[0], Y + b[1], X + b[3], Y + b[4]]); },
  'large-desk': (X, Y, dir, p, it) => drawWoodDesk(CATALOG['large-desk'].boxes(dir)[0].b, X, Y, seatOf(it)),
  'wood-desk': (X, Y, dir, p, it) => drawWindowDesk(X, Y, seatOf(it), p.mirror),
  sofa: (X, Y, dir, p, it) => drawSofa(X, Y, dir, it),
  'coffee-table': (X, Y, dir, p) => drawCoffeeTable(X, Y, p.seats),
  elevator: (X, Y) => drawElevatorShaft(X, Y),
  'elevator-medium': (X, Y) => drawElevatorShaft(X, Y, 48, 56, 24),
  'elevator-small': (X, Y) => drawElevatorShaft(X, Y, 40, 48, 16),
  kadomatsu: (X, Y) => kadomatsu(X, Y),
  daruma: (X, Y) => daruma(X, Y),
  'oni-standee': (X, Y) => oniStandee(X, Y),
  'balloon-bunch': (X, Y, dir, p) => balloonBunch(X, Y, p.palette),
  'hina-stand': (X, Y) => hinaStand(X, Y),
  'peach-vase': (X, Y) => peachVase(X, Y),
  'season-tree': (X, Y, dir, p) => seasonTree(X, Y, p.style),
  'koinobori-pole': (X, Y) => koinobori(X, Y),
  hydrangea: (X, Y, dir, p) => hydrangea(X, Y, p.color),
  'open-umbrella': (X, Y) => openUmbrella(X, Y),
  'tanabata-bamboo': (X, Y) => tanabataBamboo(X, Y),
  'lantern-tower': (X, Y) => lanternTower(X, Y),
  'pampas-vase': (X, Y) => pampasVase(X, Y),
  'moon-rabbit': (X, Y) => moonRabbit(X, Y),
  'pumpkin-pile': (X, Y, dir, p) => pumpkinPile(X, Y, p.big),
  'floating-ghost': (X, Y) => floatingGhost(X, Y),
  'xmas-tree': (X, Y) => xmasTree(X, Y),
  'gift-pile': (X, Y) => giftPile(X, Y),
  snowman: (X, Y) => snowman(X, Y),
  poinsettia: (X, Y) => poinsettia(X, Y),
  stairs: (X, Y) => drawStairs(X, Y),
  bookshelf: (X, Y) => drawBookshelf(X, Y),
  'vending-machine': (X, Y) => drawVendingMachine(X, Y),
  'reception-counter': (X, Y) => drawReceptionCounter(X, Y),
  'entrance-door': (X, Y) => drawEntranceDoor(X, Y),
  kitchenette: drawKitchen,
  restroom: drawToiletInside,
  'hall-table': drawHallTable,
  'meeting-table': (X, Y, dir, p, it) => drawMeetTable(X, Y, it),
  'meeting-table-small': (X, Y, dir, p, it) => drawMeetTable(X, Y, it, 2),
  'display-stand': (X, Y, dir, p, it) => drawDisplayStand(X, Y, it.dir[1] === '-'),
  whiteboard: (X, Y, dir, p, it) => drawWhiteboard(X, Y, it.dir[1] === '-'),
  'bar-counter': (X, Y, dir, p, it) => drawBarCounter(X, Y, it),
  'open-shelf': drawBarShelf,
  'wall-monitor': drawBarMonitor,
  'microwave-rack': drawMicrowaveRack,
  fridge: drawFridge,
  locker: (X, Y, dir, p) => steelLocker(X, Y, p.n, 12, dir, [35, 33, 31, 7, 5]),
  'cleaning-locker': drawCleaningLocker,
  'rack-server': drawRackServer,
  'ac-unit': (X, Y, dir, p) => drawACUnits(X, Y, p.n, dir === 'y+' ? 'x' : 'y'),
  partition: (X, Y, dir, p) => drawPanel(X, Y, p.len, dir === 'y+' ? 'x' : 'y', p.h, p.style),
  'low-cabinet': drawLowCabinet,
  pillar: drawPillarStub,
  'hanger-rack': (X, Y) => drawHangerRackX(X, X + 26, Y + 3),
  'air-purifier': drawAirPurifier,
  cabinet: (X, Y, dir, p, it) => drawMustardCabinetX(X, X + 16, Y, it.dir[1] === '-'),
  'trash-bin': drawTrashBin,
  printer: (X, Y, dir, p, it) => drawPrinter(X, Y, it.dir[1] === '-'),
  'cork-board': (X, Y) => drawCorkBoard(X + 1, X + 21, Y + 2),
  'umbrella-stand': drawUmbrellaStand,
  'coat-rack': drawCoatRack,
  'ashtray-stand': drawAshtray,
  'plant-big': (X, Y, dir, p) => plantBig(X, Y, p.pot),
  'plant-tree': (X, Y, dir, p) => plantTree2(X, Y, p.pot),
  'plant-snake': plantSnake2,
  stage: drawStage2,
  lectern: drawLectern2,
  rug: (X, Y, dir, p) => drawRug4(X, Y, X + p.w, Y + p.d, p.style),
  'focus-sofa': (X, Y, dir, p, it) => drawFocus2(seatOf(it)),
  'egg-chair': (X, Y, dir, p, it) => drawEgg2(seatOf(it)),
  'cushion-bench': (X, Y, dir, p, it) => drawBench2(X, Y, it),
  'bench-corner': drawBenchL2,
  planter: (X, Y, dir, p) => woodPlanter2(X, Y, X + p.w, Y + p.d),
  'floor-lamp': tripodLamp2,
  'tea-table': drawTeaTable2,
  'tea-counter': drawTeaCounter2,
  'glass-cabinet': drawChina2,
  booth: (X, Y, dir, p, it, part) => drawBooth2(X, Y, it, ['a', 't', 'b'][part]),
  'dine-table': drawDineTable2,
  'dine-counter': drawDineCounter2,
  'beverage-station': drawDineReturn2,
  'window-counter': (X, Y, dir, p, it) => drawCounter2(X, Y + p.span[0], Y + p.span[1], p.depth, seatOf(it)),
  'phone-booth': (X, Y, dir, p, it) => drawPhoneBooth2(X, Y, it),
  'low-table': (X, Y, dir, p) => drawLowTable2(X, Y, p.plant),
  'chair-cart': (X, Y) => drawChairCart2(X + 1, Y + 1),
};
// プラグインの絵: fn(k, { x, y, dir, props, item, part, state })。投げたらその置き物だけ飛ばし、コンソールには種類ごとに1回だけ出す
const PK = { box, wp, cc, flush, spr, sprAt, standAt, paintL, paintR, PX, PY, isLit, now: () => Date.now(),
  occupantOf: id => { const st = SEAT_BY_ID.get(id), p = st && occupantOf(st); return p ? { id: p.id, name: p.name } : null; } };
const PLUGIN_ERR = new Set();
for (const [type, fn] of Object.entries(PLUGIN_DRAW)) DRAW[type] = (X, Y, dir, props, item, part) => {
  try { fn(PK, { x: X, y: Y, dir, props, item, part, state: PSTATE[type.split(':')[0]] }); } catch (e) {
    discardLayer();
    if (!PLUGIN_ERR.has(type)) { PLUGIN_ERR.add(type); console.error(`plugin draw ${type}:`, e); }
  }
};
/* ============================================================
   動くもの(歩く人)
   ============================================================ */
let walkers = [];
let animT = 0;
function walkerObj(w) {
  const z = 0;
  return { x0: w.x - 4, y0: w.y - 4, z0: z, x1: w.x + 4, y1: w.y + 4, z1: z + 30, draw: () => {
    const eb = ENTRANCE[w.fl].box; if (w.x >= eb[0] && w.x < eb[2] && w.y < eb[3] - 2 && w.y > eb[1]) return; // エレベーターの中は見えない(扉から出てくる)
    CUR_AREA = areaAt(w.x, w.y, FL[w.fl]); drawStanding(PX(w.x, w.y), PY(w.x, w.y, z), w.look, w.face, w.moving ? (w.step >> 1) % 2 : 0); flush();
  } };
}
const hash32 = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const drinkHour = () => (TIME_FIXED ? { morning: 8, day: 13, evening: 17, night: 20 }[TIME] : zoned().h);
const teaTime = () => drinkHour() === 15; // 15時台はスタンドを盛る
const mealOfDay = () => DINE_MEALS[hash32(todayKey()) % DINE_MEALS.length]; // 日替わり定食 [名前, 黒板の色, おかずの絵](設定の時間帯の日付。みんな同じ)

/* ============================================================
   シーンを組み立てて描く
   ============================================================ */
// pad=箱より横に広い絵の画面の余白。箱は広げず、重なりを調べる画面の範囲だけ広げる
function sortObjects(objs) {
  for (const o of objs) { const pad = o.pad || 0; o.sx0 = o.x0 - o.y1 - pad; o.sx1 = o.x1 - o.y0 + pad; o.sy0 = ((o.x0 + o.y0) >> 1) - o.z1 - 30; o.sy1 = ((o.x1 + o.y1) >> 1) - o.z0; o.deps = []; }
  const behind = (a, b) => {
    // 床に貼る平らな物(敷物・散らした落ち葉。z1<=z0)は、立っている物よりいつも先。手前にあっても画面では立っている物の足もとより下に出る。
    // 箱で比べると、壁をまたぐ大きな箱から「壁が奥」という判定が出て並べ替えが循環し、敷物が壁の上に塗られた
    const fa = a.z1 <= a.z0, fb = b.z1 <= b.z0; if (fa !== fb) return fa;
    if (a.x1 <= b.x0) return true; if (b.x1 <= a.x0) return false;
    if (a.y1 <= b.y0) return true; if (b.y1 <= a.y0) return false;
    if (a.z1 <= b.z0) return true; if (b.z1 <= a.z0) return false;
    return (a.x0 + a.y0 + a.x1 + a.y1) < (b.x0 + b.y0 + b.x1 + b.y1);
  };
  for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
    const a = objs[i], b = objs[j];
    if (a.sx1 <= b.sx0 || b.sx1 <= a.sx0 || a.sy1 <= b.sy0 || b.sy1 <= a.sy0) continue;
    if (behind(a, b)) b.deps.push(a); else a.deps.push(b);
  }
  const out = [], seen = new Set();
  const visit = o => { if (seen.has(o)) return; seen.add(o); for (const d of o.deps) visit(d); out.push(o); };
  objs.slice().sort((a, b) => (a.x0 + a.y0) - (b.x0 + b.y0)).forEach(visit);
  return out;
}
function buildObjects(f) {
  const objs = f.objs.slice();
  for (const st of SEATS) {
    if (st.floor !== f.id || st.type === 'sofa' || CUSTOM_SEATS.has(st.type)) continue;
    const z0 = st.z0 || 0;
    objs.push({ x0: st.cx - 6, y0: st.cy - 6, z0, x1: st.cx + 6, y1: st.cy + 6, z1: z0 + 30, draw: () => (st.type === 'beanbag' ? drawBeanbag2(st) : st.type === 'lstool' ? drawLStool2(st) : drawSeatObj(st)), area: roomById(st.room).out ? 'out' : undefined });
  }
  for (const m of MEETS) {
    if (m.floor !== f.id) continue;
    const ppl = meetLayout(m.id);
    m.spots.forEach((sp, i) => {
      const p = ppl.spots[i];
      if (sp.type === 'stand' && !p) return;
      objs.push({ x0: sp.cx - 6, y0: sp.cy - 6, z0: 0, x1: sp.cx + 6, y1: sp.cy + 6, z1: 30, draw: () => drawMeetSpot(sp, p, hoverSeat === 'meet:' + m.id + '#' + i) });
    });
  }
  for (const w of walkers) if (w.where === 'office' && w.fl === f.id) objs.push(walkerObj(w));
  return objs;
}
const worldCanvas = document.createElement('canvas');
worldCanvas.width = OFFICE_W; worldCanvas.height = OFFICE_H;
const worldCtx = worldCanvas.getContext('2d');
const worldImg = worldCtx.createImageData(OFFICE_W, OFFICE_H), worldU32 = new Uint32Array(worldImg.data.buffer);
// 表札を壁から吊る紐・床に立てる支柱(幅は表示中の表札から測る)
const PLATE_W = {};
const PLATE_Z_FLOOR = 24;
function drawPlateMounts(f) {
  for (const room of f.rooms) {
    if (!room.sign) continue;
    const [sx, sy, sz] = room.sign, w = PLATE_W[room.id]; if (!w) continue;
    CUR_AREA = room.out ? 255 : AREA_ID[room.id];
    const cx = PX(sx, sy), h = w.h, top = (room.mount === 'floor' ? PY(sx, sy, PLATE_Z_FLOOR) : PY(sx, sy, sz)) - h / 2;
    if (room.mount === 'floor') {
      for (let Z = 1; Z < PLATE_Z_FLOOR - h / 2; Z++) { wp(sx, sy, Z, cc('m')); wp(sx + 1, sy, Z, cc('n')); }
      flush(false);
      box(sx - 3, sy - 3, 0, sx + 3, sy + 3, 1, 'l', 'm', 'n'); flush(true, 'n');
      continue;
    }
    for (const dx of [-w.w / 2 + 5, w.w / 2 - 5]) {
      const wy = room.wallY || 0, x = Math.round(cx + dx), yTop = PY(x - OX + wy, wy, WH);
      for (let y = yTop + 1; y < top; y++) lp(x, y, cc('k'));
    }
    flush(false);
  }
}
function litAreas(f) {
  const lit = new Set([254]); // 共用部と休憩の部屋(hall・break)はいつも明るい。ほかは人がいる部屋だけ
  for (const r of f.rooms) if (r.kind === 'hall' || r.kind === 'break') lit.add(AREA_ID[r.id]);
  for (const p of PEOPLE) if (isHere(p) && floorOf(p.room) === f.id) lit.add(AREA_ID[p.room]);
  return lit;
}
let myFloor = null; // 自分のいる階(入室前はnull)。変わったら(入室・移動・おまかせ)その階に切り替える(followMyFloor)

// ステージ: 黒い床に木のふち、板の目。前の真ん中に段
function drawStage2(X0, Y0) { // 原点は角(幅48+段6×奥行160)
  const X1 = X0 + 48, Y1 = Y0 + 160, H = 6;
  box(X0, Y0, 0, X1, Y1, H, 'n', 'k', 'K', 'b');
  for (let X = X0; X < X1; X++) for (let Y = Y0 + 7; Y < Y1; Y += 8) wp(X, Y, H, cc('k'));
  flush(true, 'K');
  box(X1, Y0 + 70, 0, X1 + 6, Y0 + 90, 3, 'n', 'k', 'K', 'b'); flush(true, 'K');
}
// 演台(木の箱・前に黒い帯)とマイク。司会の立ち位置の前
function drawLectern2(X, Y) { // 原点は角。Hはステージの高さ(カタログの箱のz0)
  const X0 = X + 1, Y0 = Y + 1, H = 6;
  box(X0, Y0, H, X0 + 8, Y0 + 12, H + 15, 'c', 'd', 'e', 'b'); flush();
  for (let Y = Y0 + 1; Y < Y0 + 11; Y++) for (let Z = H + 9; Z < H + 12; Z++) wp(X0 + 8, Y, Z, cc('k'));
  flush(false);
  box(X0 - 1, Y0 - 1, H + 15, X0 + 9, Y0 + 13, H + 17, 'b', 'c', 'd', 'a'); flush();
  for (let Z = H + 17; Z < H + 24; Z++) wp(X0 + 2, Y0 + 6, Z, cc('k'));
  wp(X0 + 3, Y0 + 6, H + 24, cc('k')); wp(X0 + 4, Y0 + 6, H + 25, cc('n'));
  flush();
}
// 席の人(家具の絵の中で描く席)。zはplaceOfと同じ高さ
function seatPerson2(st) { const occ = occupantOf(st); if (occ) { const z = placeOf(occ).z; GHOST = !!occ.away; drawPerson(PX(st.cx, st.cy), PY(st.cx, st.cy, z), occ, st.face); flush(); GHOST = false; personFx(occ, st.cx, st.cy, z, st.face); } return occ; }
// 机の席の人の前にノートPC(離席中は画面を消す)。dirは人の向きから(PC_DIR)。机の上の高さZ
function seatLaptop2(st, Z, d = 9) {
  const occ = occupantOf(st); if (!occ) return;
  const f = st.face, [X, Y] = f === 'SW' ? [st.cx - 5, st.cy + d - 8] : f === 'NE' ? [st.cx - 5, st.cy - d] : f === 'SE' ? [st.cx + d - 8, st.cy - 5] : [st.cx - d, st.cy - 5];
  drawLaptop(X, Y, occ.pc || 'mac', PC_DIR[f], Z, !occ.away);
}
// 丸テーブル(tea): 床近くまで垂れる白いクロス(すそのひだ)。真ん中に金の枠の3段のケーキスタンド、手前に白いティーポット、席ごとにソーサー付きのカップ(ノートPCは出さない)
const TEA_CUP = ['.WWW.', 'WdddW', 'VWWWV', '.VVV.']; // 上から見たカップ(紅茶)とソーサー
const TEA_POT = ['...Y...', '..WWW..', 'VWWWWW.', 'V.W?WWW', '.WWWWW.', '..VVV..']; // つまみは金、胴にローズの花。注ぎ口は右
// 3段のケーキスタンド(横から見たドット絵): 同じ大きさの楕円の白い皿を金の柱で間をあけて重ね、上=ピンク・ミント・黄色のマカロン、真ん中=スコーンと赤いジャム、下=緑をはさんだサンドイッチ。上に持ち手の輪。
// 灰色の輪郭でテーブルクロスの白と分ける(ボクセルで円を小さく積むと円すいの塊になり、ソフトクリームに見えた)
const TEA_STAND = ['.....///.....', '.....I.I.....', '....../......', '...+6Y1+6Y...', '...WWWWWWW...', '..WWWWWWWWW..', '...lllllll...', '....../......', '...bcRbcRbc..', '..cbRcbRcbc..', '..WWWWWWWWW..', '...lllllll...', '....../......', '..fqffqffqf..', '..fqffqffqf..', '..WWWWWWWWW..', '...lllllll...', '....../......', '.....///.....'];
function drawTeaTable2(cx, cy) { // 原点は真ん中
  const H = 12;
  for (let Z = 2; Z <= H; Z++) { // 下の段から円を重ねて、見える側のすそだけ残す。すそは少し広がる
    const r = Z < 4 ? 11 : 10;
    for (let X = cx - r; X <= cx + r; X++) for (let Y = cy - r; Y <= cy + r; Y++) {
      const dx = X - cx + 0.5, dy = Y - cy + 0.5; if (dx * dx + dy * dy > r * r) continue;
      wp(X, Y, Z, cc(Z === H ? 'W' : ((X - Y) & 3) === 0 ? 'U' : dx > dy ? 'V' : 'W'));
    }
  }
  flush(true, 'U');
  const cup = (X, Y) => { sprAt(X, Y, H, TEA_CUP, 2, 2); flush(true, 'U'); };
  cup(cx, cy - 7); cup(cx - 7, cy); // 奥の2席のカップ
  sprAt(cx - 1, cy - 1, H, teaTime() ? TEA_STAND_FULL : TEA_STAND, 6, TEA_STAND.length - 1); flush(true, 'm');
  sprAt(cx + 6, cy + 6, H, TEA_POT, 3, 5); flush(true, 'U');
  cup(cx + 7, cy); cup(cx, cy + 7); // 手前の2席のカップ
}
// 15時台のスタンド: 皿の上も柱のすき間も山盛り(行の数はTEA_STANDと同じ)
const TEA_STAND_FULL = ['.....///.....', '.....I.I.....', '....+6R6Y....', '..+6Y1+6Y1+..', '...WWWWWWW...', '..WWWWWWWWW..', '...lllllll...', '...bcR/bcR...', '.bcRbcRbcRbc.', '.cbRcbRcbRcb.', '..WWWWWWWWW..', '...lllllll...', '...qfq/qfq...', '.fqffqffqffq.', '.fqffqffqffq.', '..WWWWWWWWW..', '...lllllll...', '....../......', '.....///.....'];
// ボックス席: 背の高い灰色のベンチソファ(横の溝の縫い目)を向かい合わせ。奥の背もたれの上にプランター。part: a=奥のベンチt=テーブルb=壁ぎわ(手前)のベンチ。YはBOOTH_Yからの相対
function boothPlanter2(X0, X1, Y, Z) { box(X0 + 1, Y, Z, X1 - 1, Y + 4, Z + 3, 'c', 'd', 'e', 'b'); flush(); for (let X = X0 + 4; X < X1 - 2; X += 7) canopy(PX(X, Y + 2), PY(X, Y + 2, Z + 3) - 2, [[0, -2, 3], [-2, 0, 2], [2, 0, 2]]); flush(); }
function drawBooth2(X, Y, it, part) { // 原点は奥のベンチの角(幅40×奥行48)
  const X0 = X, X1 = X + 40, B = Y, mine = seatsOfItem(it.id), stitch = (Y, z0, z1) => { for (let Z = z0 + 4; Z < z1; Z += 5) for (let X = X0; X <= X1; X++) wp(X, Y, Z, cc('n')); };
  if (part === 'a') {
    box(X0, B, 0, X1, B + 4, 30, 'm', 'm', 'n', 'l'); stitch(B + 4, 0, 30); flush();
    box(X0, B + 4, 0, X1, B + 16, 9, 'm', 'm', 'n', 'l'); flush();
    for (const st of mine) if (st.face === 'SW') seatPerson2(st);
    boothPlanter2(X0, X1, B, 30);
  } else if (part === 't') {
    box(X0 + 18, B + 22, 0, X0 + 22, B + 26, 10, 'k', 'k', 'K'); flush();
    box(X0 + 3, B + 18, 10, X1 - 3, B + 30, 12, 'a', 'b', 'c', 'a'); flush(true, 'c');
    for (const st of mine) seatLaptop2(st, 12, st.face === 'SW' ? 10 : 9);
  } else {
    box(X0, B + 32, 0, X1, B + 44, 9, 'm', 'm', 'n', 'l'); flush();
    for (const st of mine) if (st.face === 'NE') seatPerson2(st);
    box(X0, B + 44, 0, X1, B + 48, 24, 'm', 'm', 'n', 'l'); stitch(B + 48, 0, 24); flush(); // 壁ぎわ(カメラ側)のベンチの背もたれは少し低く、上に鉢を置かない(座った人の頭が見える)
  }
}
// 1人用の集中ソファ(濃い灰色。背もたれと両わきが頭まで囲む。囲いは奥の半分だけ)。右のひじに小さい木の天板とノートPC
function drawFocus2(st) {
  const cx = st.cx, Y0 = st.cy - 18, Y1 = st.cy + 10, occ = occupantOf(st), hv = hoverSeat === st.id && !occ;
  box(cx - 11, Y0, 0, cx + 11, Y0 + 4, 32, 'n', 'n', 'k', 'm'); for (let Z = 6; Z < 32; Z += 5) for (let X = cx - 11; X <= cx + 11; X++) wp(X, Y0 + 4, Z, cc('k')); flush();
  box(cx - 11, Y0 + 4, 0, cx - 8, Y0 + 16, 30, 'n', 'n', 'k', 'm'); flush();
  box(cx - 8, Y0 + 4, 0, cx + 8, Y1, 9, hv ? 'H' : 'n', hv ? 'B' : 'k', hv ? 'N' : 'K'); flush();
  seatPerson2(st);
  box(cx + 8, Y0 + 4, 0, cx + 11, Y0 + 16, 30, 'n', 'n', 'k', 'm'); flush();
  box(cx + 7, Y0 + 16, 0, cx + 9, Y0 + 18, 13, 'l', 'l', 'm'); box(cx + 4, Y0 + 15, 13, cx + 14, Y1, 14, 'a', 'b', 'c', 'a'); flush(); // 小さい木の天板(支柱つき)
  if (occ) drawLaptop(cx + 4, Y0 + 16, occ.pc || 'mac', 'x-', 14, !occ.away);
}
// 吊るした卵型のブランコ椅子(黒いラタンの殻・白いクッション・C形の黒い台)
function drawEgg2(st) {
  const { cx, cy } = st, occ = occupantOf(st), hv = hoverSeat === st.id && !occ;
  for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; wp(cx - 4 + Math.round(Math.cos(t) * 9), cy + Math.round(Math.sin(t) * 9), 0, cc('k')); } // 床の輪
  for (let Z = 0; Z < 44; Z++) wp(cx - 12, cy, Z, cc('k'));
  for (let X = cx - 12; X <= cx; X++) wp(X, cy, 44 - Math.round(((X - cx + 6) / 6) ** 2), cc('k'));
  for (let Z = 33; Z < 40; Z++) wp(cx, cy, Z, cc('l'));
  flush(false);
  const x = PX(cx, cy), y = PY(cx, cy, 18), inner = (dx, dy) => ((dx - 1) / 6.2) ** 2 + ((dy + 1) / 10.5) ** 2 <= 1;
  for (let dy = -14; dy <= 13; dy++) for (let dx = -9; dx <= 9; dx++) { if ((dx / 9) ** 2 + (dy / 13.5) ** 2 > 1) continue; lp(x + dx, y + dy, cc(inner(dx, dy) ? (hv ? 'H' : dy > 5 ? 'V' : 'W') : (dx + dy) % 3 === 0 ? 'n' : 'k')); }
  flush(true, 'K');
  seatPerson2(st);
  for (let dy = 6; dy <= 13; dy++) for (let dx = -9; dx <= 9; dx++) if ((dx / 9) ** 2 + (dy / 13.5) ** 2 <= 1 && !(((dx - 1) / 6.2) ** 2 + ((dy - 1) / 7.5) ** 2 <= 1)) lp(x + dx, y + dy, cc((dx + dy) % 3 === 0 ? 'n' : 'k'));
  flush(true, 'K');
}
// 丸いクッション(黄・灰・黄緑)を並べた木のL字ベンチ。Lの内側に木のプランターと葉
function drawBench2(X, Y, it) { // 原点は角(幅18×長さ60)
  const H = 8, seats = seatsOfItem(it.id).sort((a, b) => a.cy - b.cy); // 回したベンチも奥から描く
  box(X, Y, 0, X + 18, Y + 60, H, 'c', 'd', 'e', 'b'); flush();
  for (const st of seats) { const occ = occupantOf(st), hv = hoverSeat === st.id && !occ; for (let X = st.cx - 6; X <= st.cx + 6; X++) for (let Y = st.cy - 6; Y <= st.cy + 6; Y++) if ((X - st.cx) ** 2 + (Y - st.cy) ** 2 <= 30) wp(X, Y, H + 1, cc(hv ? 'H' : st.col)); flush(true, 'n'); seatPerson2(st); }
}
function drawBenchL2(X, Y) { // 原点は角(幅62×奥行14)
  box(X, Y, 0, X + 62, Y + 14, 8, 'c', 'd', 'e', 'b'); flush();
  for (const [x, y, c] of [[34, 6, 'g'], [50, 7, 'l']]) { for (let px = X + x - 5; px <= X + x + 5; px++) for (let py = Y + y - 5; py <= Y + y + 5; py++) if ((px - X - x) ** 2 + (py - Y - y) ** 2 <= 22) wp(px, py, 9, cc(c)); flush(true, 'n'); } // 置いてあるだけのクッション(ベージュ・灰)
}
// 木のプランター(大きめの箱に葉をこんもり)
function woodPlanter2(X0, Y0, X1, Y1) { box(X0, Y0, 0, X1, Y1, 14, 'b', 'c', 'd', 'a'); flush(); for (let X = X0 + 5; X < X1 - 2; X += 9) for (let Y = Y0 + 5; Y < Y1 - 2; Y += 9) canopy(PX(X, Y), PY(X, Y, 14) - 5, BLOBS_MED, ['p', 'q', 'r']); flush(); }
// 大きい鉢の木(ウンベラータ): 太い鉢と細い幹、上に大きな葉の塊
function plantTree2(X, Y, pot) {
  const P = pot || ['k', 'n', 'k'];
  box(X - 6, Y - 6, 0, X + 6, Y + 6, 12, P[0], P[1], P[2]); flush();
  for (let Z = 12; Z < 26; Z++) { wp(X, Y, Z, cc('d')); if (Z > 18) wp(X + 1, Y, Z, cc('e')); }
  flush(false);
  canopy(PX(X, Y), PY(X, Y, 26) - 8, [[0, -10, 5], [-7, -7, 5], [7, -7, 5], [-3, -3, 6], [5, -2, 5], [-9, 0, 4], [9, 1, 4], [0, 3, 5], [-5, 5, 4], [5, 6, 4]]); flush();
}
// 窓ぎわのハイカウンター: 黒いスチールの細い脚と明るい木の天板。原点Xは人の側のへり。座っている人のノートPCもそのへり
function drawCounter2(X, y0, y1, depth, st) {
  for (const Y of [y0 + 1, y1 - 3]) box(X + 5, Y, 0, X + 7, Y + 2, 15, 'k', 'k', 'K');
  flush(true, 'K');
  box(X, y0, 15, X + depth, y1, 17, 'a', 'b', 'c');
  flush(true, 'd');
  const occ = occupantOf(st);
  if (occ) drawLaptop(X + 1, st.cy - 5, occ.pc || 'mac', 'x-', 17, !occ.away);
}
// 壁ぎわのカウンター(tea-counter): 濃い木の台に白い天板と金の線。ティーポットとカップ、ケーキのガラスのショーケース、奥に紅茶の缶の棚(上に「TEA」の黒板)
const CAFE_TXT = { T: ['###', '.#.', '.#.', '.#.', '.#.'], E: ['###', '#..', '##.', '#..', '###'], A: ['.#.', '#.#', '###', '#.#', '#.#'] };
const TEA_TINS = ['?', ':', 'Y', 'k', 'W', '_', '|', 'O']; // 紅茶の缶の色(ローズ・セージ・金・黒・白)
function drawTeaCounter2(X, Y) { // 原点は角(幅76×奥行14)
  const X0 = X, X1 = X + 76, Y0 = Y, Y1 = Y + 14, H = 16;
  box(X0, Y0, 0, X1, Y1, H, 'W', 'd', 'e', 'W'); for (let X = X0 + 1; X < X1; X++) { wp(X, Y1, 2, cc('e')); wp(X, Y1, H - 2, cc('Y')); } for (let X = X0 + 8; X < X1; X += 17) for (let Z = 4; Z < H - 3; Z++) wp(X, Y1, Z, cc('e')); flush(); // 幅木・金の線・腰板の目地
  sprAt(X0 + 7, Y0 + 6, H, TEA_POT, 3, 5); flush(true, 'U');
  for (const [dx, dy] of [[11, 10], [5, 11]]) { sprAt(X0 + dx, Y0 + dy, H, TEA_CUP, 2, 2); flush(true, 'U'); }
  // ケーキのショーケース(木の台・金の枠のガラス。中は2段: 下にホールケーキ、上のガラス棚にマカロン)
  const sx0 = X0 + 16, sx1 = X0 + 46, sy0 = Y0 + 2, sy1 = Y1 - 2;
  box(sx0, sy0, H, sx1, sy1, H + 2, 'e', 'd', 'e'); flush();
  for (const [x, top, l, r, berry] of [[3, 'W', 'V', 'U', 'R'], [11, '+', '(', ')', 'W'], [19, 'd', 'e', 'K', 'Y'], [26, 'W', 'V', 'U', 'p']]) { box(sx0 + x, sy0 + 3, H + 2, sx0 + x + 4, sy0 + 7, H + 6, top, l, r); wp(sx0 + x + 1, sy0 + 4, H + 7, cc(berry)); wp(sx0 + x + 3, sy0 + 5, H + 7, cc(berry)); }
  flush(true, 'e');
  for (let X = sx0 + 2; X < sx1 - 1; X += 3) wp(X, sy0 + 5, H + 10, cc(['+', 'p', 'Y', '}', '?'][(X >> 1) % 5])); flush(false);
  for (const [x, y] of [[sx0, sy1], [sx1, sy1], [sx1, sy0]]) for (let Z = H + 2; Z <= H + 12; Z++) wp(x, y, Z, cc('Y'));
  for (let X = sx0; X <= sx1; X++) { wp(X, sy1, H + 12, cc('Y')); wp(X, sy0, H + 12, cc('O')); } for (let Y = sy0; Y <= sy1; Y++) { wp(sx1, Y, H + 12, cc('Y')); wp(sx0, Y, H + 12, cc('O')); }
  for (let i = 0; i < 4; i++) { wp(sx0 + 6 + i, sy1, H + 5 + i, cc('W')); wp(sx1, sy0 + 2 + i, H + 6 + i, cc('W')); } // ガラスの映り込み
  flush(false);
  // 紅茶の缶の棚(壁ぎわ・濃い木。缶は2段、上に「TEA」の黒板)
  const tx0 = X0 + 50, tx1 = X1 - 2, ty = Y0 + 4;
  box(tx0, Y0, H, tx1, ty, H + 24, 'd', 'd', 'e', 'c'); flush();
  for (let X = tx0 + 1; X < tx1; X++) for (let Z = H + 1; Z < H + 16; Z++) { const z = (Z - H - 1) % 7, n = Math.floor((X - tx0 - 1) / 4) + (Z > H + 8 ? 3 : 0); wp(X, ty, Z, cc(z === 0 ? 'c' : (X - tx0) % 4 === 0 || z === 6 ? 'e' : z === 5 ? 'l' : TEA_TINS[n % TEA_TINS.length])); }
  for (let X = tx0 + 1; X < tx1; X++) for (let Z = H + 17; Z < H + 24; Z++) wp(X, ty, Z, cc('k'));
  flush(false);
  const rows = Array.from({ length: 5 }, () => ''); for (const ch of 'TEA') for (let v = 0; v < 5; v++) rows[v] += CAFE_TXT[ch][v] + '.';
  paintL(ty, tx0 + 6, H + 23, rows.map(r => [...r.replace(/#/g, 'W')].reverse().join(''))); flush(false); // 表示は左右反転するので裏返して描く
}
// 食器棚(濃い木。上はガラス戸で白い皿とカップ、下は木の扉に金のつまみ)。カウンターの端
function drawChina2(X, Y) { // 原点は角(幅13×奥行10)
  const X0 = X, X1 = X + 13, Y0 = Y, Y1 = Y + 10, H = 38;
  box(X0, Y0, 0, X1, Y1, H, 'd', 'd', 'e', 'c'); flush();
  for (let X = X0 + 1; X < X1; X++) for (let Z = 2; Z < H - 2; Z++) {
    const u = X - X0, fr = u === 1 || u === X1 - X0 - 1 || u === 6 || u === 7 || Z === 2 || Z === 16 || Z === 17 || Z === H - 3;
    const glass = Z > 17, sh = (Z - 18) % 7;
    wp(X, Y1, Z, cc(fr ? 'c' : !glass ? (Z === 9 && (u === 5 || u === 8) ? 'Y' : 'd') : sh === 6 ? 'c' : (u % 3 !== 0 && sh > 0 && sh < 5 && (u + Z) % 2 === 0) ? 'W' : (u % 3 === 0 && sh === 1) ? '?' : 'e'));
  }
  flush(false);
}
// 三脚のフロアランプ(木の脚・クリーム色の筒のシェード)
function tripodLamp2(X, Y) {
  for (const [dx, dy] of [[-4, -3], [3, -3], [0, 4]]) for (let i = 0; i <= 10; i++) wp(Math.round(X + dx * (1 - i / 10)), Math.round(Y + dy * (1 - i / 10)), Math.round(i * 2.4), cc('c'));
  for (let Z = 24; Z < 28; Z++) wp(X, Y, Z, cc('c'));
  flush(false);
  box(X - 3, Y - 3, 28, X + 3, Y + 3, 36, 'f', 'f', 'g', 'W'); for (let i = -2; i <= 2; i++) wp(X + i, Y + 3, 28, cc('*')); flush(true, 'h');
}
// 細長い葉の鉢(サンスベリア)
function plantSnake2(X, Y) {
  box(X - 3, Y - 3, 0, X + 3, Y + 3, 7, 'W', 'V', 'U'); flush();
  const x = PX(X, Y), y = PY(X, Y, 7);
  for (const [dx, h] of [[-3, 10], [-1, 15], [1, 12], [3, 9], [0, 7]]) for (let k = 0; k < h; k++) { lp(x + dx, y - 1 - k, cc(k > h - 3 ? 'p' : k % 4 === 1 ? 'Y' : 'q')); lp(x + dx + 1, y - 1 - k, cc('r')); }
  flush();
}
// ラグ(床に貼る平らな物): style = 'aud'(客席の所・紺グレー) 'sage'(セージ色)
function drawRug4(X0, Y0, X1, Y1, style) {
  const C = { aud: ['f', '`', 'n'], sage: ['f', ':', '|'], beige: ['f', 'g', 'c'], mat: ['m', 'n', 'k'] }[style]; // mat: 入口の扉の前のドアマット(チャコール)
  for (let X = X0; X < X1; X++) for (let Y = Y0; Y < Y1; Y++) {
    const e = Math.min(X - X0, X1 - 1 - X, Y - Y0, Y1 - 1 - Y), d = (Math.abs(((X - X0) % 16) - 8) + Math.abs(((Y - Y0) % 16) - 8));
    const kil = (Math.abs(((X - X0 + 12) % 24) - 12) + Math.abs(((Y - Y0) % 24) - 12)); // beige: キリム風のひし形
    wp(X, Y, 0, cc(e < 1 ? C[2] : e < 3 ? C[0] : e < 4 ? C[2] : style === 'aud' ? ((X + Y) % 10 === 0 ? C[2] : C[1]) : style === 'beige' ? (kil === 9 || kil === 4 ? 'h' : kil < 2 ? ';' : (e >= 6 && e < 7) ? 'h' : C[1]) : d === 5 ? C[0] : C[1])); // 客席の所のラグは席の印に見えないよう、細い斜めの線だけ
  }
  flush(false);
}
// 折りたたみ椅子を積んだ台車(壁ぎわ)
function drawChairCart2(X0, Y0) {
  box(X0, Y0, 1, X0 + 22, Y0 + 14, 3, 'n', 'k', 'K'); flush();
  for (const [x, y] of [[X0 + 1, Y0 + 1], [X0 + 19, Y0 + 1], [X0 + 1, Y0 + 11], [X0 + 19, Y0 + 11]]) box(x, y, 0, x + 2, y + 2, 1, 'k', 'k', 'K');
  flush();
  for (let i = 0; i < 6; i++) { box(X0 + 2 + i * 3, Y0 + 2, 3, X0 + 4 + i * 3, Y0 + 12, 21, 'l', 'm', 'n', 'W'); for (let Y = Y0 + 2; Y < Y0 + 12; Y++) wp(X0 + 4 + i * 3, Y, 12, cc('n')); } // 畳んだ椅子を立てて並べる
  flush(true, 'n');
  for (let Z = 3; Z < 24; Z++) { wp(X0 + 22, Y0 + 1, Z, cc('k')); wp(X0 + 22, Y0 + 13, Z, cc('k')); } for (let Y = Y0 + 1; Y <= Y0 + 13; Y++) wp(X0 + 22, Y, 24, cc('k')); flush(false); // 取っ手
}
// 立てた円筒(炊飯器・みそ汁の鍋・湯のみの山)。側面は明るい面と暗い面(+X側)、上の面の色はtop(dx, dy)
function drum2(cx, cy, r, z0, z1, side, dark, top) {
  for (let Z = z0; Z <= z1; Z++) for (let X = cx - r; X <= cx + r; X++) for (let Y = cy - r; Y <= cy + r; Y++) {
    const dx = X - cx + 0.5, dy = Y - cy + 0.5; if (dx * dx + dy * dy > r * r) continue;
    wp(X, Y, Z, cc(Z === z1 ? top(dx, dy) : dx > dy ? dark : side));
  }
}
// 配膳カウンター(dine-counter): ステンレスの台と前のトレーのレール。左からトレーの山・箸立て・炊飯器・みそ汁の鍋、くもり止めのガラスの下におかずのバット4つ。
// 壁は白いタイル、その上に献立の黒板(緑の板・木の枠。表示は左右反転するので文字は裏返して描く)
const DINE_TXT = { A: CAFE_TXT.A, B: ['###.', '#..#', '###.', '#..#', '###.'], 0: ['###', '#.#', '#.#', '#.#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'] }; // 斜めの線のある字(M・N)は壁の傾きでつぶれるので使わない
function drawDineCounter2(X0, Y0) { // 原点は角(幅124×奥行16)
  const X1 = X0 + 124, D = 12, H = 16;
  for (let X = X0; X < X1; X++) for (let Z = H; Z < 28; Z++) wp(X, Y0, Z, cc((X - X0) % 6 === 5 || (Z - H) % 4 === 3 ? 'V' : 'W'));
  flush(false);
  const bx = X0 + 62, bw = 52, iw = bw - 2, pad = r => { const p = (iw - r.length) >> 1; return '.'.repeat(p) + r + '.'.repeat(iw - p - r.length); };
  const txt = (s, v, c) => s.split('').map(ch => DINE_TXT[ch][v]).join('.').replace(/#/g, c);
  const entry = (ch, icon, n, price) => Array.from({ length: 5 }, (_, v) => pad(`${txt(ch, v, 'W').padEnd(4, '.')}..${v && v < 4 ? icon.repeat(3) : '...'}.${Array.from({ length: n }, (_, i) => (v === 2 && i % 6 !== 5 ? 'W' : '.')).join('')}${'.'.repeat(24 - n)}${txt(price, v, 'Y')}`)); // A・B定食: 字・料理の色・品名(白い線)・値段(黄色)
  const rows = ['d'.repeat(bw), ...[...entry('A', mealOfDay()[1], 18, '500'), '', ...entry('B', '<', 14, '450')].map(r => 'd' + (r || '.'.repeat(iw)).replace(/\./g, 'r') + 'd'), 'd'.repeat(bw)];
  paintL(Y0, bx, 41, rows.map(r => [...r].reverse().join(''))); flush(false);
  box(bx, Y0, 27, bx + bw, Y0 + 2, 28, 'c', 'd', 'e'); flush(true, 'e'); // 黒板の下のチョーク置き
  box(X0, Y0, 0, X1, Y0 + D, H, 'l', 'm', 'n', 'W');
  for (let X = X0 + 1; X < X1; X++) wp(X, Y0 + D, 1, cc('n'));
  for (let X = X0 + 31; X < X1; X += 31) for (let Z = 2; Z < H - 1; Z++) wp(X, Y0 + D, Z, cc('n'));
  flush(true, 'n');
  for (const X of [X0 + 3, X0 + 62, X1 - 4]) box(X, Y0 + D, 12, X + 1, Y0 + D + 2, 13, 'm', 'm', 'n');
  box(X0, Y0 + D + 2, 13, X1, Y0 + D + 4, 14, 'W', 'l', 'm'); flush(true, 'n'); // トレーを滑らせるレール
  box(X0 + 3, Y0 + 2, H, X0 + 17, Y0 + 10, H + 8, 'c', 'd', 'e'); for (let Z = H + 1; Z < H + 8; Z += 2) { for (let X = X0 + 3; X <= X0 + 17; X++) wp(X, Y0 + 10, Z, cc('e')); for (let Y = Y0 + 2; Y < Y0 + 10; Y++) wp(X0 + 17, Y, Z, cc('K')); } flush(true, 'e'); // トレーの山
  drum2(X0 + 23, Y0 + 6, 2, H, H + 5, 'W', 'V', () => 'V'); flush(true, 'U');
  for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) for (let Z = H + 6; Z < H + 10; Z++) wp(X0 + 23 + dx, Y0 + 6 + dy, Z, cc(Z === H + 9 ? 'e' : 'a'));
  flush(false); // 箸立て
  drum2(X0 + 34, Y0 + 6, 5, H, H + 10, 'l', 'm', () => 'W'); wp(X0 + 32, Y0 + 10, H + 6, cc('R')); flush(true, 'n');
  box(X0 + 33, Y0 + 5, H + 11, X0 + 35, Y0 + 7, H + 12, 'm', 'm', 'n'); flush(true, 'n'); // 炊飯器(銀色・白いふた・赤いランプ)
  drum2(X0 + 48, Y0 + 6, 5, H, H + 8, 'l', 'm', (dx, dy) => (dx * dx + dy * dy > 16 ? 'W' : ((dx * 3 + dy * 5) & 7) === 1 ? 'q' : ((dx + dy * 3) & 7) === 2 ? 'W' : 'c')); flush(true, 'n');
  for (let i = 0; i < 6; i++) wp(X0 + 48 + i, Y0 + 6 - i, H + 9 + i, cc('n'));
  flush(false); // みそ汁の鍋(わかめ・豆腐)とお玉の柄
  // おかずのバット: から揚げ・せんキャベツ・焼き鮭・煮物
  const FOOD = [(X, Y) => ((X * 3 + Y * 5) % 4 === 0 ? 'd' : (X + Y) % 3 ? 'c' : 'b'), (X, Y) => ((X * 5 + Y * 3) % 4 === 0 ? 'q' : (X + Y * 2) % 7 === 0 ? 'R' : 'p'), (X, Y) => (Y % 4 === 0 || (X - Y) % 7 === 0 ? 'W' : (X + Y) % 5 === 0 ? 'O' : '<'), (X, Y) => ((X + Y * 3) % 5 === 0 ? 'q' : (X * 3 + Y) % 4 === 0 ? 'd' : (X + Y) % 2 ? 'O' : 'Y')];
  FOOD.forEach((f, i) => { const x0 = X0 + 56 + i * 16; box(x0, Y0 + 2, H, x0 + 15, Y0 + 10, H + 1, 'W', 'l', 'l'); for (let X = x0 + 1; X < x0 + 14; X++) for (let Y = Y0 + 3; Y < Y0 + 9; Y++) { wp(X, Y, H + 1, cc(f(X, Y))); if ((X * 7 + Y * 3) % 5 === 0) wp(X, Y, H + 2, cc(f(X + 1, Y))); } flush(true, 'm'); });
  for (const X of [X0 + 54, X0 + 88, X0 + 121]) box(X, Y0 + 10, H, X + 1, Y0 + 11, H + 12, 'l', 'l', 'm');
  box(X0 + 53, Y0 + 3, H + 12, X0 + 123, Y0 + 11, H + 13, 'G', 'H', 'H'); flush(true, 'm'); // くもり止めのガラス(支柱と上の棚)
  for (let X = X0 + 56; X < X0 + 120; X++) if (X % 11 === 4) for (let Z = H + 4; Z < H + 11; Z++) if ((Z + X) % 3 === 0) wp(X, Y0 + 11, Z, cc('W'));
  for (let X = X0 + 54; X < X0 + 122; X++) wp(X, Y0 + 11, H + 3, cc('G'));
  flush(false); // 前のガラス(下のふちと映り込みの点)
}
// 給茶機の台(白)と湯のみの山、返却口のトレーラック
function drawDineReturn2(X, Y) { // 原点は角(幅46×奥行14)
  const H = 16;
  box(X, Y, 0, X + 18, Y + 12, H, 'W', 'V', 'U', 'W'); for (let x = X + 1; x < X + 18; x++) wp(x, Y + 12, 1, cc('U')); flush(true, 'U');
  box(X + 2, Y + 1, H, X + 12, Y + 10, H + 14, 'W', 'V', 'U', 'W'); flush(true, 'U');
  for (let u = 3; u < 12; u++) { for (const Z of [H + 10, H + 11]) wp(X + u, Y + 10, Z, cc('q')); for (let Z = H + 2; Z < H + 7; Z++) wp(X + u, Y + 10, Z, cc(u < 5 || u > 9 ? 'V' : Z === H + 2 ? 'n' : 'k')); }
  for (const [u, c] of [[4, 'R'], [6, 'B'], [8, 'B']]) wp(X + u, Y + 10, H + 8, cc(c));
  flush(false); // 給茶機(緑の札・ボタン・注ぎ口)
  drum2(X + 15, Y + 5, 2, H, H + 7, 'W', 'V', () => 'V'); for (let Z = H + 1; Z < H + 7; Z += 2) wp(X + 15, Y + 7, Z, cc('U')); flush(true, 'U'); // 湯のみの山
  // 返却口: ステンレスのトレーラック(段ごとに下げたトレー。いちばん上の段は食器が載ったまま)
  const rx0 = X + 22, rx1 = X + 44;
  for (const x of [rx0, rx1 - 1]) box(x, Y + 1, 0, x + 1, Y + 2, 32, 'l', 'l', 'm');
  flush(true, 'n');
  for (let z = 2; z <= 26; z += 6) { box(rx0, Y + 1, z, rx1, Y + 13, z + 1, 'l', 'm', 'n'); if (z !== 14) box(rx0 + 2, Y + 2, z + 1, rx1 - 2, Y + 12, z + 2, 'c', 'd', 'e'); flush(true, 'n'); }
  sprAt(X + 30, Y + 6, 28, ['.VVV.', 'VWWWV', '.VVV.'], 2, 2); flush(true, 'U');
  sprAt(X + 37, Y + 8, 28, ['.QQ.', 'QeeQ', '.QQ.'], 2, 2); flush(true, 'K');
  for (const x of [rx0, rx1 - 1]) box(x, Y + 12, 0, x + 1, Y + 13, 32, 'l', 'l', 'm');
  box(rx0, Y + 1, 32, rx1, Y + 13, 33, 'W', 'l', 'm'); flush(true, 'n');
}
// 長テーブル(dine-table): 白い天板(へりは明るい木)・スチールの脚。真ん中に紙ナプキンとしょうゆさし。座った人の前に定食のトレー
function drawDineTable2(X, Y) { // 原点は角(幅84×奥行18)
  const X0 = X, X1 = X + 84, Y0 = Y, Y1 = Y + 18, H = 12;
  for (const [x, y] of [[X0 + 3, Y0 + 3], [X1 - 5, Y0 + 3], [X0 + 3, Y1 - 5], [X1 - 5, Y1 - 5]]) box(x, y, 0, x + 2, y + 2, H - 2, 'l', 'm', 'n');
  flush(true, 'n');
  box(X0, Y0, H - 2, X1, Y1, H, 'W', 'a', 'b', 'W'); flush(true, 'c');
  const mx = (X0 + X1) >> 1, my = (Y0 + Y1) >> 1;
  box(mx - 3, my - 2, H, mx, my + 2, H + 3, 'W', 'V', 'U'); flush(true, 'U');
  box(mx + 1, my - 1, H, mx + 2, my, H + 4, 'e', 'e', 'K'); wp(mx + 1, my - 1, H + 5, cc('R')); flush(true, 'k');
}
const DINE_DISH = {
  rice: ['.WWW.', 'WWWWW', 'VWWWV', '.VBV.'],
  soup: ['.QQQ.', 'QbWqQ', 'RQQQQ', '.QQe.'],
  main: ['.dcd.p.', 'WcdcqpW', 'WWWWWWW', '.VVVVV.'],
  side: ['.qq.', 'WqpW', '.VV.'],
}; // 輪郭線は付けない(小さい絵に黒い縁が付くと、×4でも何の皿か分からなくなった)
// 日替わり定食(mealOfDay): [名前, 献立の黒板のAの色, おかずの皿]
const DINE_MEALS = [['karaage', 'O', DINE_DISH.main], ['salmon', 'R', ['.<<<.p.', 'W<W<qpW', 'WWWWWWW', '.VVVVV.']], ['curry', 'Y', ['.WWdd..', 'WWdOddW', 'WWWWWWW', '.VVVVV.']],
  ['hamburg', 'e', ['.QeQ.p.', 'WeeeqpW', 'WWWWWWW', '.VVVVV.']], ['ginger', 'b', ['bcbb.p.', 'WbcbqpW', 'WWWWWWW', '.VVVVV.']]];
// 電話ボックス型のブース(灰色のフェルトの奥と左、正面と右はガラス(枠だけ)、屋根。中に小さい机とノートPC)
function drawPhoneBooth2(X, Y, it) { // 原点は角(20×20)
  const X0 = X, X1 = X + 20, Y0 = Y, Y1 = Y + 20, H = 38, st = dseat(`${it.id}-1`), occ = occupantOf(st), hv = hoverSeat === st.id && !occ;
  box(X0, Y0, 0, X1, Y1, 1, 'V', 'U', 'U'); flush();
  box(X0, Y0, 1, X1, Y0 + 2, H, ':', ':', '|'); box(X0, Y0 + 2, 1, X0 + 2, Y1, H, ':', ':', '|'); flush(); // 奥と左のフェルト
  box(X0 + 4, Y0 + 7, 0, X0 + 12, Y0 + 15, 7, hv ? 'H' : 'n', hv ? 'B' : 'k', 'K'); flush(); // 小さい腰掛け
  seatPerson2(st);
  box(X1 - 6, Y0 + 4, 12, X1 - 1, Y1 - 4, 13, 'a', 'b', 'c'); flush(); // 右の壁の小さい机
  if (occ) drawLaptop(X1 - 9, Y0 + 6, occ.pc || 'mac', 'x-', 13, !occ.away);
  for (const [x, y] of [[X1 - 1, Y1 - 1], [X0, Y1 - 1], [X1 - 1, Y0]]) box(x, y, 1, x + 1, y + 1, H, 'k', 'k', 'K'); // ガラスの枠の柱
  for (let X = X0; X < X1; X++) { wp(X, Y1, H - 1, cc('k')); wp(X, Y1, 2, cc('k')); if ((X - X0) % 6 === 2) for (let Z = 20; Z < 30; Z++) if ((Z + X) % 5 === 0) wp(X, Y1, Z, cc('G')); } // 正面のガラス(枠と映り込みの点)
  for (let Y = Y0; Y < Y1; Y++) { wp(X1, Y, H - 1, cc('k')); wp(X1, Y, 2, cc('k')); }
  flush(false);
  box(X0, Y0, H, X1, Y1, H + 2, 'm', 'n', 'k', 'l'); flush(true, 'k'); // 屋根
}

// ビーズクッション(ふくらんだ丸い座面と、向きの反対側に背の山)。背の山がカメラ側(NW・NE)なら人より後に描く
function drawBeanbag2(st) {
  const { cx, cy, col } = st, occ = occupantOf(st), hv = hoverSeat === st.id && !occ, c = hv ? 'H' : col, d = hv ? 'B' : String.fromCharCode(DK[cc(col)]);
  const [bx, by] = { SE: [-5, 0], NW: [5, 0], SW: [0, -5], NE: [0, 5] }[st.face], front = st.face === 'NW' || st.face === 'NE';
  const blob = (x, y, r, z0, z1) => { for (let Z = z0; Z <= z1; Z++) { const rr = r * Math.sqrt(Math.max(0, 1 - ((Z - z0) / (z1 - z0 + 1)) ** 2)); for (let X = Math.floor(x - rr); X <= x + rr; X++) for (let Y = Math.floor(y - rr); Y <= y + rr; Y++) if ((X - x) ** 2 + (Y - y) ** 2 <= rr * rr) wp(X, Y, Z, cc(Z === z1 || (X - x) + (Y - y) < -rr * 0.4 ? c : (X - x) + (Y - y) > rr * 0.5 ? d : c)); } };
  const back = () => { blob(cx + bx, cy + by, 5, 3, 11); flush(true, 'e'); };
  blob(cx, cy, 7, 0, 5); flush(true, 'e');
  if (!front) back();
  seatPerson2(st);
  if (front) back();
}
// 低いスツール(明るい木の丸い座面・黒い3本脚)
function drawLStool2(st) {
  const { cx, cy } = st, occ = occupantOf(st), hv = hoverSeat === st.id && !occ;
  for (const [dx, dy] of [[-3, -2], [2, -3], [0, 3]]) box(cx + dx, cy + dy, 0, cx + dx + 1, cy + dy + 1, 6, 'k', 'k', 'K');
  flush(false);
  for (let X = cx - 4; X <= cx + 4; X++) for (let Y = cy - 4; Y <= cy + 4; Y++) if ((X - cx) ** 2 + (Y - cy) ** 2 <= 17) { wp(X, Y, 7, cc(hv ? 'H' : 'a')); wp(X, Y, 6, cc(hv ? 'B' : 'c')); }
  flush(true, 'd');
  seatPerson2(st);
}
// 低い丸テーブル(白い天板・木の脚)に小さい鉢かマグ
function drawLowTable2(X, Y, plant) {
  box(X - 1, Y - 1, 0, X + 1, Y + 1, 6, 'b', 'c', 'd'); flush();
  for (let x = X - 6; x <= X + 6; x++) for (let y = Y - 6; y <= Y + 6; y++) if ((x - X) ** 2 + (y - Y) ** 2 <= 36) { wp(x, y, 7, cc('W')); wp(x, y, 6, cc('V')); }
  flush(true, 'U');
  if (plant) plantSmallOn(X, Y, 7); else mugOnDesk(X - 1, Y, 7, 'w');
}
// 描いてある範囲(世界の画素)。大きな床では、見える所に余白(各辺で画面の1/8、最小48画素)を足した矩形だけ描き、カメラがはみ出したらblitが描き直す
// shortcut: 小さいウィンドウ(ミニ表示)が開いているあいだは全面を描く(ミニは自分の席のまわりを別に切り出すため)。worldCanvas()は範囲の外が古いまま
let RR = { x0: 0, y0: 0, x1: OFFICE_W, y1: OFFICE_H };
function wantRect() {
  if (mini) return { x0: 0, y0: 0, x1: OFFICE_W, y1: OFFICE_H };
  const vw = innerWidth / view.s, vh = innerHeight / view.s, mx = Math.max(48, vw / 8), my = Math.max(48, vh / 8);
  return { x0: Math.max(0, Math.floor(view.x - mx)), y0: Math.max(0, Math.floor(view.y - my)), x1: Math.min(OFFICE_W, Math.ceil(view.x + vw + mx)), y1: Math.min(OFFICE_H, Math.ceil(view.y + vh + my)) };
}
const rectHas = (r, x0, y0, x1, y1) => x0 >= r.x0 && y0 >= r.y0 && x1 <= r.x1 && y1 <= r.y1;
function renderWorld() {
  const f = FL[FLOOR];
  if (PAL_N !== palState.n) buildPalettes(); // 好きな色が増えていたらパレットを作り直す
  const R = RR = wantRect(), rw = R.x1 - R.x0;
  if (rw <= 0 || R.y1 <= R.y0) return;
  for (let y = R.y0; y < R.y1; y++) { FB.fill(0, y * OFFICE_W + R.x0, y * OFFICE_W + R.x1); ZB.fill(0, y * OFFICE_W + R.x0, y * OFFICE_W + R.x1); }
  const objs = buildObjects(f);
  SH.fill(0);
  for (const o of objs) { if (o.z1 >= 4 && o.area !== 'out' && o.block !== false) shadowRect(o.x0, o.y0, o.x1, o.y1, Math.min(o.z1, 30) * 0.5); }
  setTarget(OFFICE);
  CX0 = Math.max(1, R.x0); CY0 = Math.max(1, R.y0); CX1 = Math.min(OFFICE_W - 1, R.x1); CY1 = Math.min(OFFICE_H - 1, R.y1);
  CUR_AREA = 255;
  drawFloor(f);
  const me = myPlace();
  if (me && me.cx != null && floorOf(ME.room) === FLOOR) floorRing(me.cx, me.cy, 10, 'q', 'p'); // 別の階にいる自分の輪は描かない(同じ座標に出てしまう)
  if (pickSeat && !ME.present) for (const st of freeSeats()) floorRing(st.cx, st.cy, 9, 'q', 'p', 'p'); // 選べる席を緑に(目印の黄色い輪は名札の層の .seat.free)
  const hm = hoverSeat && hoverSeat.startsWith('meet:') ? hoverSeat.slice(5).split('#') : null;
  if (hm) { const sp = MEET[hm[0]].spots[+hm[1]]; floorRing(sp.cx, sp.cy, 9, 'W', 'W', 'f'); }
  else if (hoverSeat) { const st = seatById(hoverSeat); if (st && !occupantOf(st)) floorRing(st.cx, st.cy, 9, 'W', 'W', 'f'); }
  for (const w of f.walls) if (w.kind === 'window' || w.kind === 'outer') drawBackWall(f, w);
  drawPlateMounts(f);
  for (const o of sortObjects(objs)) {
    if (o.sx1 + OX < R.x0 - 48 || o.sx0 + OX > R.x1 + 48 || o.sy1 + OY < R.y0 - 48 || o.sy0 + OY > R.y1 + 48) continue; // 範囲の外(絵の広がりに余白48)
    CUR_AREA = o.area === 'out' ? 255 : areaAt(...(o.pt || [(o.x0 + o.x1) >> 1, (o.y0 + o.y1) >> 1])); o.draw(); flush(); }
  CUR_AREA = 255; drawOutdoorRain(f);
  const night = TIME === 'night', lit = litAreas(f);
  const P = RGBA;
  for (let y = R.y0; y < R.y1; y++) for (let i = y * OFFICE_W + R.x0, e = y * OFFICE_W + R.x1; i < e; i++) {
    const c = FB[i];
    if (!c) { worldU32[i] = 0; continue; }
    const z = ZB[i];
    worldU32[i] = z === 255 ? P.out[c] : (night && !lit.has(z)) ? P.dim[c] : P.lit[c];
  }
  worldCtx.putImageData(worldImg, 0, 0, R.x0, R.y0, rw, R.y1 - R.y0);
}

/* ============================================================
   人: VoState の people から作る(applyState)。表示用の人は {id, name, me, hair, hc, sk, cl, pt, map, room, seat, present, away, walking,
   manual(手で選んだステータス), focusEnd, memo, deco, pc, mon, phase, joinT}
   ============================================================ */
const STATUS = { work: { label: _t('engine.status.work'), cls: 'work' }, focus: { label: _t('engine.status.focus'), cls: 'focus' }, break: { label: _t('engine.status.break'), cls: 'break' }, meet: { label: _t('engine.status.meet'), cls: 'meet' } };
const ROOM_STATUS = { meeting: 'meet', break: 'break' }; // 部屋の種類 → いる間のステータス(休憩の部屋は休憩、会議室は会議中)
const FOCUS_MS = 25 * 60 * 1000;
const PEOPLE = [];
let ME = null; // 自分(applyStateが入れる。peopleにいなくても作る)
let MEET_URLS = {};
let TALK_ROOMS = []; // 直近5分に発言があった部屋(表札の「話し中」。中身は来ない)

let focusNag = null; // 集中の終わりを知らせているトースト(フォーカスが戻るまでタブ名も変える)
let answerNag = false; // 「ちょっといい？」の返事が見ていないタブに来た(このタブを見るまでタブ名に「(返事) 」)
let pickSeat = false; // 入室する席を選んでもらっているあいだ
let joinSeq = 0;
// 席にいる(絵に出す)人。離席中も座ったまま(机に札・点線の名札)。席まで歩いている途中の人は出さない
const isHere = p => p.present && !p.walking;
// 在席の数え方: 入室していて離席中でない人(歩いている途中も数える)
const inOffice = p => p.present && !p.away;
const occupantOf = st => PEOPLE.find(p => isHere(p) && p.seat === st.id) || null;
// 離席中の人の席(座ったまま。机に「離席中」の札)
const awayAt = st => PEOPLE.find(p => p.present && p.away && p.seat === st.id) || null;
// 名札の名前: 名字(最初の半角・全角の空白より前。空白が無ければ先頭4文字)。同じ部屋に同じ名字の人がいたら名前の1文字目を足す
const nameParts = n => { const t = String(n || '').trim(), i = t.search(/[ \u3000]/); return i < 0 ? [[...t].slice(0, 4).join(''), ''] : [t.slice(0, i), t.slice(i).trim()]; };
function tagName(p) {
  const [fam, given] = nameParts(p.name);
  const dup = given && PEOPLE.some(o => o !== p && isHere(o) && o.room === p.room && nameParts(o.name)[0] === fam);
  return dup ? fam + [...given][0] : fam;
}
// 名指しのラベル(pickAtが入れるtagNameは「名字」か「名字＋名前の1文字目」なので両方。長いほうが先)と、その人あての「@ラベル」。
// 後ろが空白か末尾のときだけ一致させる(「@佐藤」で「@佐藤花子さん」の頭を拾わない)。吹き出しで抜くときに後ろの空白1つもいっしょに取る
const atLabels = p => { const [f, g] = nameParts(p ? p.name : ''); return f ? [f + [...g].slice(0, 1).join(''), f] : []; };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const atRe = p => new RegExp(`@(?:${atLabels(p).map(reEsc).join('|')})(?=\\s|$)\\s?`, 'g');
const decoOf = p => p.deco || null;
const reserved = st => walkers.some(w => w.toSeat === st.id);
// 入室する席を選んでもらうときに黄色い輪を付ける、空いている席(見ている階の作業エリアの席。無い階はその階の席ぜんぶ)
const openSeat = st => !!st && !occupantOf(st) && !awayAt(st) && !reserved(st);
const isWorkSeat = st => st.type === 'office' && isIsland(st.room);
const seatsOfFloor = () => { const on = SEATS.filter(st => st.floor === FLOOR), w = on.filter(isWorkSeat); return w.length ? w : on; }; // 見ている階の作業エリアの席。無い階はその階の席ぜんぶ
const freeSeats = () => seatsOfFloor().filter(openSeat);
const placeLabel = room => _t('engine.floorRoom', { floor: FL[floorOf(room)].name, room: roomById(room).name });
// 島に空きが無いときの「おまかせで座る」の行き先。サーバーのpickSeatと同じ順(作業エリアの席→free→break→hall→会議室。席の並びは階の下から)
const autoPlace = () => {
  const w = SEATS.find(st => isWorkSeat(st) && openSeat(st));
  if (w) return placeLabel(w.room);
  for (const k of ['free', 'break', 'hall']) { const st = SEATS.find(s => roomById(s.room).kind === k && openSeat(s)); if (st) return placeLabel(st.room); }
  return MEETS[0]?.room.name || '';
};

// 返事していない「ちょっといい？」(いちばん新しい1件)と、自分あての出来事をログに出す行
let pendingCall = null;
const SYS_LOG = [];
// 描く間隔(下のstep)。起動の途中で歩く人が出ても使えるよう先に宣言しておく
let focused = document.hasFocus(), loopTimer = 0, instantMe = false, followMe = false;
function statusOf(p) {
  // 優先順位: 部屋の種類(会議室=会議中・break=休憩) > 手動。作業エリアが満席で自動で別の場所に座った人(overflow)には部屋の種類を当てない(サーバーと同じ)
  return (!p.overflow && ROOM_STATUS[roomById(p.room)?.kind]) || p.manual;
}
function statusReason(p) {
  const r = roomById(p.room), st = !p.overflow && ROOM_STATUS[r?.kind];
  return st ? _t('engine.status.reason', { room: r.name, status: STATUS[st].label }) : '';
}
function meetLayout(id) {
  const ppl = PEOPLE.filter(p => isHere(p) && p.room === id).sort((a, b) => a.joinT - b.joinT);
  const spots = new Array(MEET[id].spots.length).fill(null), over = [];
  for (const p of ppl) {
    const i = spots.indexOf(null);
    if (i >= 0) spots[i] = p; else over.push(p);
  }
  return { spots, over, all: ppl };
}
function placeOf(p) { // 画面上の位置 {cx, cy, z, face, stand}
  if (isMeet(p.room)) {
    const me = MEET[p.room], i = meetLayout(p.room).spots.indexOf(p);
    if (i < 0) return { cx: me.plusAt[0], cy: me.plusAt[1], z: 0, face: 'SW', over: true };
    const sp = me.spots[i];
    return { cx: sp.cx, cy: sp.cy, z: sp.type === 'stand' ? 0 : 8, face: sp.face, stand: sp.type === 'stand' };
  }
  const st = seatById(p.seat);
  if (!st) return null;
  if (st.type === 'stand') return { cx: st.cx, cy: st.cy, z: st.z0 || 0, face: st.face, stand: true }; // z0: 台の高さ
  return { cx: st.cx, cy: st.cy, z: (st.sz ?? (st.type === 'stool' ? 14 : st.type === 'sofa' || st.type === 'armchair' ? 9 : 8)) + (st.z0 || 0), face: st.face }; // sz・z0: 席の座面と台の高さ
}
const myPlace = () => (isHere(ME) ? placeOf(ME) : null);
const logicalRoom = room => room;
const myRoomId = () => (ME.present ? logicalRoom(ME.room) : null);
const talkName = id => (!id ? '' : isIsland(id) ? _t('engine.room.this') : roomById(id).name); // 作業の部屋は名前でなく「この部屋」
// 入力欄の「(3人)」: 発言が届く人数(自分を含めて今この部屋にいる人。離席中もログで読めるので数える)
const sayN = () => { const n = ME.present ? PEOPLE.filter(p => p.present && logicalRoom(p.room) === myRoomId()).length : 0; return !n ? '' : n === 1 ? _t('engine.say.solo') : _t('engine.say.n', { n }); };
const sayCount = () => (sayN() ? _t('engine.say.paren', { s: sayN() }) : '');

// 人の描画(座り)。集中=ヘッドホン、休憩=カップ
const SPIN = ['SW', 'SE', 'NE', 'NW']; // くるっと: 前→前(反転)→後ろ→後ろ(反転)
const emoNow = p => (!reduceMotion && p.emo && p.emo.end > Date.now() ? p.emo.kind : '');
const handsBusy = p => ['banzai', 'clap'].includes(emoNow(p)); // バンザイ・拍手の間はカップ・グラス(と湯気)を描かない(持つ手が別に残る)
function drawPerson(x, y, p, face) {
  face = tf(face);
  // エモーション(startEmote)の体の動き。1コマ(0.2秒)おきに交互。動きを減らす設定では動かさない(頭上の絵だけ)
  const em = emoNow(p), odd = animT % 2 === 1;
  if (em === 'spin') face = SPIN[animT % 4];
  const back = face === 'NE' || face === 'NW', flip = face === 'SE' || face === 'NW', map = p.map;
  const st = statusOf(p);
  const bob = ((animT + p.phase) % 8) < 2 ? 1 : 0;
  const tx = x - 8 + (em === 'dance' ? (odd ? 1 : -1) : 0), ty = y - 18 - (em === 'jump' && odd ? 2 : em === 'wow' && p.emo.end - Date.now() > 3200 ? 1 : 0); // びっくりは最初だけ1px跳ねる
  const pose = !odd ? null : em === 'banzai' ? 'up' : em === 'clap' ? 'clap' : null;
  for (const [rows, m, dx, dy] of personStamps(p, back, false, 0, bob, (animT + p.phase * 5) % 19 === 0, pose)) spr(tx + dx, ty + dy, rows, m, flip);
  if (st === 'focus' && p.ac !== 'phones') spr(tx, ty - 1 + bob, HPH, map, flip); // 集中=ヘッドホン(小物のヘッドホンの人はそのまま)
  if (!handsBusy(p) && st === 'break' && !back) spr(tx + (flip ? 6 : 5), ty + 15, MUG_HAND, map, flip); // 休憩中はカップ
  OL2 = p.id && (p.id === HOVER_PID || p.me) ? '*' : null; // 呼んだ側のflush() で輪郭の外に明るい1周(自分はいつも。混んだ島で隣の人の頭とパソコンに埋もれた)
}
function personFx(p, cx, cy, z, face) {
  face = tf(face);
  if (statusOf(p) === 'break' && !p.away && !handsBusy(p) && face !== 'NE' && face !== 'NW') steam(PX(cx, cy) - 1, PY(cx, cy, z) - 6, 1);
}
function drawStanding(x, y, p, face, frame) {
  face = tf(face);
  const back = face === 'NE' || face === 'NW', flip = face === 'SE' || face === 'NW', map = p.map;
  const lift = frame ? 1 : 0, tx = x - 8, ty = y - 25 - lift;
  // バンザイ・拍手は立ち姿でも腕を動かす(drawPersonと同じく1コマおき)。ほかの体の動きは座りだけ
  const em = emoNow(p), pose = animT % 2 !== 1 ? null : em === 'banzai' ? 'up' : em === 'clap' ? 'clap' : null;
  for (const [rows, m, dx, dy] of personStamps(p, back, true, frame ? 1 : 0, 0, false, pose)) spr(tx + dx, ty + dy, rows, m, flip);
  if (!p.look && statusOf(p) === 'focus' && p.ac !== 'phones') spr(tx, ty - 1, HPH, map, flip);
  OL2 = p.id && (p.id === HOVER_PID || p.me) ? '*' : null;
}

/* ============================================================
   小さなキャンバス(顔・全身・小物のアイコン)
   ============================================================ */
function spriteCanvas(w, h, stamps, bg) { const c = paintSprite(document.createElement('canvas'), w, h, stamps, bg); c.className = 'px'; return c; }
function faceCanvas(p) { return spriteCanvas(16, 16, faceStamps(p), '#ccd8e2'); }
function dressHeadStamps(p, back = false) {
  const outfit = outfitOf(p.ot);
  return shiftStamps(personStamps(p, back).slice(1 + (outfit ? 1 : 0)), 4, 4);
}
function dressFaceCanvas(p, back = false) { return spriteCanvas(24, 24, dressHeadStamps(p, back), '#ccd8e2'); }
function bodyCanvas(p, back = false) { return spriteCanvas(24, 32, bodyStamps(p, back), '#ccd8e2'); }
function decoIcon(kind) { const s = DECO_SPR[kind]; return spriteCanvas(13, 13, [[s, null, Math.floor((13 - s[0].length) / 2), 13 - s.length - 1]]); }
function iconCanvas(rows) { return spriteCanvas(rows[0].length, rows.length, [[rows, null, 0, 0]]); }
// 名札に付ける「ひとことあり」の小さい吹き出し
const MEMO_SVG = `<svg class="ic" viewBox="0 0 8 8" aria-label="${_t('engine.memo.has')}"><path d="M0 0h8v6H4L2 8V6H0z" fill="#221f2c"/><path d="M1 1h6v4H1z" fill="#fbf9f3"/><path d="M2 2h4v1H2z" fill="#838995"/></svg>`;
// 人に重ねると出す1行(状態・集中の残り・ひとこと)
function personLine(p) {
  const st = statusOf(p), left = st === 'focus' && p.focusEnd > Date.now() ? ' ' + _t('engine.minLeft', { n: Math.ceil((p.focusEnd - Date.now()) / 60000) }) : '';
  return [p.away ? _t('engine.status.away') : STATUS[st].label + left, p.memo].filter(Boolean).join(_t('engine.sep'));
}

/* ============================================================
   カメラ: ドラッグで移動、ホイール/ピンチ/ボタンで整数倍率
   ============================================================ */
const $ = id => root.querySelector('#' + id);
const appEl = $('app'), sceneEl = $('scene'), worldEl = $('world'), groundEl = $('ground'), ov = $('ov'), fxov = $('fxov');
const view = { s: 2, x: 0, y: 0 }; // view.xはエンジンの絵での画面の左右の範囲の左端(表示は左右反転するので、画面の右端にあたる)
// 絵は(画面x=X-Yのまま)描き、表示で左右反転する。
// 絵(canvas)はCSSで反転、名札・表札・当たり判定などのDOMは文字を反転させないようxだけ符号を変えて置く
const NX = x => -x;
const isPhone = () => innerWidth < 600;
const TAGFS = s => (s < 2 ? 12 : s === 2 ? 13 : s === 3 ? 14 : s === 4 ? 15 : 16); // 名札・吹き出しの文字(読みやすさのため最小12px。×2未満は名札が混むので12px。名札の高さは +5px)
function hudInsets() { if (preview) return { top: 8, bottom: 8 }; return isPhone() ? { top: 44, bottom: 64 } : { top: 40, bottom: 14 }; }
// 構図(全体・自分に寄せる・最初の構図・寄せ戻し)の上下の余白
function camInsets() { return hudInsets(); }
// 「全体」の倍率: BOXがHUDを除いた画面に入る最大。×2未満は0.25刻み(×1.25〜×1.75、入らなければ×0.25まで)。ふだんのズームは整数のまま
// プレビュー(エディタ)の「全体」は背景ではなく、いまの階の部屋の矩形の和に少し余白をつけた範囲に合わせる。ふだんはBOX
function fitBox() {
  const rs = preview ? FL[FLOOR].rooms.flatMap(r => r.rects) : [];
  if (!rs.length) return BOX;
  const m = 16, x0 = Math.min(...rs.map(q => q[0])) - m, y0 = Math.min(...rs.map(q => q[1])) - m, x1 = Math.max(...rs.map(q => q[2])) + m, y1 = Math.max(...rs.map(q => q[3])) + m;
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  return { x0: Math.min(...pts.map(([X, Y]) => PX(X, Y))), x1: Math.max(...pts.map(([X, Y]) => PX(X, Y))), y0: Math.min(...pts.map(([X, Y]) => PY(X, Y, WH))), y1: Math.max(...pts.map(([X, Y]) => PY(X, Y, 0))) + SLAB };
}
function fitScale() {
  const { top, bottom } = camInsets(), aw = innerWidth - 16, ah = innerHeight - top - bottom, B = fitBox();
  const bw = B.x1 - B.x0, bh = B.y1 - B.y0, raw = Math.min(aw / bw, ah / bh);
  const s = preview ? Math.min(6, Math.max(0.1, Math.floor(raw * 20) / 20)) : raw >= 2 ? Math.min(6, Math.floor(raw)) : Math.max(0.25, Math.floor(raw * 4) / 4); // プレビューは1/20刻みで枠いっぱいに
  return { s, fits: bw * s <= aw && bh * s <= ah };
}
function frameAll() {
  const { top, bottom } = camInsets(), f = fitScale(), B = fitBox();
  view.s = f.s;
  const ah = innerHeight - top - bottom;
  view.x = (B.x0 + B.x1) / 2 - innerWidth / 2 / view.s;
  view.y = B.y0 - (top + (ah - (B.y1 - B.y0) * view.s) / 2) / view.s;
  if (preview && config.frame) { // 呼び出し側の構図(ヒーローの寄せ・ずらし)。CSSのtranslate/scaleと違い、吹き出しの座標がずれない
    const { k, x, y } = config.frame(), W = innerWidth, H = innerHeight, cx = view.x + W / 2 / view.s, cy = view.y + H / 2 / view.s;
    view.s *= k; view.x = cx - (W / 2 - x * W) / view.s; view.y = cy - (H / 2 + y * H) / view.s; // 画面は左右反転しているので、xは画面の右向きを正にする
  }
  applyScale();
}
function centerOn(wx, wy) {
  const { top, bottom } = camInsets();
  view.x = wx - innerWidth / 2 / view.s;
  view.y = wy - (top + (innerHeight - top - bottom) / 2) / view.s;
  clampView(); applyCamera();
}
// 寄せ戻し: 全体(BOX)が画面より大きい向きはBOXの外(空)を映しすぎない所まで戻し、小さい向きは真ん中に。fx,fy(自分・見せたい所)は画面の端から余白を残して入れる
function keepInBox(fx, fy) {
  const { top } = camInsets(), s = view.s, vw = innerWidth / s, uh = (innerHeight - top - viewBottom()) / s, p = 16 / s, m = 80 / s;
  const fit = (v, lo, hi, len) => (hi - lo + 2 * p <= len ? (lo + hi - len) / 2 : Math.max(lo - p, Math.min(hi + p - len, v)));
  view.x = Math.max(fx - vw + m, Math.min(fx - m, fit(view.x, BOX.x0, BOX.x1, vw)));
  const sp = officeSpanY(view.x, view.x + vw);
  view.y = Math.max(fy - uh + m, Math.min(fy - m, fit(view.y + top / s, sp.y0, sp.y1, uh))) - top / s;
  clampView(); applyCamera();
}
// 画面に映る列(絵のx0〜x1)にかかる見ている階の床と壁の上下。スマホではBOXの下の角が画面の外の列にあり、BOXで真ん中に置くと下が空ばかりになる
function officeSpanY(x0, x1) {
  let y0 = BOX.y1, y1 = BOX.y0;
  const f = FL[FLOOR];
  for (let X = XB; X < XE; X += 8) for (let Y = YA; Y < YE; Y += 8) {
    const x = PX(X, Y); if (x < x0 || x > x1 || !floorAtF(f, X, Y)) continue;
    y0 = Math.min(y0, PY(X, Y, WH)); y1 = Math.max(y1, PY(X, Y, 0) + SLAB);
  }
  return y0 < y1 ? { y0, y1 } : BOX;
}
function centerOnMe() {
  const pl = !ME.present ? null : isHere(ME) ? placeOf(ME) : placeOfSeat(ME);
  if (pl) { const x = PX(pl.cx, pl.cy), y = PY(pl.cx, pl.cy, 20); centerOn(x, y); keepInBox(x, y); } else centerOn((BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2);
}
// 自分の席に寄せて×2で止める(入室した直後。きせかえ・飾りが見えるように)。自分で動かすまでは、大きさが変わってもこの構図を取り直す
function frameMe(s = 2) {
  showMyFloor();
  followMe = false; userCam = false; lastFrame = 'me'; panAnim++; // 寄せている途中(歩く自分)のアニメも止める
  if (view.s !== s) { view.s = s; applyScale(); }
  centerOnMe();
}
function placeOfSeat(last) { if (!last) return null; if (isMeet(last.room)) return { cx: MEET[last.room].c[0], cy: MEET[last.room].c[1] }; const st = seatById(last.seat); return st ? { cx: st.cx, cy: st.cy } : null; }
// 見ている階の働く所(work・meeting・breakの部屋。無ければ階の全部屋)の範囲(絵の座標)
const workBox = () => {
  const rooms = FL[FLOOR].rooms, work = rooms.filter(r => ['work', 'meeting', 'break'].includes(r.kind)), rs = (work.length ? work : rooms).flatMap(r => r.rects);
  if (!rs.length) return BOX;
  const x0 = Math.min(...rs.map(q => q[0])), y0 = Math.min(...rs.map(q => q[1])), x1 = Math.max(...rs.map(q => q[2])), y1 = Math.max(...rs.map(q => q[3]));
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  return { x0: Math.min(...pts.map(([X, Y]) => PX(X, Y))), x1: Math.max(...pts.map(([X, Y]) => PX(X, Y))), y0: Math.min(...pts.map(([X, Y]) => PY(X, Y, 36))), y1: Math.max(...pts.map(([X, Y]) => PY(X, Y, 0))) + SLAB };
};
const roomMid = r => { const q = r.rects[0]; return { cx: (q[0] + q[2]) >> 1, cy: (q[1] + q[3]) >> 1 }; };
const busiestIsland = () => FL[FLOOR].rooms.filter(r => r.kind === 'work').map(r => ({ r, n: PEOPLE.filter(p => isHere(p) && !p.away && p.room === r.id).length })).sort((a, b) => b.n - a.n)[0]?.r;
// fx,fyを見せたい所として、範囲が画面(HUDの内側)に入る向きは範囲ごと真ん中に、入らない向きはfx,fyに寄せつつ範囲の外を映さない
function frameWork(fx, fy) {
  const { top } = camInsets(), bottom = viewBottom(), s = view.s, vw = innerWidth / s, uh = (innerHeight - top - bottom) / s, R = workBox();
  view.x = R.x1 - R.x0 <= vw ? (R.x0 + R.x1) / 2 - vw / 2 : Math.max(R.x0, Math.min(R.x1 - vw, fx - vw / 2));
  const yc = R.y1 - R.y0 <= uh ? (R.y0 + R.y1) / 2 : Math.max(R.y0 + uh / 2, Math.min(R.y1 - uh / 2, fy));
  view.y = yc - (top / s + uh / 2);
  // スマホは全体の真ん中に合わせる(島に寄せて上端で止めると、下半分が空になることがあった)。fx(自分の席・人の多い島)は画面の内側に入れる
  if (isPhone()) {
    const m = 60 / s;
    view.x = s > 1 ? fx - vw / 2 : Math.max(fx - vw + m, Math.min(fx - m, (BOX.x0 + BOX.x1) / 2 - vw / 2)); // ×2(席選び)は空席の真ん中に
    view.y = (s > 1 ? fy : (BOX.y0 + BOX.y1) / 2) - (top / s + uh / 2);
  }
  keepInBox(fx, fy);
}
// 構図の取り直し: 自分でズーム・パンしたら(userCam)、次に「全体」を押すかページを開き直すまで取り直さない。lastFrameは最後の構図の種類
let userCam = false, lastFrame = 'initial';
// 席の並びの真ん中と幅・高さ(絵の座標)
function seatsMid(list) {
  const xs = list.map(st => PX(st.cx, st.cy)), ys = list.map(st => PY(st.cx, st.cy, 10));
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
// 入室する席を選んでもらうときに見せる所: 空いている島の席がいまの倍率の画面にみな入ればその真ん中、入らなければ空席のいちばん多い島
function freeFocus() {
  const fs = freeSeats(); if (!fs.length) return null;
  const all = seatsMid(fs), m = 100 / view.s;
  if (all.w <= innerWidth / view.s - m && all.h <= (innerHeight - camInsets().top - viewBottom()) / view.s - m) return all;
  return seatsMid(FL[FLOOR].rooms.map(r => fs.filter(st => st.room === r.id)).sort((a, b) => b.length - a.length)[0]); // 部屋ごと
}
function initialView() {
  if (preview) {
    const c = config.camera;
    if (c?.user) { Object.assign(view, { s: c.s, x: c.x, y: c.y }); userCam = true; applyScale(); } else frameAll(); // 描き直す前に自分でズーム・パンしていたら、その構図を戻す
    lastFrame = 'fit'; return;
  } // ×2(狭い画面とスマホは×1)。PCは画面の大きさによらず×2で寄せる(全体は「全体」ボタン)
  lastFrame = 'initial';
  view.s = isPhone() && pickSeat ? 2 : isPhone() || innerWidth < 700 || innerHeight < 520 ? 1 : 2; applyScale(false); // スマホも×1が下限(×1未満は「全体」を押したときだけ。席が押しにくくなる)。席選びは×2(×1だと空席の当たりが14×24px)
  // 見せたい所: 自分の席。席を選んでもらっているあいだは空いている島の席。入室前は人のいちばん多い島(PCで島に誰もいなければ島の真ん中)
  const pl = !ME.present ? null : isHere(ME) ? placeOf(ME) : placeOfSeat(ME), f = !pl && pickSeat && freeFocus(), isl = busiestIsland();
  const ss = seatsOfFloor(), mid = !isPhone() && ss.length && (!ss.some(isWorkSeat) || !PEOPLE.some(p => isHere(p) && !p.away && isIsland(p.room) && floorOf(p.room) === FLOOR)) && seatsMid(ss); // 作業エリアの席が無い階は席の真ん中
  if (pl) frameWork(PX(pl.cx, pl.cy), PY(pl.cx, pl.cy, 20)); else if (f || mid) frameWork((f || mid).x, (f || mid).y); else if (isl) { const c = roomMid(isl); frameWork(PX(c.cx, c.cy), PY(c.cx, c.cy, 10)); } else frameWork((BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2);
}
// パンできる範囲: 全階のまわり＋下の階まで
const PAN = { x0: BOX.x0 - 120, x1: BOX.x1 + 160, y0: BOX.y0 - 30, y1: BOX.y1 + GZ + 150 };
const minScale = () => preview ? Math.min(1, fitScale().s) : 1; // 背景は単色なので下限は×1(プレビューは「全体」まで縮められる)
function clampView() {
  if (preview && config.frame) return; // 寄せた構図を範囲内に引き戻さない
  const vw = innerWidth / view.s, vh = innerHeight / view.s;
  const cx = view.x + vw / 2, cy = view.y + vh / 2;
  const nx = Math.max(PAN.x0, Math.min(PAN.x1, cx)), ny = Math.max(PAN.y0, Math.min(PAN.y1, cy));
  view.x += nx - cx; view.y += ny - cy;
  // オフィスが画面より高いときは、画面の上端をオフィスの上端(上のバーのすぐ下)で止める。奥の席に座ったとき空ばかり映らないように
  const { top, bottom } = camInsets();
  if ((BOX.y1 - BOX.y0) * view.s > innerHeight - top - bottom) view.y = Math.max(view.y, BOX.y0 - top / view.s);
}
// 1. HUDの操作で移った先(や歩いている自分)が画面の外なら、カメラをなめらかに寄せる(約0.3秒)
let panAnim = 0;
function panTo(wx, wy) {
  const { top, bottom } = camInsets();
  const x1 = wx - innerWidth / 2 / view.s, y1 = wy - (top + (innerHeight - top - bottom) / 2) / view.s, x0 = view.x, y0 = view.y, id = ++panAnim;
  let k = 0;
  const f = () => { if (id !== panAnim) return; k++; const t = 1 - (1 - k / 12) ** 3; view.x = x0 + (x1 - x0) * t; view.y = y0 + (y1 - y0) * t; clampView(); applyCamera(); if (k < 12) later(f, 25); };
  f();
}
function ensureVisible(wx, wy) {
  const { top, bottom } = camInsets(), sx = innerWidth - (wx - view.x) * view.s, sy = (wy - view.y) * view.s; // 表示は左右反転
  const m = 40, cardH = $('hudBottom') ? $('hudBottom').offsetHeight : 0;
  const card = $('hudMe') ? $('hudMe').getBoundingClientRect() : null, behindCard = card && sx < card.right + m && sy > card.top - m; // 左下の自分のカードの裏
  if (sx < m || sx > innerWidth - m || sy < top + m || sy > innerHeight - Math.max(bottom, cardH + 14) - m || behindCard) panTo(wx, wy);
}
// 歩き終わった自分: 自分の席に寄せて×2で止める。歩いているあいだに自分で地図を動かしていたら(followMeが切れている)そのまま
function stopAtMe() { if (followMe) frameMe(); }
// 下のHUD(自分のカード)の高さ。最初のカメラや「画面の中か」の判定で、カードの下を画面に数えない
const viewBottom = () => Math.max(hudInsets().bottom, ($('hudBottom') ? $('hudBottom').offsetHeight : 0) + 14);
function ensureMeVisible() { const pl = !ME.present ? null : isHere(ME) ? placeOf(ME) : placeOfSeat(ME); if (pl) ensureVisible(PX(pl.cx, pl.cy), PY(pl.cx, pl.cy, 20)); }
function applyScale(redrawOverlay = true) {
  const r = root.style;
  r.setProperty('--s', view.s); r.setProperty('--tagfs', TAGFS(view.s) + 'px');
  root.classList.toggle('s1', view.s <= 1);
  $('zoomLv').textContent = '×' + view.s; // ×0.75など(「全体」だけ)
  $('zoomIn').disabled = view.s >= 6; $('zoomOut').disabled = view.s <= minScale();
  clampView();
  if (redrawOverlay) { renderOverlay(); layoutBubbles(); renderWorld(); }
  applyCamera();
}
function zoomAt(ds, clientX, clientY) {
  userCam = true; // 自分でズームした(ホイール・ピンチ・＋−)
  if (ds < 0 && view.s <= minScale()) return;
  const ns = ds > 0 ? Math.min(6, Math.floor(view.s) + 1) : Math.max(minScale(), Math.ceil(view.s) - 1); // ×0.75から＋は×1へ
  if (ns === view.s) return;
  const wx = view.x + (innerWidth - clientX) / view.s, wy = view.y + clientY / view.s; // 表示は左右反転
  view.s = ns; view.x = wx - (innerWidth - clientX) / ns; view.y = wy - clientY / ns;
  applyScale();
}
const sctx = sceneEl.getContext('2d');
function applyCamera() {
  const s = view.s, cw = Math.ceil(innerWidth / s) + 2, ch = Math.ceil(innerHeight / s) + 2;
  if (sceneEl.width !== cw || sceneEl.height !== ch) { sceneEl.width = cw; sceneEl.height = ch;  }
  // ×1未満(「全体」だけ)はなめらかに縮める。×1以上はニアレストのまま
  const sm = s < 1; sctx.imageSmoothingEnabled = sm; sctx.imageSmoothingQuality = 'high'; sceneEl.style.imageRendering = sm ? 'auto' : '';
  sceneEl.style.width = cw * s + 'px'; sceneEl.style.height = ch * s + 'px';
  const fx = Math.floor(view.x), fy = Math.floor(view.y);
  const Wv = innerWidth / s;
  sceneEl.style.transformOrigin = '0 0';
  sceneEl.style.transform = `translate(${(view.x + Wv - fx) * s}px, ${-(view.y - fy) * s}px) scaleX(-1)`;
  worldEl.style.transform = `translate(${(view.x + Wv) * s}px, ${-view.y * s}px)`;
  // 名札・表札・吹き出しをHUDの内側に収めるための値(CSSの .tag/.plateが使う。画面のy座標)
  const rs = root.style, { top } = hudInsets();
  rs.setProperty('--vy', view.y * s); rs.setProperty('--ct', top + 4 + 'px');
  rs.setProperty('--cb', innerHeight - $('hudBottom').offsetHeight - 14 + 'px');
  if (bubbles.length) layoutBubbles();
  blit();
}
// 画面の座標 ⇔ 絵の画素(表示は左右反転) / 画面の画素ぶんカメラを動かす(ドラッグと同じ向き)
const screenToPx = (cx, cy) => ({ x: view.x + (innerWidth - cx) / view.s, y: view.y + cy / view.s }), pxToScreen = (px, py) => ({ x: innerWidth - (px - view.x) * view.s, y: (py - view.y) * view.s });
function panBy(dx, dy) { view.x += dx / view.s; view.y -= dy / view.s; clampView(); applyCamera(); }
// 重ね順: 背景(単色) → 雨・雪 → 見ている階
// 背景(map.backdrop)。時間帯・天気が変わったときだけ作り直す。見ている階の分だけ下に下げる(上の階ほど地面が遠い)
let BACK = null;
function buildBack() {
  BACK = MAP.backdrop === 'city' || MAP.backdrop === 'countryside' ? makeBackdrop({ kind: MAP.backdrop, name: MAP.name || '', bounds: { XB, XE, YA, YE }, ox: OFFICE_OX, oy: OFFICE_OY, slab: SLAB, box: BOX, time: TIME, weather: WEATHER, sky: CUR_SKY.x }) : null;
}
function blit() {
  if (!rectHas(RR, Math.max(0, view.x - 2), Math.max(0, view.y - 2), Math.min(OFFICE_W, view.x + innerWidth / view.s + 2), Math.min(OFFICE_H, view.y + innerHeight / view.s + 2))) renderWorld(); // 描いてある範囲からカメラが出た
  const fx = Math.floor(view.x), fW = Math.floor(view.y), W = sceneEl.width, H = sceneEl.height;
  const fy = fW + (FLOORS.length - 1 - FLS.indexOf(FL[FLOOR])) * FLOOR_H; // 下の階は同じ所に描くので、雨・雪は階ぶんだけ上に見える。最上階の絵はfWのまま
  sctx.fillStyle = CUR_SKY.x; sctx.fillRect(0, 0, W, H);
  if (BACK) { // 見えるぶんだけ貼る
    const dx = BACK.x - fx, dy = BACK.y - fW + FLS.indexOf(FL[FLOOR]) * FLOOR_H, sx = Math.max(0, -dx), sy = Math.max(0, -dy), sw = Math.min(BACK.canvas.width - sx, W - dx - sx), sh = Math.min(BACK.canvas.height - sy, H - dy - sy);
    if (sw > 0 && sh > 0) sctx.drawImage(BACK.canvas, sx, sy, sw, sh, dx + sx, dy + sy, sw, sh);
  }
  drawPrecip(fx, fy);
  sctx.drawImage(worldCanvas, -fx, -fW);
  if (mini) drawMini();
}
// 雨・雪(屋外だけ: 建物の絵を上に重ねて隠す)
let precip = [];
function initPrecip() {
  precip = [];
  if (WEATHER !== 'rain' && WEATHER !== 'snow') return;
  const R = rng(9), n = WEATHER === 'rain' ? 1300 : 800;
  for (let i = 0; i < n; i++) precip.push({ x: R() * 2400, y: R() * 1400, v: WEATHER === 'rain' ? 6 + R() * 3 : 0.6 + R() * 0.6, ph: R() * 6 });
}
function updatePrecip() { for (const d of precip) { d.y += d.v; d.x += WEATHER === 'rain' ? -1.5 : Math.sin((tick + d.ph * 10) / 5) * 0.5; if (d.y > 1400) { d.y = -3; d.x = Math.random() * 2400; } if (d.x < 0) d.x += 2400; } }
function drawPrecip(fx, fy) {
  if (!precip.length) return;
  sctx.fillStyle = WEATHER === 'snow' ? '#ffffff' : TIME === 'night' ? '#8f99bd' : '#cfdcec';
  const w = sceneEl.width, h = sceneEl.height;
  for (const d of precip) {
    const x = Math.round(((d.x - fx) % 2400 + 2400) % 2400) - 400, y = Math.round(((d.y - fy) % 1400 + 1400) % 1400) - 100;
    if (x < 0 || y < 0 || x > w || y > h) continue;
    if (WEATHER === 'rain') { sctx.fillRect(x, y, 1, 3); sctx.fillRect(x - 1, y + 3, 1, 3); } else { sctx.fillRect(x, y, 2, 2); if (d.ph > 3) sctx.fillRect(x + 2, y + 1, 1, 1); }
  }
}
function groundTile() { // 背景の単色(空の色)
  root.style.backgroundColor = CUR_SKY.x;
}
// ドラッグ・ピンチ・ホイール
const pointers = new Map();
let drag = null, pinch = null, swallowClick = false;
const hudSel = '.hud-top,.hud-bottom,.zoom,.pop,.toast,.hud-sheet,.sheet-btn,.hud-bar';
appEl.addEventListener('pointerdown', e => {
  if (e.target.closest(hudSel)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, id: e.pointerId };
  followMe = false; panAnim++; // 自分で動かしたら、歩く自分を追う・寄せるのをやめる
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
});
on(window, 'pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d / pinch.d > 1.35) { zoomAt(1, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; swallowClick = true; }
    else if (d / pinch.d < 0.74) { zoomAt(-1, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; swallowClick = true; }
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; userCam = true; appEl.classList.add('dragging'); closePop(); } // 自分でパンした
  if (drag.moved) { view.x = drag.vx + dx / view.s; view.y = drag.vy - dy / view.s; clampView(); applyCamera(); }
});
const endPointer = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (drag && drag.moved) { swallowClick = true; later(() => { swallowClick = false; }, 0); }
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { drag = null; appEl.classList.remove('dragging'); }
};
on(window, 'pointerup', endPointer); on(window, 'pointercancel', endPointer);
appEl.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
let wheelAcc = 0;
appEl.addEventListener('wheel', e => {
  if (e.target.closest('.pop,.loglist,.hud-sheet')) return;
  e.preventDefault();
  wheelAcc += e.deltaY * (e.ctrlKey ? 4 : 1);
  if (Math.abs(wheelAcc) >= 80) { zoomAt(wheelAcc < 0 ? 1 : -1, e.clientX, e.clientY); wheelAcc = 0; }
}, { passive: false });
// ＋−の基準: 入室中で自分が画面に映っていれば自分の位置(拡大で自分の席が画面の外へ出ないように)。ほかは画面の真ん中。ホイールはカーソルの位置
function zoomBtn(ds) {
  const pl = !ME.present ? null : isHere(ME) ? placeOf(ME) : placeOfSeat(ME), me = pl && pxToScreen(PX(pl.cx, pl.cy), PY(pl.cx, pl.cy, 20));
  const on = me && me.x >= 0 && me.x <= innerWidth && me.y >= 0 && me.y <= innerHeight;
  zoomAt(ds, on ? me.x : innerWidth / 2, on ? me.y : innerHeight / 2);
}
$('zoomIn').addEventListener('click', () => zoomBtn(1));
$('zoomOut').addEventListener('click', () => zoomBtn(-1));
$('zoomFit').addEventListener('click', () => { userCam = false; frameAll(); lastFrame = 'fit'; }); // 「全体」を押したら、また大きさに合わせて取り直してよい
$('zoomMe').addEventListener('click', () => { if (ME.present) frameMe(Math.max(2, view.s)); }); // 自分の席に寄せる。×2以上ならその倍率のまま(×4で机を見ていて押しても×2に戻さない)、×2未満は×2(入室前はCSSで出さない)

/* ============================================================
   マップの上の表示(表札・名札・当たり判定)
   ============================================================ */
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const roomCount = id => PEOPLE.filter(p => isHere(p) && !p.away && (floorOf(id) === 3 ? p.room === id : logicalRoom(p.room) === logicalRoom(id))).length; // 表札の人数に離席中の人は数えない(在席の数と合わせる)
// 表札の「話し中」: 小さい吹き出しのドット絵(11×8)と動く「...」。読み上げは「話し中」だけ
const TALK_MARK = `<span class="tk" role="img" aria-label="${_t('engine.talking')}"><svg viewBox="0 0 11 8" aria-hidden="true"><path d="M2 0h7v1h1v1h1v3h-1v1h-1v1H5v1H2V7H1V5H0V2h1V1h1z" fill="#221f2c"/><path d="M2 1h7v1h1v3h-1v1H5v1H2V5H1V2h1z" fill="#fbf9f3"/><path d="M3 3h1v1H3zM5 3h1v1H5zM7 3h1v1H7z" fill="#221f2c"/></svg><i aria-hidden="true">...</i></span>`;
function headXY(p) {
  const pl = placeOf(p); if (!pl) return null;
  const x = PX(pl.cx, pl.cy);
  if (pl.over) return { x, y: PY(pl.cx, pl.cy, 30) - 14 };
  return { x, y: PY(pl.cx, pl.cy, pl.z) - (pl.stand ? 27 : 20) };
}
function renderOverlay() {
  if (preview && !config.tags) return; // tags: 名札だけ出す(表札・ボタンなし)
  const html = [];
  for (const room of preview ? [] : FL[FLOOR].rooms) {
    if (!room.sign) continue; // 表札はsignのある部屋だけ
    const here = inOffice(ME) && myRoomId() === logicalRoom(room.id);
    const [sx, sy, sz] = room.sign, x = PX(sx, sy), y = room.mount === 'floor' ? PY(sx, sy, PLATE_Z_FLOOR) : PY(sx, sy, sz);
    let inner = `<span>${esc(room.name)}</span>`;
    const meet = !!MEET_URLS[room.id]; // Meetは設定のある部屋だけ
    if (HAS_SEATS.has(room.id)) inner += `<span class="cnt">${_t('engine.plate.count', { n: roomCount(room.id) })}</span>`; // 席のない部屋(給湯コーナーなど)は人数を出さない
    if (TALK_ROOMS.includes(logicalRoom(room.id)) && logicalRoom(room.id) !== myRoomId()) inner += TALK_MARK; // 自分の部屋の発言はログで読めるので出さない
    if (meet) inner += `<button class="meet" data-meet="${esc(room.id)}" aria-label="${esc(_t('engine.plate.meet', { room: room.name }))}">${_t('engine.hud.callBtn')}</button>`;
    html.push(`<div class="plate${here ? ' here' : ''}${meet ? '' : ' nomeet'}" data-plate="${esc(room.id)}" style="--x:${NX(x)};--y:${y}">${inner}</div>`);
  }
  // 会議室: 入る(どこを押しても次の空き椅子へ)
  for (const mt of preview ? [] : MEETS) {
    if (mt.floor !== FLOOR || (isHere(ME) && ME.room === mt.id)) continue;
    const [mx0, my0, mx1, my1] = mt.room.rects[0], c = [[mx0, my0], [mx1, my0], [mx1, my1], [mx0, my1]].map(([X, Y]) => [NX(PX(X, Y)), PY(X, Y, 0)]);
    const xs = c.map(p => p[0]), ys = c.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys) - 30, w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const poly = c.map(([x, y]) => `${((x - x0) / w * 100).toFixed(1)}% ${((y - y0) / h * 100).toFixed(1)}%`).join(',');
    const [lx, ly] = [NX(PX(...mt.c)), PY(...mt.c, 30)];
    html.push(`<button class="join" data-join="${esc(mt.id)}" aria-label="${esc(_t('engine.plate.join', { room: mt.room.name }))}" style="--x:${x0};--y:${y0};--sw:${w};--sh:${h};clip-path:polygon(${poly})"></button><div class="plus jlabel" style="--x:${lx};--y:${ly};opacity:0;transition:opacity .1s">${esc(_t('engine.plate.join', { room: mt.room.name }))}</div>`);
  }
  const tagHide = view.s <= 1, compact = view.s < 2; // compact: ×2未満(「全体」の×1.25など)は名札を小さくし、重なるものは間引く(下)
  for (const p of PEOPLE) {
    if (!isHere(p) || floorOf(p.room) !== FLOOR) continue; // 見ている階の人だけ
    const pl = placeOf(p); if (!pl || pl.over) continue;
    const x = PX(pl.cx, pl.cy), yf = PY(pl.cx, pl.cy, pl.z);
    const st = STATUS[statusOf(p)];
    const top = yf - (pl.stand ? 27 : 20);
    // 離席中: 点線で半分すけた名札(名字だけ。「離席中」の文字は名札を長くするので出さず、読み上げは .whoのaria-labelに入れる)。集中: 紫の枠
    const off = p.away, focus = !off && st.cls === 'focus';
    const sq = `<i class="sq ${st.cls}" title="${st.label}"></i>`; // 色の四角の意味はtitle(と「?」の凡例)
    // 名札もマウスで押せる(人と同じカード)。キーボードと読み上げは下の .whoボタンだけ
    // 呼んでいる人(返事するまで)は名札の左端に「!」。頭上に別に出すと、隣の人の名札の横に見えて誰が呼んでいるか取り違えた
    const call = pendingCall?.fromUserId === p.id ? '<b class="callin" aria-hidden="true">!</b>' : '', cls = call ? ' calling' : '';
    if (!compact || p.me) html.push(`<div class="tag${p.me ? ' me' : ''}${cls}${off ? ' off away' : ''}${focus ? ' focus' : ''}" data-person="${esc(p.id)}" style="--x:${NX(x)};--y:${top}">${call}${off ? '' : sq}${p.me ? _t('engine.you') : esc(tagName(p))}${p.memo && !compact ? MEMO_SVG : ''}</div>`); // ×2未満は自分の名札も印なし(机の飾りを隠さない幅に)
    else html.push(`<div class="tag small-tag${cls}${off ? ' off away' : ''}" data-person="${esc(p.id)}" style="--x:${NX(x)};--y:${top}">${call}${off ? '' : sq}${esc(tagName(p))}</div>`); // ×2未満(「全体」など)は色の四角＋名字だけ
    if (!preview) html.push(`<button class="who" style="--x:${NX(x)};--y:${yf + 3};--sw:14;--sh:${pl.stand ? 28 : 22}" data-person="${esc(p.id)}" data-label="${esc(personLine(p))}" aria-label="${esc(p.name)}(${esc(personLine(p))})"></button>`);
  }
  if (!preview) for (const mt of MEETS) { const n = meetLayout(mt.id).over.length; if (n && mt.floor === FLOOR) html.push(`<div class="plus" style="--x:${NX(PX(mt.plusAt[0], mt.plusAt[1]))};--y:${PY(mt.plusAt[0], mt.plusAt[1], mt.plusAt[2])}">+${n}</div>`); }
  const free = pickSeat && !ME.present ? new Set(freeSeats().map(st => st.id)) : null; // 入室する席を選んでもらうあいだは、選べる席に点滅する黄色い輪(.seat.free)
  for (const st of preview ? [] : SEATS) {
    if (st.floor !== FLOOR || occupantOf(st) || reserved(st)) continue;
    const x = PX(st.cx, st.cy), y = PY(st.cx, st.cy, st.z0 || 0); // z0: 台の高さ
    // 机の席は誰でも座れる。空いているときはprops.labelの札も出す(.tagはpointer-events:noneなので下のボタンを邪魔しない)
    if (st.sign && !tagHide) html.push(`<div class="tag off" style="--x:${NX(x)};--y:${y - (st.type === 'stand' ? 10 : 32)}">${esc(st.sign)}</div>`); // 立ち位置の札は床の印のすぐ上
    const label = _t(ME.present ? 'engine.seat.here' : 'engine.seat.enter');
    html.push(`<button class="seat${free && free.has(st.id) ? ' free' : ''}" style="--x:${NX(x)};--y:${y + 4};--sw:14;--sh:${st.type === 'stool' ? 30 : 24}" data-seat="${esc(st.id)}" data-label="${label}" aria-label="${esc(_t('engine.seat.sit', { room: roomById(st.room).name, seat: st.label }))}"></button>`);
  }
  if (!preview && config.itemButtons) for (const it of FL[FLOOR].fm.items) { // プラグインの置き物の上の押せるボタン(箱の上の真ん中)
    const label = Object.hasOwn(config.itemButtons, it.type) ? config.itemButtons[it.type] : null, c = CATALOG[it.type];
    if (!label || !c?.dirs || (it.season && it.season !== SEASON)) continue;
    const bs = c.boxes?.(it.dir, { ...c.props, ...it.props }) || [], cx = it.x + (bs.length ? (Math.min(...bs.map(o => o.b[0])) + Math.max(...bs.map(o => o.b[3]))) / 2 : 0), cy = it.y + (bs.length ? (Math.min(...bs.map(o => o.b[1])) + Math.max(...bs.map(o => o.b[4]))) / 2 : 0);
    html.push(`<button class="hit" style="--x:${NX(PX(cx, cy))};--y:${PY(cx, cy, bs.length ? Math.max(...bs.map(o => o.b[5])) : 0) + 8};--sw:20;--sh:16" data-item="${esc(it.id)}" data-label="${esc(label)}" aria-label="${esc(label)}"></button>`);
  }
  ov.innerHTML = html.join('');
  if (preview) ov.querySelectorAll('.tag, .tag *').forEach(e => { e.style.pointerEvents = 'none'; }); // CSSの.tag[data-person]のauto(押せる名札)を打ち消す
  ov.querySelectorAll('[data-plate]').forEach(el => { PLATE_W[el.dataset.plate] = { w: el.offsetWidth / view.s, h: el.offsetHeight / view.s }; });
  if (compact) { // ×2未満: 重なる名札は間引く(.thin。人に重ねると出る)。先に置く順: 自分 → 話している・声かけ中の人 → 同じ島 → ほかの在席 → 離席中 → 空席の札。
    // 上へ2段までずらしてよいのは同じ島までの人だけ(みんなずらすと、島の上が名札の段で埋まる)
    const kept = [], hit = r => kept.some(k => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top);
    const rank = p => (!p ? 5 : p.me || pendingCall?.fromUserId === p.id ? 0 : bubbles.some(b => b.who.id === p.id) || callWait.has(p.id) ? 1 : ME.present && logicalRoom(p.room) === myRoomId() ? 2 : p.away ? 4 : 3);
    const order = [...ov.querySelectorAll('.tag')].map(el => ({ el, k: rank(el.dataset.person && PEOPLE.find(p => p.id === el.dataset.person)), y: el.getBoundingClientRect().top })).sort((a, b) => a.k - b.k || b.y - a.y);
    for (const { el, k: rk } of order) {
      let r = el.getBoundingClientRect(), k = 0;
      while (hit(r) && k < (rk <= 2 ? 2 : 0)) { k++; el.style.marginTop = -k * (r.height + 1) + 'px'; r = el.getBoundingClientRect(); }
      if (hit(r) && rk) { el.classList.add('thin'); el.style.marginTop = ''; } else kept.push(r); // 自分と呼んでいる人(rk=0)は間引かない
    }
    if (HOVER_PID) ov.querySelector(`.tag[data-person="${CSS.escape(HOVER_PID)}"]`)?.classList.add('peek');
  }
  if (view.s < 1) { // ×1未満(スマホの最初の表示・「全体」): 部屋の札は、重なる札は先に置いたもの(部屋の札)を残して間引く
    const keptP = [];
    for (const el of ov.querySelectorAll('.plate')) { const r = el.getBoundingClientRect(); if (keptP.some(k => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top)) el.style.visibility = 'hidden'; else keptP.push(r); }
  }
  platesAboveTags();
  bubbleTags();
  ov.querySelectorAll('.join').forEach(join => {
    const jl = join.nextElementSibling, mt = MEET[join.dataset.join];
    join.addEventListener('mouseenter', () => { jl.style.opacity = 1; const i = meetLayout(mt.id).spots.indexOf(null); hoverSeat = i >= 0 && i < mt.chairs ? 'meet:' + mt.id + '#' + i : null; drawWorld(); });
    join.addEventListener('mouseleave', () => { jl.style.opacity = 0; if (hoverSeat && hoverSeat.startsWith('meet:')) { hoverSeat = null; drawWorld(); } });
  });
  ov.querySelectorAll('.seat').forEach(b => {
    b.addEventListener('mouseenter', () => { hoverSeat = b.dataset.seat; drawWorld(); });
    b.addEventListener('mouseleave', () => { if (hoverSeat === b.dataset.seat) { hoverSeat = null; drawWorld(); } });
  });
}
function drawWorld() { renderWorld(); blit(); }
// 部屋の札が名札とぶつかるときは、ぶつからなくなるまで上へずらす(--up)
function platesAboveTags() {
  const tags = [...ov.querySelectorAll('.tag:not(.thin)')].map(e => e.getBoundingClientRect());
  for (const el of ov.querySelectorAll('.plate')) {
    el.style.removeProperty('--up');
    const r = el.getBoundingClientRect();
    let up = 0;
    for (let k = 0; k < 6; k++) {
      const t = tags.find(t => t.right > r.left && t.left < r.right && t.bottom > r.top - up && t.top < r.bottom - up);
      if (!t) break;
      up = r.bottom - t.top + 3;
    }
    if (up) el.style.setProperty('--up', up + 'px');
  }
}

/* ---------- 吹き出し: 1部屋に最新2枚まで、重なるときは上に積む ---------- */
const bubbles = [];
const clip40 = t => (t.length > 40 ? t.slice(0, 40) + '…' : t);
function bubbleRoom(who) { return who.walker ? 'walk' : who.room; }
const walkerHead = w => (w.where === 'hidden' || (w.where === 'office' && w.fl !== FLOOR) ? null : { x: PX(w.x, w.y), y: PY(w.x, w.y, 0) - 28 });
function bubblePos(who) {
  if (who.walker) return walkerHead(who.walker);
  if (who.walking) { const w = walkers.find(x => x.pid === who.id); return w ? walkerHead(w) : null; } // 歩いている人は歩いている絵の頭上
  if (!isHere(who) || floorOf(who.room) !== FLOOR) return null; // 入室していない人・ほかの階の人には出さない
  const h = headXY(who); if (!h) return null;
  return { x: h.x, y: h.y - (TAGFS(view.s) + 6) / view.s }; // 名札の上に出す
}
// チャットの吹き出しの中身: 改行は空白にして1つの流れに、URLはドメインだけのチップに、約40字で切る(more=続きはログ)。テストはbubble-text.test.ts
// drop: 自分あての名指しの正規表現(atRe)。「@あなた」のチップと重なるので本文から抜く
function bubbleParts(text, drop) {
  const parts = []; let n = 0, more = false;
  const flat = (drop ? String(text).replace(drop, '') : String(text)).replace(/\s*\n\s*/g, ' ').trimStart();
  for (const s of flat.split(/(https?:\/\/[!#$%&'()*+,\-./0-9:;=?@A-Z[\]_a-z~]+)/)) {
    if (!s) continue;
    if (n >= 40) { more = true; break; }
    let host = '';
    if (/^https?:\/\//.test(s)) { try { host = new URL(s).hostname; } catch { /* URLにならなければ文字のまま */ } }
    if (host) { parts.push({ url: host }); n += host.length + 1; if (s.endsWith(')') && !s.includes('(')) { parts.push({ t: ')' }); n++; } continue; } // 「(URL)」の閉じ括弧はチップの後ろに残す(ログのfillTextと同じ)
    const cs = [...s];
    if (n + cs.length > 40) { parts.push({ t: cs.slice(0, 40 - n).join('') }); more = true; break; }
    parts.push({ t: s }); n += cs.length;
  }
  return { parts, more };
}
// o: チャットの発言のとき { id: 発言のid(取り消しで消す), mention: 自分あての名指し }
function say(who, text, ms, cls, o) {
  if (who.me && !who.walker && !ME.present) return;
  const room = bubbleRoom(who), mine = bubbles.filter(b => b.who === who);
  // 発言は捨てずに順に出す: 同じ人の吹き出しが出ている、または同じ部屋に2つ出ているときは待たせる。待ちがあれば今の吹き出しは2.5秒で切り上げる
  if (!cls && (mine.some(b => !b.cls) || bubbles.filter(b => b.room === room && !b.alert).length >= 2)) {
    bubbleQueue.push({ who, text, room, o }); if (bubbleQueue.length > 12) bubbleQueue.shift();
    for (const b of bubbles) if (b.room === room && !b.cls && b.until - performance.now() > 2500) { clearTimeout(b.timer); b.until = performance.now() + 2500; b.timer = later(() => fadeBubble(b), 2500); }
    return null;
  }
  mine.forEach(dropBubble); // ヒント・「!」・「…」などは差し替え
  const el = document.createElement('div');
  el.className = 'bub' + (cls ? ' ' + cls : '') + (!cls && o?.mention ? ' men' : '');
  el.innerHTML = '<b class="spk"></b><span class="tx"></span>';
  el.querySelector('.spk').textContent = (who.me ? _t('engine.you') : who.name || '') + ':';
  const tx = el.querySelector('.tx'), chip = (c, t) => Object.assign(document.createElement('span'), { className: c, textContent: t });
  if (cls || !PEOPLE.includes(who)) tx.textContent = clip40(text); // ヒント・NPCなどはログに無いので「続きはログ」を付けない
  else {
    const { parts, more } = bubbleParts(text, o?.mention ? atRe(ME) : null), tail = chip('more', '…');
    tail.append(Object.assign(document.createElement('b'), { textContent: _t('engine.bubble.more') })); // 「…続きはログ」を改行で割らない
    tx.replaceChildren(...(o?.mention ? [chip('atl', _t('engine.atYou'))] : []), ...parts.map(p => (p.url ? chip('chip', '🔗' + p.url) : p.t)), ...(more ? [tail] : []));
  }
  fxov.appendChild(el);
  const b = { el, who, room, o, cls: cls || '', alert: cls === 'alert', t: performance.now(), until: performance.now() + (ms || 6000) };
  bubbles.push(b);
  layoutBubbles();
  b.timer = later(() => fadeBubble(b), ms || 6000);
  if (!cls && mini && !who.walker && logicalRoom(who.room) === myRoomId()) renderMiniHead();
  return b;
}
const bubbleQueue = [];
function fadeBubble(b) { b.el.classList.add('out'); later(() => dropBubble(b), 320); }
function dropBubble(b) {
  clearTimeout(b.timer); b.el.remove(); const i = bubbles.indexOf(b); if (i >= 0) bubbles.splice(i, 1);
  bubbleTags();
  // 待っている発言を順に出す(その部屋の、いま吹き出しの出ていない人のいちばん古いもの)
  const k = bubbleQueue.findIndex(q => q.room === b.room && !bubbles.some(x => x.who === q.who && !x.cls));
  if (k >= 0 && !destroyed) { const q = bubbleQueue.splice(k, 1)[0]; later(() => say(q.who, q.text, bubbleQueue.some(x => x.room === q.room) ? 3000 : 5000, undefined, q.o), 120); }
}
function layoutBubbles() {
  // 吹き出しは話した人の名札のすぐ上(画面の座標を #worldの中の座標にして比べる)。ぶつかる物でよけ方を変える:
  // 先に置いた吹き出し・「あなた」と呼んでいる人の名札 → しっぽが頭を指せる範囲で左右にずらし、だめならその上に積む(名前つきの点線)。
  // 表札(部屋の札) → 左右によけるだけで上へは逃がさない(表札を越えて遠くの別の部屋の表札の横に出て、その部屋の人の発言に見えた)。よけきれなければ表札に重ねる。
  // ほかの名札は避けない(混んだ島で吹き出しが遠くへ逃げた)。かぶる名札のほうを隠す(bubbleTags)
  const s = view.s, wr = worldEl.getBoundingClientRect();
  const rel = e => { const r = e.getBoundingClientRect(); return { el: e, l: r.left - wr.left, r: r.right - wr.left, top: r.top - wr.top, bottom: r.bottom - wr.top }; };
  const plates = bubbles.length ? [...ov.querySelectorAll('.plate')].filter(e => e.style.visibility !== 'hidden').map(rel) : [];
  const keep = bubbles.length ? [...ov.querySelectorAll('.tag.me, .tag.calling')].map(rel) : []; // 隠さない名札(bubbleTags)。吹き出しのほうがよける
  const placed = [];
  const { top: hTop, bottom: hBot } = hudInsets(), ct = hTop + 4, cb = innerHeight - Math.max(hBot, $('hudBottom').offsetHeight + 14);
  for (const b of bubbles.slice().sort((a, c) => (c.alert - a.alert) || (a.t - c.t))) {
    const pos = bubblePos(b.who);
    if (!pos || (b.who.me && !b.who.walker && !ME.present)) { dropBubble(b); continue; }
    const own = b.who.id ? ov.querySelector(`.tag[data-person="${CSS.escape(b.who.id)}"]`) : null;
    const y = own ? Math.min(pos.y, (own.getBoundingClientRect().top - wr.top - 1) / s) : pos.y; // 名札を上へずらしてあれば、その上
    b.el.style.setProperty('--x', NX(pos.x)); b.el.style.setProperty('--y', y);
    const cx = NX(pos.x) * s, bottom = y * s - 6;
    // 画面の中・HUDの外に収める(上のバーの下、下のカードの上、左右は8px内側)。話した人の頭が画面の外なら出さない
    const headX = wr.left + cx, headY = wr.top + pos.y * s, seen = headX > 0 && headX < innerWidth && headY > ct - 20 && headY < innerHeight;
    b.el.style.visibility = seen ? '' : 'hidden';
    const solid = placed.concat(keep.filter(k => k.el !== own)), soft = plates;
    const place = (w, h) => {
      const hit = (list, dx, lift) => list.filter(p => cx + dx - w / 2 < p.r + 4 && cx + dx + w / 2 > p.l - 4 && bottom - lift - h < p.bottom + 2 && bottom - lift > p.top - 2);
      const lo = seen ? 8 - (headX - w / 2) : -1e9, hi = seen ? innerWidth - 8 - (headX + w / 2) : 1e9, d0 = Math.max(lo, Math.min(hi, 0));
      const edges = solid.concat(soft).flatMap(p => [p.r + 4 - (cx - w / 2), p.l - 4 - (cx + w / 2)]);
      let lift = 0;
      for (let guard = 0; guard < 8; guard++) {
        const span = lift > 0 ? w / 2 : w / 2 - 12; // ずらしてよい幅: しっぽが頭を指せる範囲。積んだ吹き出し(しっぽなし・名前つき)は幅の半分まで
        const cands = [d0, ...edges.filter(d => Math.abs(d) <= span && d >= lo && d <= hi)].sort((a, c) => Math.abs(a) - Math.abs(c));
        const ok = cands.filter(d => !hit(solid, d, lift).length);
        if (ok.length) return { dx: ok.find(d => !hit(soft, d, lift).length) ?? ok[0], lift };
        lift = bottom - Math.min(...hit(solid, d0, lift).map(p => p.top)) + 4; // 左右でよけきれない: ぶつかる物の上に積む
      }
      return { dx: d0, lift };
    };
    b.el.classList.remove('lifted');
    let w = b.el.offsetWidth, h = b.el.offsetHeight, { dx, lift } = place(w, h);
    if (lift > 0) { b.el.classList.add('lifted'); w = b.el.offsetWidth; h = b.el.offsetHeight; ({ dx, lift } = place(w, h)); } // 積むと名前が付いて幅と高さが変わる
    if (seen) { const sTop = wr.top + bottom - lift - h, sBot = wr.top + bottom - lift; if (sTop < ct) lift -= ct - sTop; else if (sBot > cb) lift += sBot - cb; }
    b.el.style.setProperty('--dx', dx + 'px');
    b.el.style.setProperty('--lift', lift + 'px');
    b.el.classList.toggle('lifted', lift > 0);
    placed.push({ l: cx + dx - w / 2, r: cx + dx + w / 2, top: bottom - lift - h, bottom: bottom - lift });
  }
  bubbleTags();
}
// 吹き出しにかぶる名札は吹き出しが消えるまで隠す(.bubhide)。話している人の名札は間引いていても出し(.speak)、それにかぶる名札も隠す。
// 「あなた」と呼んでいる人の名札は隠さない(吹き出しのほうがよける)
function bubbleTags() {
  const zones = [], speak = new Set();
  for (const b of bubbles) {
    if (b.el.style.visibility === 'hidden') continue;
    const own = b.who.id ? ov.querySelector(`.tag[data-person="${CSS.escape(b.who.id)}"]`) : null;
    if (own) { speak.add(own); zones.push(own.getBoundingClientRect()); }
    zones.push(b.el.getBoundingClientRect());
  }
  const tags = [...ov.querySelectorAll('.tag')]; // 先に全部測ってから書く(測る・書くを交互にすると毎回レイアウトし直す)
  const hide = tags.map(t => { if (speak.has(t) || !zones.length || t.matches('.me, .calling')) return false; const r = t.getBoundingClientRect(); return zones.some(q => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top); });
  tags.forEach((t, i) => { t.classList.toggle('speak', speak.has(t)); t.classList.toggle('bubhide', hide[i]); });
}
// 吹き出しの上に出す
function iconAt(p, sprite, cls, ms) {
  const pos = bubblePos(p), b = bubbles.find(x => x.who === p);
  if (!pos) return; // 絵に出ていない人(歩いている途中・入室していない)
  let dx = 0, lift = b ? Math.ceil((b.el.offsetHeight + 10) / view.s) : 2;
  const el = document.createElement('div'); el.className = 'fxicon ' + cls;
  el.style.setProperty('--x', NX(pos.x) + dx); el.style.setProperty('--y', pos.y - lift);
  el.appendChild(iconCanvas(sprite)); fxov.appendChild(el);
  later(() => el.remove(), ms || 3000);
  return el;
}
// エモーション(押した人の画面は押したとき、ほかの人の画面はポーリングのemotes): 頭上に絵を約3.5秒(種類ごとの動きはCSS)。
// 座っている人は体も動かす(drawPerson)。歩いている人・立っている人は絵だけ
function startEmote(p, kind) {
  if (!EMOTE_ICON[kind]) return;
  p.emo = { kind, end: Date.now() + 3500 };
  p.emoEl?.remove(); p.emoEl = iconAt(p, EMOTE_ICON[kind], 'emo emo-' + kind, 3500); // 続けて押したら前の絵は消す
  kickLoop(); // 描く間隔を0.2秒に(moving)
}

/* ============================================================
   チャット(自分の部屋の今日の発言。VoState の messages を古い順に。自分の送信中のものは pending)
   ============================================================ */
let MSGS = [];
const nowHM = () => zonedHM(new Date());
// unreadAt: 未読に自分あての名指しがある。readId: 最後に読んだ発言(''は何も無いうちに読んだ)。unrAfter: 「ここから未読」を出す発言(開いたときにreadIdから取る。nullは出さない)。newBelow: 上を見ているあいだに新着が来た
let unread = 0, unreadAt = false, readId = '', unrAfter = null, newBelow = false, atPicked = [];
const REACTIONS = [['good', 'engine.react.good'], ['heart', 'engine.react.heart'], ['clap', 'engine.react.clap'], ['laugh', 'engine.react.laugh'], ['thanks', 'engine.react.thanks']]; // 絵はemote-sprites.jsのREACTION_ICONS
const NAME_COLS = ['#f39ab8', '#8fcbe0', '#bba4e8', '#f2a65a', '#7fd1c1', '#e3a8a0']; // ログの名前の札(自分は緑の「あなた」)。濃い文字が読める明るい色
const nameCol = id => NAME_COLS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % NAME_COLS.length];
const UNCHAT_MS = 60e3; // 取り消せるのは送ってから1分(サーバーも409で弾く)
let srvOff = 0; // サーバーの時刻 - この端末の時刻(applyStateが合わせる)。期限はサーバーの時刻で比べる
function markRead() { unread = 0; unreadAt = false; readId = MSGS.filter(m => !m.pending).map(m => m.id).pop() || readId; renderUnread(); }
// 未読は毎回数え直す: 最後に読んだ発言より後の、ほかの人の取り消されていない発言(読んだ発言が50件の外に出ていれば全部)
function countUnread() { const news = MSGS.slice(MSGS.findIndex(m => m.id === readId) + 1).filter(m => m.userId !== ME.id && !m.deleted && !m.pending); unread = news.length; unreadAt = news.some(m => (m.mentions ?? []).includes(ME.id)); }
// 自分の発言(今いる部屋だけ): すぐ吹き出しとログに出してから送る。失敗したらログから消してトースト(入力欄が空なら文と名指しを戻す)
// 通ったら応答から本物のidを探して吹き出し(待ち行列も同じo)に入れる。取り消したときにidで消すため。ownIdsは2つの吹き出しに同じidを入れないため
const ownIds = new Set();
function postChat(text, mentions, picked) {
  showMe();
  markRead(); // 自分が話したら読んだことにする
  const m = { id: 'tmp' + Date.now(), userId: ME.id, name: ME.name, text, createdAt: new Date().toISOString(), pending: true, mentions: mentions || [] }, o = {}, known = new Set(MSGS.map(x => x.id));
  act({ type: 'chat', text, ...(mentions && mentions.length ? { mentions } : {}) }, () => { MSGS.push(m); say(ME, text, undefined, undefined, o); renderLog(true); }, () => { MSGS = MSGS.filter(x => x !== m); if (!$('sayInput').value) { $('sayInput').value = text; atPicked = picked || []; fitSay(); } renderLog(); })
    .then(st => { const news = (st?.messages ?? []).filter(x => x.userId === ME.id && !known.has(x.id) && !ownIds.has(x.id)), real = news.find(x => x.text === text) || news[0]; if (real) { ownIds.add(real.id); o.id = real.id; } });
}
function react(m, kind) {
  const flip = () => { const rs = (m.reactions ?? []).map(r => ({ ...r, userIds: [...r.userIds] })); let r = rs.find(x => x.kind === kind); if (!r) rs.push(r = { kind, userIds: [] }); r.userIds = r.userIds.includes(ME.id) ? r.userIds.filter(id => id !== ME.id) : [...r.userIds, ME.id]; m.reactions = rs; renderLog(); };
  act({ type: 'react', messageId: m.id, kind }, flip, flip);
}
function unchat(m) { act({ type: 'unchat', messageId: m.id }, () => { m.deleted = true; renderLog(); }, () => { m.deleted = false; renderLog(); }); }
// 顔とリアクションの絵はdata URLにして使い回す(ログは発言ごとに描き直すので)
const imgURLs = new Map();
let PARTS = config.parts || [], PARTS_VER = 0; // みんなのパーツ。setPartsのたびに版を進めて、顔の絵の使い回しを捨てる
const imgURL = (key, make) => imgURLs.get(key) || imgURLs.set(key, make().toDataURL()).get(key);
const faceURL = p => imgURL(JSON.stringify([p.id, p.hair, p.hc, p.sk, p.cl, p.pt, p.ot, p.ac, PARTS_VER]), () => faceCanvas(p));
const reactURL = k => imgURL('r:' + k, () => iconCanvas(REACTION_ICONS[k]));
// 本文: http(s)のURLだけリンク(表示は25字で…＋↗)、名指しの「@名字」はチップ。本文はinnerHTMLに入れずテキストノードで組み立てる
function fillText(el, m) {
  const names = (m.mentions ?? []).flatMap(id => atLabels(PEOPLE.find(x => x.id === id)).map(n => [n, id])).sort((a, b) => b[0].length - a[0].length);
  const re = new RegExp(/https?:\/\/[!#$%&'()*+,\-./0-9:;=?@A-Z[\]_a-z~]+/.source + (names.length ? `|@(?:${names.map(([n]) => reEsc(n)).join('|')})(?=\\s|$)` : ''), 'g'); // URLは " < > などURLに使えない文字で切る(吹き出しのbubblePartsと同じ)
  let i = 0;
  for (const mt of m.text.matchAll(re)) {
    el.append(m.text.slice(i, mt.index)); i = mt.index + mt[0].length;
    if (mt[0][0] === '@') { const s = document.createElement('span'); s.className = names.some(([n, id]) => '@' + n === mt[0] && id === ME.id) ? 'mn me' : 'mn'; s.textContent = mt[0]; el.append(s); continue; }
    const url = mt[0].endsWith(')') && !mt[0].includes('(') ? mt[0].slice(0, -1) : mt[0], a = document.createElement('a'), u = url.replace(/^https?:\/\//, '');
    i -= mt[0].length - url.length; // 「(URL)」の閉じ括弧はリンクに入れず本文に戻す
    Object.assign(a, { href: url, target: '_blank', rel: 'noopener noreferrer', title: url, className: 'lk', textContent: (u.length > 25 ? u.slice(0, 25) + '…' : u) + '↗' });
    el.append(a);
  }
  el.append(m.text.slice(i));
}
// ログの1行(iはitemsの番号。本文はあとでfillText)。自分の行は送って1分のあいだツールバーに「取り消す0:42」
function rowHTML(m, i) {
  const t = `<span class="tm">${zonedHM(new Date(m.createdAt))}</span>`;
  if (m.sys) return `<li class="sys" data-i="${i}"><div class="bd"><div class="tx"></div>${m.meet ? `<button class="pbtn sm go" data-log-meet="${esc(m.meet)}">${_t('engine.meet.open')}</button>` : ''}</div>${t}</li>`;
  if (m.deleted) return `<li class="del" data-mid="${esc(m.id)}"><span class="ret">${_t('engine.msg.deleted')}</span>${t}</li>`;
  const mine = m.userId === ME.id, p = PEOPLE.find(x => x.id === m.userId) || personOf(m.userId, m.name), [fam, given] = nameParts(m.name), end = Date.parse(m.createdAt) + UNCHAT_MS;
  const rs = REACTIONS.map(([k, lb]) => [k, _t(lb), (m.reactions ?? []).find(r => r.kind === k)?.userIds ?? []]);
  const chips = rs.filter(r => r[2].length).map(([k, lb, ids]) => `<button class="rc${ids.includes(ME.id) ? ' mine' : ''}" data-react="${k}" aria-pressed="${ids.includes(ME.id)}" aria-label="${_t('engine.react.count', { label: lb, n: ids.length })}"><img class="px" src="${reactURL(k)}" alt=""><b>${ids.length}</b></button>`).join('');
  const tb = m.pending ? '' : `<div class="tb">${rs.map(([k, lb, ids]) => `<button class="ib" data-react="${k}" aria-pressed="${ids.includes(ME.id)}" aria-label="${lb}" title="${lb}"><img class="px" src="${reactURL(k)}" alt=""></button>`).join('')}${mine && end > Date.now() + srvOff ? `<button class="pbtn sm" data-unchat="${end}">${_t('engine.unsend')}</button>` : ''}</div>`;
  return `<li class="msg${(m.mentions ?? []).includes(ME.id) ? ' men' : ''}" data-mid="${esc(m.id)}" data-i="${i}" tabindex="0"><img class="face px" src="${faceURL(p)}" alt=""><div class="bd"><div class="hd"><span class="nm" style="--nc:${mine ? 'var(--l)' : nameCol(m.userId)}">${mine ? _t('engine.you') : `${esc(fam)}<span class="nm2"> ${esc(given)}</span>`}</span>${t}</div><div class="tx"></div>${chips ? `<div class="rcs">${chips}</div>` : ''}</div>${tb}</li>`;
}
// 残り秒はここだけが書く(ログのhtmlに入れると毎秒描き直してボタンが差し替わる)。期限はサーバーの時刻(srvOff)で比べる
function tickUnchat() { for (const b of root.querySelectorAll('[data-unchat]')) { const left = b.dataset.unchat - Date.now() - srvOff; if (left > 0) b.textContent = _t('engine.unsend.t', { t: mmss(left) }); else b.remove(); } }
if (!preview) every(tickUnchat, 1000);

/* ============================================================
   HUD
   ============================================================ */
const logIsOpen = () => (isPhone() ? $('hudSheet').classList.contains('open') : $('hudLog').classList.contains('open'));
function renderUnread() {
  const n = unread; // 未読は今いる部屋の分だけ
  for (const id of ['unread', 'unread2']) { $(id).hidden = !n; $(id).textContent = id === 'unread' ? _t('engine.unread', { n }) : n; }
  $('unreadAt').hidden = !(n && unreadAt);
  const pre = (focusNag ? _t('engine.title.rest') : '') + (answerNag ? _t('engine.title.reply') : '') + (pendingCall ? '(!) ' : '') + (n ? `(${unreadAt ? '@' : ''}${n}) ` : ''); // 呼ばれているあいだは (!)。自分あての名指しがあれば (@2)
  document.title = pre + baseTitle();
  if (mini && mini.win !== window) mini.doc.title = pre + _t('engine.mini.title');
}
// toEnd: いちばん下までスクロールする(開いたとき・自分が話したとき)。それ以外は下にいたときだけ下へ、上を見ていれば位置を保って▼
let logLast = '';
const logSigs = {};
function renderLog(toEnd) {
  // 部屋の発言と、自分あての出来事(「〇〇さんから『ちょっといい？』」)を時刻の順に
  const rid = myRoomId(), msgs = MSGS;
  const items = [...msgs, ...SYS_LOG].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), last = items.length ? items[items.length - 1].id : '', grew = last !== logLast; // 件数でなく最後の行で見る(50件を超えると件数は増えない)
  logLast = last;
  // 「ここから未読」: 最後に読んだ発言より後の、ほかの人の最初の発言の上
  const ai = unrAfter === null ? -2 : items.findIndex(m => m.id === unrAfter), ui = ai < -1 ? -1 : items.findIndex((m, i) => i > ai && !m.sys && m.userId !== ME.id);
  const html = items.length ? items.map((m, i) => (i === ui ? `<li class="unr" aria-hidden="true"><span>${_t('engine.log.unread')}</span></li>` : '') + rowHTML(m, i)).join('') : `<li class="empty">${_t('engine.log.empty')}</li>`;
  for (const id of ['logList', 'logList2']) {
    const ol = $(id), vis = ol.clientHeight > 0, end = toEnd || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 8, top = ol.scrollTop, fx = ol.contains(document.activeElement) && document.activeElement.matches(':focus-visible') ? document.activeElement : null; // マウスで押したときは戻さない(ツールバーが出たままになる)
    let at = top;
    if (logSigs[id] !== html) { // 変わっていなければ描き直さない(ツールバーのフォーカスを奪わない)
      const fmid = fx && fx.closest('li')?.dataset.mid, fsel = fx && fx.dataset.react ? `.${fx.classList[0]}[data-react="${fx.dataset.react}"]` : '';
      const anc = end ? [] : [...ol.querySelectorAll('li[data-mid]')].filter(li => li.offsetTop + li.offsetHeight > top).slice(0, 5).map(li => [li.dataset.mid, li.offsetTop - top]); // 上を見ているときは見えている行を同じ高さに戻す(古い行が上から消えてもずれない。消えた行は次の行で)
      ol.innerHTML = html; logSigs[id] = html;
      ol.querySelectorAll('li[data-i]').forEach(li => { const m = items[li.dataset.i], tx = li.querySelector('.tx'); if (m.sys) tx.textContent = m.text; else fillText(tx, m); });
      tickUnchat();
      for (const [mid, off] of anc) { const li = ol.querySelector(`li[data-mid="${CSS.escape(mid)}"]`); if (li) { at = li.offsetTop - off; break; } }
      if (fmid) { const li = ol.querySelector(`li[data-mid="${CSS.escape(fmid)}"]`); li?.focus({ preventScroll: true }); if (fsel) li?.querySelector(fsel)?.focus({ preventScroll: true }); } // 先に行へ(ツールバーは行のフォーカス中だけ出るので)
    }
    if (end) ol.scrollTop = ol.scrollHeight; else ol.scrollTop = at;
    if (vis) newBelow = !end && (newBelow || grew); // 見えている窓だけで決める(隠れているほうは高さ0)
    ol.querySelector('.nx')?.remove();
    if (newBelow && vis) ol.insertAdjacentHTML('beforeend', '<li class="nx" aria-hidden="true"><i>▼</i></li>');
  }
  const talk = talkName(rid);
  $('logTitle').textContent = _t('engine.log.title', { room: talk });
  $('logTitle2').textContent = rid ? _t('engine.log.title', { room: talk }) : _t('engine.log.notIn');
  $('logCount').textContent = sayN(); // 「3人」「あなただけ」
  $('sayInput').placeholder = (innerWidth < 900 ? _t('engine.say.short') : _t('engine.say.placeholder')) + (innerWidth < 480 ? '' : sayCount()); // 狭い画面で切れないように。部屋の名前も入れると長い名前で切れた。スマホは人数も外す(「話しかける（」で切れた)
  // Meetは窓のヘッダー(スマホは入力欄の横)。URLがまだ無い部屋でも出す(押すと「まだ設定されていません」)
  const meetOk = HAS_SEATS.has(rid), mb = $('islandMeet');
  mb.hidden = !meetOk;
  if (meetOk) mb.setAttribute('aria-label', _t('engine.meet.of', { room: talk }));
}
// 今いる部屋が同じ人(2026-10-25夜に「自分の島」をやめた)
const sameRoom = p => !p.me && !!ME?.present && logicalRoom(p.room) === myRoomId();
// 島の名前は出さない。今いる部屋が同じなら「同じ島」「同じ部屋」、ほかの島は(自分が島にいれば)「ほかの島」
// 見ている階と違う階の人は「2Fのカフェ」のように階の名前を付ける
const placeName = p => (!p.room ? '' : sameRoom(p) ? _t('engine.place.same') : floorOf(p.room) !== FLOOR ? placeLabel(p.room) : roomById(p.room).name);
// 名簿の並び: 自分 → 今いる部屋が同じ人 → 島 → 島以外の部屋(マップの並び) → それぞれの中は名前順
const PLACE_ORDER = ROOMS.filter(r => r.kind !== 'work').map(r => r.id);
const placeRank = p => (p.me ? 0 : sameRoom(p) ? 1 : isIsland(p.room) ? 2 : 3 + (PLACE_ORDER.indexOf(p.room) + 1 || PLACE_ORDER.length + 1));
const byPlace = (a, b) => placeRank(a) - placeRank(b) || a.name.localeCompare(b.name, 'ja');
function rosterHTML() {
  const here = PEOPLE.filter(inOffice).sort(byPlace), away = PEOPLE.filter(p => p.present && p.away).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const legend = `<div class="legend">${Object.values(STATUS).map(s => `<span><i class="sq ${s.cls}"></i>${s.label}</span>`).join('')}</div>`;
  const row = (p, off) => {
    const st = STATUS[statusOf(p)], memo = p.memo;
    return `<li data-pid="${esc(p.id)}" class="${off ? 'off' : ''}" tabindex="0" role="button" aria-label="${esc(_t('engine.show', { name: p.name }))}"><span class="fc"></span><span class="nmrow"><span class="${p.me ? 'me' : ''}">${p.me ? esc(_t('engine.you.paren', { name: p.name })) : esc(p.name)}</span>${off ? '' : `<i class="sq ${st.cls}" title="${st.label}"></i><span class="where">${st.label}</span>`}</span><span class="where">${off ? _t('engine.status.away') : esc(placeName(p))}</span>${memo ? `<span class="memo1">${esc(memo)}</span>` : ''}</li>`;
  };
  return `${legend}<div class="psec">${_t('engine.roster.here', { n: here.length })}</div><ul class="plist">${here.map(p => row(p)).join('')}</ul>` + (away.length ? `<div class="psec">${_t('engine.roster.away', { n: away.length })}</div><ul class="plist">${away.map(p => row(p, true)).join('')}</ul>` : '');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fillFaces(root) { root.querySelectorAll('li[data-pid]').forEach(li => li.querySelector('.fc').replaceWith(faceCanvas(PEOPLE.find(p => p.id === li.dataset.pid)))); }
function renderHUD() {
  const here = PEOPLE.filter(inOffice);
  root.classList.toggle('out', !ME.present); // 入室していない: 中央に「入室する」。カードは名前と着替えだけ
  guideOnEnter(1200); // 入室した直後はトーストとカメラの移動が落ち着いてから
  if (ME.present) pickSeat = false;
  const nFree = pickSeat ? freeSeats().length : 0;
  // 島に空きが無いときは、おまかせの行き先を押す前に出す
  const dest = pickSeat && !nFree ? autoPlace() : '', full = seatsOfFloor().some(isWorkSeat) ? _t('engine.seats.work') : _t('engine.seats.floor', { floor: FL[FLOOR].name }); // 空き・黄色い輪は見ている階の席(freeSeats)
  $('enterNote').innerHTML = !pickSeat ? _t('engine.enter.note') : _t(isPhone() ? (nFree ? 'engine.enter.pickPhone' : 'engine.enter.fullPhone') : nFree ? 'engine.enter.pick' : 'engine.enter.full', { n: nFree, full: esc(full), dest: esc(dest) });
  $('enterBox').classList.toggle('pick', pickSeat);
  $('enterBtn').textContent = _t(pickSeat ? 'engine.enter.auto' : 'engine.enter.btn');
  const faces = $('faces'); faces.innerHTML = '';
  here.slice(0, 5).forEach(p => faces.appendChild(faceCanvas(p)));
  if (here.length > 5) { const m = document.createElement('span'); m.className = 'more'; m.textContent = '+' + (here.length - 5); faces.appendChild(m); }
  const awayN = PEOPLE.filter(p => p.present && p.away).length; // 離席中も数える
  $('presenceCount').textContent = _t('engine.presence', { n: here.length }) + (awayN ? _t('engine.presence.away', { n: awayN }) : '');
  $('rosterTitle2').textContent = _t('engine.roster.title');
  $('roster2').innerHTML = rosterHTML(); fillFaces($('roster2'));
  const st = STATUS[statusOf(ME)];
  $('meName').textContent = ME.name;
  for (const [l, q] of [['meStatusLabel', 'meStatusSq'], ['sheetStatusLabel', 'sheetStatusSq']]) { $(l).textContent = ME.away ? _t('engine.status.away') : st.label; $(q).className = 'sq ' + (ME.away ? 'off' : st.cls); }
  $('mePortraitSq').className = 'sq ' + (ME.away ? 'off' : st.cls);
  const focusOn = !ME.away && ME.focusEnd && statusOf(ME) === 'focus';
  $('meTimer').hidden = !focusOn; if (focusOn) $('meTimer').textContent = _t('engine.focusLeft', { t: mmss(ME.focusEnd - Date.now()) });
  $('meMemo').textContent = ME.memo || _t('engine.memo.empty');
  $('meMemo').classList.toggle('empty', !ME.memo);
  for (const id of ['awayBtn', 'awayBtn2']) $(id).textContent = _t(ME.away ? 'engine.away.back' : 'engine.away.btn');
  for (const id of ['decoBtn', 'decoBtn2']) $(id).disabled = !isHere(ME) || !isIsland(ME.room);
  const port = $('mePortrait'); port.querySelector('canvas')?.remove(); port.prepend(faceCanvas(ME));
  // 呼ばれている: カードに「〇〇さんが呼んでいます」(押すと声かけのトーストをまた出す)
  for (const id of ['callChip', 'callChip2']) { $(id).hidden = !pendingCall; if (pendingCall) $(id).textContent = _t('engine.call.chip', { name: pendingCall.fromName }); }
  // スマホの下のバーの四角: いまのステータスの色。押すと離席・戻る
  $('awaySqSq').className = 'sq ' + (ME.away ? 'off' : st.cls); $('awaySq').setAttribute('aria-label', _t(ME.away ? 'engine.away.back' : 'engine.away.do')); $('awaySqLabel').textContent = _t(ME.away ? 'engine.away.ret' : 'engine.away.btn');
  renderNotify();
  renderLog(); renderUnread();
}
// 「ちょっといい？」を確実に受け取るための案内: 入室中で通知を許可していなければ「呼ばれたら通知する」(ホームの通知のバナーと同じ購読)・「小窓で開く」・「あとで」を1行。
// 「あとで」を押したらその日は出さず、3回押したらもう出さない(「?」の案内カードの最後から有効にできる)。ブロック中の設定の手順もそこに書く
const NOTIFY_LATER = 'vo-notify-later', NOTIFY_LATER_N = 'vo-notify-later-n'; // 「あとで」を押した日(設定の時間帯)と回数
let notifyLaterDay = '', notifyLaterN = 0;
try { notifyLaterDay = localStorage.getItem(NOTIFY_LATER) || ''; notifyLaterN = Number(localStorage.getItem(NOTIFY_LATER_N)) || 0; } catch (e) { /* 覚えられなくても動く */ }
const todayKey = () => { const z = zoned(); return `${z.y}-${z.mo}-${z.d}`; };
const pushReady = () => !!config.enablePush && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
function renderNotify() {
  const perm = pushReady() ? Notification.permission : 'granted', show = ME.present && perm !== 'granted' && notifyLaterDay !== todayKey() && notifyLaterN < 3;
  for (const k of ['', '2']) {
    $('notifyRow' + k).hidden = !show;
    if (show) { $('notifyBtn' + k).hidden = perm === 'denied'; $('notifyOff' + k).hidden = perm !== 'denied'; } /* ブロック中は「あとで」だけだと何のことか分からないので */
  }
}
for (const k of ['', '2']) {
  $('notifyBtn' + k).title = _t('engine.notify.title');
  $('notifyBtn' + k).addEventListener('click', e => enableNotify(e.currentTarget));
  $('notifyLater' + k).addEventListener('click', () => { notifyLaterDay = todayKey(); notifyLaterN++; try { localStorage.setItem(NOTIFY_LATER, notifyLaterDay); localStorage.setItem(NOTIFY_LATER_N, String(notifyLaterN)); } catch (e) { /* この画面だけ閉じる */ } renderNotify(); });
}
// 通知の購読(自分のカードの「呼ばれたら通知する」と案内カードの「通知を有効にする」)
function enableNotify(b) {
  b.disabled = true;
  config.enablePush().then(() => showToast(`<span class="t">${_t('engine.notify.on')}</span>`, 4000), err => showToast(`<span class="t">${esc((err && err.message) || _t('engine.notify.fail'))}</span>`, 8000))
    .finally(() => { b.disabled = false; renderNotify(); });
}
// 名簿の行: カメラをその人に寄せて、人のカード(手を振る・ちょっといい？)を開く
function focusPerson(id) {
  const p = PEOPLE.find(x => x.id === id); if (!p) return;
  closePop(); if (isPhone()) openSheet(false);
  const pl = isHere(p) ? placeOf(p) : p.present ? placeOfSeat(p) : null;
  if (!pl) return;
  setFloor(floorOf(p.room)); // ほかの階の人なら、その階に切り替える
  centerOn(PX(pl.cx, pl.cy), PY(pl.cx, pl.cy, 20));
  const btn = ov.querySelector(`.who[data-person="${CSS.escape(id)}"]`);
  if (btn) openPersonCard(p, btn);
}
function refresh() { if (followMyFloor()) return; renderOverlay(); renderHUD(); layoutBubbles(); drawWorld(); if (mini) renderMiniHead(); } // 自分の階が変わったらsetFloorが描き直す

/* ---------- ポップオーバー ---------- */
const pop = $('pop');
// ひとことは打ち終わって0.8秒たったら送る(待っているあいだはポーリングで上書きしない)
let memoTimer = 0, memoWaiting = false;
function sendMemoSoon(text) {
  clearTimeout(memoTimer);
  if (!memoWaiting) { memoWaiting = true; pending++; }
  memoTimer = later(() => { memoWaiting = false; pending--; act({ type: 'memo', text }); }, 800);
}
let popFor = null;
function openPop(html, anchorRect, where, key, cls) {
  if (popFor === key && !pop.hidden) { closePop(); return null; }
  if (popChanged && !pop.hidden) closePop(); // 着替えを変えたまま机を飾るを開いたときも、閉じたのと同じに寄せる
  pop.className = 'pop win' + (cls ? ' ' + cls : '');
  pop.innerHTML = html; pop.hidden = false; popFor = key;
  pop.onclick = null; // 着替え・机を飾るの処理は開くたびにonclickで付け直す(addEventListenerだと開いた回数ぶん溜まってprofileを何回も送っていた)
  const place = () => {
    const vw = innerWidth, vh = innerHeight, w = pop.offsetWidth, h = pop.offsetHeight;
    if (where === 'center') { pop.style.left = Math.round(Math.max(8, (vw - w) / 2)) + 'px'; pop.style.top = Math.round(Math.max(8, (vh - h) / 2)) + 'px'; return; } // 押した物が無い(案内カード)ので画面の真ん中。anchorRectはnull
    let x = anchorRect.left + anchorRect.width / 2 - w / 2, y = where === 'below' ? anchorRect.bottom + 8 : anchorRect.top - h - 8;
    if (where === 'below-right') { x = anchorRect.right - w; y = anchorRect.bottom + 8; }
    if (y < 8) y = anchorRect.bottom + 8;
    x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(8, Math.min(vh - h - 8, y));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  };
  place(); requestAnimationFrame(place);
  pop.querySelector('.x')?.addEventListener('click', closePop);
  return pop;
}
// 着替え・机の飾りで何か変えたあとに閉じたら、自分に寄せて変わった姿と机を見せる(×2だとほぼ見えなかった)
let popChanged = false;
function closePop() { const k = popFor; pop.hidden = true; popFor = null; if (popChanged) { popChanged = false; if (k === 'dress' || k === 'deco') lookAtMe(); } }
// 1〜2段(×3〜×4。×4より上には寄せない)寄せて、自分を画面の真ん中へ。動きを減らす設定ならアニメなし
function lookAtMe() {
  const pl = myPlace(); if (!pl || pl.over) return;
  showMyFloor();
  const wx = PX(pl.cx, pl.cy), wy = PY(pl.cx, pl.cy, pl.z) - 8, ns = Math.min(4, Math.max(3, Math.floor(view.s) + 2));
  followMe = false; userCam = true; drag = null; // 地図を押して閉じたとき、その指のドラッグで寄せる前の位置に戻さない
  if (isPhone()) openSheet(false); // スマホはシートから開くので、シートを閉じて地図を見せる
  if (ns > view.s) { const p = pxToScreen(wx, wy); view.s = ns; view.x = wx - (innerWidth - p.x) / ns; view.y = wy - p.y / ns; applyScale(); } // 自分の位置を画面の同じ所に残して拡大
  if (reduceMotion) { panAnim++; centerOn(wx, wy); } else panTo(wx, wy);
}
on(document, 'keydown', e => { if (e.key === 'Escape') closePop(); });
on(document, 'pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-person],[data-act],#presenceBtn,#meStatusBtn,#sheetStatusBtn,#mePortrait,#meMemo,#dressBtn,#dressBtn2,#decoBtn,#decoBtn2,#emoteBtn,#emoteBtn2,#helpBtn,#menuBtn,#menuBtn2')) closePop(); });
for (const el of [pop, $('roster2')]) {
  el.addEventListener('click', e => { const li = e.target.closest('li[data-pid]'); if (li) focusPerson(li.dataset.pid); });
  el.addEventListener('keydown', e => { const li = e.target.closest('li[data-pid]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusPerson(li.dataset.pid); } });
}
for (const id of ['callChip', 'callChip2']) $(id).addEventListener('click', () => { if (isPhone()) openSheet(false); showCallToast(); });
$('awaySq').addEventListener('click', () => { const willAway = !ME.away; toggleAway(); showToast(`<span class="t">${_t(willAway ? 'engine.away.on' : 'engine.away.off')}</span>`, 3000); });
// はじめての案内(4枚)。入室したとき1回と「?」から。説明している物を黄色い枠で指して、ほかを暗くする
// [文言のキーの番号(engine.guide.N.title・lead・iM), 指す物のid, 箇条書きの数]
const GUIDE = [
  ['1', () => 'sayForm', 3],
  ['2', () => 'islandMeet', 3],
  ['3', () => (isPhone() ? 'sheetBtn' : 'hudMe'), 5],
  ['4', () => (isPhone() ? 'sheetBtn' : 'leaveBtn'), 3],
];
let guideAt = 0, guideWait = false, guideSpot = null;
function openGuide(i = 0) {
  const [g, target, nItems] = GUIDE[i], title = _t(`engine.guide.${g}.title`), lead = _t(`engine.guide.${g}.lead`), items = Array.from({ length: nItems }, (_, m) => _t(`engine.guide.${g}.i${m + 1}`, { h: config.workEndHour ?? 18 })), last = i === GUIDE.length - 1, r = $(target()).getBoundingClientRect();
  guideAt = i;
  if (!guideSpot) { guideSpot = document.createElement('div'); guideSpot.className = 'guide-spot'; guideSpot.setAttribute('aria-hidden', 'true'); pop.after(guideSpot); } // 出るのは案内が開いているあいだだけ(CSS)
  const x0 = Math.max(0, r.x - 7), y0 = Math.max(0, r.y - 7), a = new DOMRect(x0, y0, Math.min(innerWidth, r.right + 7) - x0, Math.min(innerHeight, r.bottom + 7) - y0); // 枠(3px)の内側が指す物から4px。画面の端の物(退出する)でも枠が切れないように画面内に収める
  Object.assign(guideSpot.style, { left: a.x + 'px', top: a.y + 'px', width: a.width + 'px', height: a.height + 'px' });
  guideSpot.hidden = !r.width; // 隠れている物(入室前)は指さずに真ん中
  // 最後のカードの下に通知の1行(まだ決めていない人は有効にするボタン、ブロックした人は戻し方。許可済み・使えないブラウザは出さない)
  const note = last && pushReady() ? { default: `<p class="note">${_t('engine.guide.notify')} <button class="pbtn sm go" data-notify>${_t('engine.notify.enable')}</button></p>`, denied: `<p class="note">${_t('engine.guide.denied')}</p>` }[Notification.permission] || '' : '';
  const html = `<div role="dialog" aria-label="${_t('engine.guide.aria', { title })}"><h3><span class="pg">${i + 1}/${GUIDE.length}</span><span class="pg">${title}</span><button class="x" aria-label="${_t('engine.close')}">×</button></h3><p class="lead">${lead}</p><ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>${note}<div class="acts">${i ? `<button class="pbtn" data-back>${_t('engine.back')}</button>` : ''}<button class="pbtn go" data-next>${_t(last ? 'engine.guide.start' : 'engine.next')}</button></div></div>`;
  if (popFor === 'guide') popFor = null; // めくるときは開き直す(同じkeyのままだとopenPopが閉じるトグルになる)
  if (!openPop(html, a, !r.width ? 'center' : a.top + a.height / 2 > innerHeight / 2 ? 'above' : 'below', 'guide', 'guide')) return;
  const back = pop.querySelector('[data-back]'), next = pop.querySelector('[data-next]');
  if (back) back.onclick = () => openGuide(i - 1);
  next.onclick = () => (last ? closePop() : openGuide(i + 1));
  const nb = pop.querySelector('[data-notify]'); if (nb) nb.onclick = () => enableNotify(nb);
  next.focus(); // Enterで続けてめくれる
}
// まだ見ていなければ、入室している状態になったとき1回だけ開く(入室前は指す物が隠れている)。覚えるのは出したとき
// 入室のトースト(#toast)はカードの［次へ］に重なるので消す。声かけの #callToastは残す
function guideOnEnter(ms) {
  if (preview) return;
  if (!guideWait || !ME.present) return;
  guideWait = false;
  later(() => { $('toast').hidden = true; openGuide(); try { localStorage.setItem('vo-guide', '1'); } catch (e) { /* 保存できなくても動く */ } }, ms);
}
// 「?」は案内カードを開く(開いていれば閉じる)。スマホはシートを閉じてから
$('helpBtn').addEventListener('click', () => (popFor === 'guide' && !pop.hidden ? closePop() : openGuide()));
$('helpBtn2').addEventListener('click', () => { openSheet(false); openGuide(); });
$('presenceBtn').addEventListener('click', e => { const p = openPop(`<h3>${_t('engine.roster.title')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3>${rosterHTML()}`, e.currentTarget.getBoundingClientRect(), 'below-right', 'presence', 'roster'); if (p) fillFaces(p); });
function openStatusMenu(anchor) {
  const fixed = !ME.away && statusReason(ME);
  const opts = ['work', 'focus', 'break', 'meet'].map(k => `<button class="pbtn" role="radio" aria-checked="${!fixed && ME.manual === k}" data-st="${k}" ${fixed ? 'disabled' : ''}><i class="sq ${STATUS[k].cls}"></i>${STATUS[k].label}</button>`).join('');
  const p = openPop(`<div class="stmenu"><h3>${_t('engine.status.title')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3><div class="opts" role="radiogroup" aria-label="${_t('engine.status.title')}">${opts}</div>${fixed ? `<p class="override">${esc(statusReason(ME))}</p>` : ''}<label for="memoIn">${_t('engine.memo.label')}</label><input id="memoIn" type="text" maxlength="40" placeholder="${_t('engine.memo.placeholder')}"><p class="note">${_t('engine.status.meetNote')}</p></div>`, anchor.getBoundingClientRect(), 'above', 'status');
  if (!p) return;
  const memo = p.querySelector('#memoIn'); memo.value = ME.memo || '';
  memo.addEventListener('input', () => { ME.memo = memo.value; renderHUD(); sendMemoSoon(memo.value); });
  p.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { setManual(b.dataset.st); p.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-checked', x === b)); });
}
// 集中にすると25分タイマーが始まる(ブースの代わり)。ほかにすると止まる
function setManual(k) {
  meetAutoAt = 0; meetAskUntil = 0; // 手で選んだら(会議中を選び直しても)Meetの自動の会議中は終わり
  const start = k === 'focus' && (ME.manual !== 'focus' || !ME.focusEnd);
  if (k === ME.manual && !start) return;
  act({ type: 'status', status: k, ...(start ? { focusMinutes: FOCUS_MS / 60000 } : {}) }, () => {
    if (start) { ME.focusEnd = Date.now() + FOCUS_MS; ME.focusDone = false; }
    if (k !== 'focus') ME.focusEnd = null;
    ME.manual = k; refresh();
  });
}
for (const id of ['meStatusBtn', 'sheetStatusBtn', 'mePortrait']) $(id).addEventListener('click', e => { if (isPhone() && id === 'mePortrait') return openSheet(true); if (!ME.present) return openDress(e.currentTarget); openStatusMenu(e.currentTarget); }); // 入室していなければ着替えだけ
$('mePortrait').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!ME.present) openDress(e.currentTarget); else openStatusMenu(e.currentTarget); } });
$('meMemo').addEventListener('click', () => { if (popFor !== 'status' || pop.hidden) openStatusMenu($('meStatusBtn')); pop.querySelector('#memoIn')?.focus(); }); // もう開いていれば閉じずに、ひとことの欄へ

// 「ちょっといい？」を送って返事を待っている相手(id → 送った時刻)。カードのボタンは「返事待ち…」で押せない。
// 返事(行く/あとで)が来るか、サーバーの連打よけの間隔(presence.tsのSEND_GAP_MS.callと同じ30秒)が過ぎたら戻す
const CALL_GAP_MS = 30e3, callWait = new Map();
function startCallWait(id) { const t = Date.now(); callWait.set(id, t); later(() => { if (callWait.get(id) === t) endCallWait(id); }, CALL_GAP_MS); }
function endCallWait(id) {
  if (!callWait.delete(id) || popFor !== 'p:' + id) return;
  const b = pop.querySelector('[data-do="call"]'); if (b) { b.disabled = false; b.textContent = _t('engine.call.label'); }
}
// 手を振る(カードと「振り返す」)。送った側にも短く出す
// 手を振った相手(id → 時刻)。その相手から2分以内に来た手は「振り返し」とみなし、振り返すボタンを付けない(往復が終わらなかった)
const WAVE_BACK_MS = 2 * 60e3, wavedAt = new Map();
function waveTo(p) {
  act({ type: 'wave', toUserId: p.id }, () => iconAt(p, HAND, 'wave')).then(st => {
    if (!st) return;
    wavedAt.set(p.id, Date.now());
    showToast(`<span class="t">${esc(_t('engine.wave.sent', { name: p.name }))}</span>`, 2000);
    SYS_LOG.push({ id: 'waved' + Date.now(), sys: true, createdAt: new Date().toISOString(), text: _t('engine.wave.sent', { name: p.name }) }); renderLog(); // 声かけの行と同じくログに残す
  });
}
function openPersonCard(p, anchor) {
  const stk = statusOf(p), st = STATUS[stk];
  const acts = p.me || !inOffice(ME) ? '' : `<div class="acts"><button class="pbtn" data-do="wave">${_t('engine.wave.btn')}</button>${callWait.has(p.id) ? `<button class="pbtn go" data-do="call" disabled>${_t('engine.call.waiting')}</button>` : `<button class="pbtn go" data-do="call">${_t('engine.call.label')}</button>`}</div>`;
  // 入室前・離席中はボタンが無いので、手を振るは案内しない
  const warn = (!p.me && stk === 'focus' ? `<p class="warn">${_t(acts ? 'engine.card.focusWave' : 'engine.card.focus')}</p>` : (!p.me && stk === 'meet' ? `<p class="warn">${_t('engine.card.meet')}</p>` : ''))
    + (!p.me && !acts ? `<p class="note">${_t(ME.present ? 'engine.card.noteBack' : 'engine.card.noteEnter')}</p>` : '');
  const memo = p.memo;
  const card = openPop(`<div class="pcard"><div class="row"><span class="fc"></span><div><div class="nm">${esc(p.me ? _t('engine.you.paren', { name: p.name }) : p.name)}</div><div class="st"><i class="sq ${p.away ? 'off' : st.cls}"></i>${p.away ? _t('engine.status.away') : st.label}${_t('engine.sep')}${esc(placeName(p))}</div></div><button class="x" aria-label="${_t('engine.close')}">×</button></div>${memo ? '<p class="memo"></p>' : ''}${warn}${acts}</div>`, anchor.getBoundingClientRect(), 'above', 'p:' + p.id);
  if (!card) return;
  card.querySelector('.fc').replaceWith(faceCanvas(p));
  if (memo) card.querySelector('.memo').textContent = memo;
  card.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
    closePop();
    if (b.dataset.do === 'wave') { waveTo(p); return; }
    // ちょっといい？: 相手の頭上に「!」。相手の返事(行く/あとで)は出来事(answer)で届き、トーストに出る
    act({ type: 'call', toUserId: p.id }, () => { say(p, '!', 2600, 'alert'); startCallWait(p.id); }, () => endCallWait(p.id)).then(st => { if (st) showToast(`<span class="t">${esc(_t('engine.call.sent', { name: p.name }))}</span>`, 3000); });
  });
}
// 席を移る: 同じ部屋ならそのまま、別の部屋ならすぐ移って「戻す」付きのトースト。入室していなければその席で入室する
function seatMe(target, o = {}) {
  if (!ME.present) { enterAt(target, o.msg); return; }
  // 移ると離席は解ける(サーバーも同じ)
  const prev = { room: ME.room, seat: ME.seat };
  const changed = ME.room !== target.room;
  if (!ME.away && !changed && prev.seat === (target.seat || null)) return;
  act({ type: 'move', room: target.room, seatId: target.seat || null }, () => {
    walkers = walkers.filter(w => !w.isMe);
    ME.away = false; ME.walking = false;
    ME.room = target.room; ME.seat = target.seat || null;
    if (isMeet(target.room) && changed) ME.joinT = ++joinSeq;
    ME.tgtKey = keyOf(ME);
    bubbles.filter(b => b.who === ME).forEach(dropBubble);
    if (changed) { unread = 0; MSGS = []; } // 移った先の部屋のチャットは応答で届く
    ME.overflow = false; // 自分で移ると「満席で自動」は外れる(サーバーも同じ)
    hoverSeat = null;
    refresh();
    ensureMeVisible();
    if (changed && !o.silent) {
      const where = _t('engine.move.to', { room: roomName(target.room, prev.room) });
      const t = showToast(`<span class="t">${o.msg || esc(where)}</span>${o.meetRoom ? talkBtn(o.meetRoom) : ''}<button class="pbtn" data-undo>${_t('engine.undo')}</button>`, o.meetRoom ? 10000 : 5000);
      if (o.meetRoom) bindMeet(t, o.meetRoom);
      t.querySelector('[data-undo]').onclick = () => {
        t.hidden = true;
        const back = isMeet(prev.room) ? { room: prev.room } : (!occupantOf(seatById(prev.seat)) && !reserved(seatById(prev.seat)) ? prev : nearestFree(prev.room));
        if (back) seatMe(back, { silent: true });
      };
    }
  });
}
function nearestFree(roomId, nearX, nearY) {
  if (isMeet(roomId)) return { room: roomId };
  // 自動で選ぶ席: 1席ぶんの机(desk)とひじかけ椅子(armchair)は選ばない(自分で押したときだけ。サーバーのpickSeatと同じ)
  const free = SEATS.filter(s => s.room === roomId && s.type !== 'desk' && s.type !== 'armchair' && openSeat(s));
  if (nearX != null) free.sort((a, b) => Math.hypot(a.cx - nearX, a.cy - nearY) - Math.hypot(b.cx - nearX, b.cy - nearY));
  return free.length ? { room: free[0].room, seat: free[0].id } : null;
}
// 重ねたときの1行は、そのときの残り時間で作り直す
ov.addEventListener('mouseover', e => { const b = e.target.closest('.who'); const p = b && PEOPLE.find(x => x.id === b.dataset.person); if (p) b.dataset.label = personLine(p); });
// 人(か名札)に重ねる・キーボードで選ぶと、絵の輪郭に沿って明るくし、間引いた名札も出す(.peek)
let hoverRaf = 0;
function setHover(id) {
  if (id === HOVER_PID) return;
  HOVER_PID = id;
  ov.querySelectorAll('.tag.peek').forEach(t => t.classList.remove('peek'));
  if (id) ov.querySelector(`.tag[data-person="${CSS.escape(id)}"]`)?.classList.add('peek');
  if (!hoverRaf) hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (!destroyed) drawWorld(); }); // 人の上を続けて通ったときは1コマに1回だけ描き直す
}
const hoverId = t => t?.closest?.('.who, .tag[data-person]')?.dataset.person || null;
ov.addEventListener('mouseover', e => setHover(hoverId(e.target)));
ov.addEventListener('mouseout', e => setHover(hoverId(e.relatedTarget)));
ov.addEventListener('focusin', e => setHover(hoverId(e.target)));
ov.addEventListener('focusout', e => setHover(hoverId(e.relatedTarget)));
ov.addEventListener('click', e => {
  const t = e.target;
  const who = t.closest('.who, .tag[data-person]');
  if (who) { openPersonCard(PEOPLE.find(p => p.id === who.dataset.person), who); return; }
  const item = t.closest('[data-item]');
  if (item) { config.onItemClick?.({ ...FL[FLOOR].fm.items.find(i => i.id === item.dataset.item), floor: FLOOR }); return; }
  const seat = t.closest('.seat');
  if (seat) { const st = seatById(seat.dataset.seat); seatMe({ room: st.room, seat: st.id }); return; }
  const join = t.closest('[data-join]');
  if (join) { const id = join.dataset.join; seatMe({ room: id }, MEET_URLS[id] ? { meetRoom: id } : {}); return; } // 会議室のMeetがあればトーストに「Meetを開く」
  const meet = t.closest('[data-meet]');
  if (meet) { openMeet(meet.dataset.meet); return; }
});
function httpUrl(u) { try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; } }
function openMeet(roomId) {
  roomId = logicalRoom(roomId);
  const url = MEET_URLS[roomId];
  if (url) {
    window.open(url, '_blank', 'noopener');
    // Meetに入ったことをほかの人にも見せる: 会議中にする(部屋でもう決まっているとき・離席中はそのまま)
    if (inOffice(ME) && !statusReason(ME) && ME.manual !== 'meet') { setManual('meet'); meetAutoAt = Date.now(); showToast(`<span class="t">${_t('engine.meet.status')}</span>`, 3000); }
    return;
  }
  showToast(`<span class="t">${_t('engine.meet.none')}</span>`, 6000);
}
// Meetを開いて会議中にした時刻(手で選んだ会議中では0のまま。手でステータスを選ぶと0)。
// このタブ(か小窓)に戻ってきたら「会議おわった？」、それでも戻さなければ60分で作業中に戻す(集中の25分と同じくページが開いている間だけ)
const MEET_AUTO_MS = 60 * 60e3;
// 会議の途中で覗きに戻るたびに聞かないよう、開いてから5分は聞かず、1回聞いたら15分あける
const MEET_ASK_AFTER_MS = 5 * 60e3, MEET_ASK_GAP_MS = 15 * 60e3;
let meetAutoAt = 0, meetLeft = false, meetAskUntil = 0, meetAskedAt = 0;
const meetLive = () => { if (meetAutoAt && (!ME.present || ME.manual !== 'meet')) meetAutoAt = 0; return !!meetAutoAt; }; // ほかの端末で変えた・退出したら外す
const leftForMeet = () => { if (meetAutoAt) meetLeft = true; };
function askMeetDone() {
  if (!meetLeft) return;
  meetLeft = false;
  if (!meetLive() || Date.now() - meetAutoAt < MEET_ASK_AFTER_MS || Date.now() - meetAskedAt < MEET_ASK_GAP_MS) return;
  meetAskedAt = Date.now();
  meetAskUntil = Date.now() + 20000; later(() => { if (mini) renderMiniHead(); }, 20100);
  const t = showToast(`<span class="t">${_t('engine.meet.ask')}</span><button class="pbtn go" data-meet-done>${_t('engine.meet.back')}</button>`, 20000);
  t.querySelector('[data-meet-done]').onclick = meetDone;
  if (mini) renderMiniHead();
}
function meetDone() { const t = $('toast'); if (t.querySelector('[data-meet-done]')) t.hidden = true; setManual('work'); }
function checkMeetAuto() {
  if (!meetLive() || Date.now() - meetAutoAt < MEET_AUTO_MS) return;
  setManual('work');
  showToast(`<span class="t">${_t('engine.meet.auto')}</span>`, 8000);
}
on(window, 'blur', leftForMeet);
on(window, 'focus', askMeetDone);
on(document, 'visibilitychange', () => (document.hidden ? leftForMeet() : askMeetDone()));
/* ---------- メニュー(config.menu)。HUDのボタンから開く ---------- */
function openMenu() {
  const anchor = isPhone() ? $('sheetBtn') : $('menuBtn'), where = isPhone() ? 'above' : 'below-right';
  const p = openPop(`<h3>${_t('engine.hud.menu')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3><div class="acts"></div>`, anchor.getBoundingClientRect(), where, 'menu', 'menu');
  if (p) p.querySelector('.acts').append(...menuEls(config.menu, closePop));
}
$('menuBtn').addEventListener('click', openMenu);
$('menuBtn2').addEventListener('click', () => { openSheet(false); openMenu(); });
$('menuBtn').hidden = $('menuBtn2').hidden = !config.menu?.length;
$('brandName').textContent = config.appName || '';

// 離席/復帰: 押した瞬間にHUD・在席数・机の札を変える。席は座ったまま(エレベーターへ歩くのは退出だけ)
function toggleAway() {
  if (!ME.present) return;
  if (ME.away) { act({ type: 'away', away: false }, () => { walkers = walkers.filter(w => !w.isMe); ME.away = false; ME.tgtKey = keyOf(ME); refresh(); }); return; }
  act({ type: 'away', away: true }, () => { walkers = walkers.filter(w => !w.isMe); ME.away = true; ME.walking = false; ME.tgtKey = keyOf(ME); refresh(); }); // 退出ではないので歩いて出ない。座ったまま机に札
}
// 入室: 押したら送り、席は応答で決まる(歩いて入ってくるのはapplyState)。会議室を選んだときは入室してから移る
let entering = false;
function enterAt(target, msg) { // msg: 座ったときのトーストの文言(「行く」で入室したとき)
  if (ME.present || entering) return;
  entering = true; $('enterBtn').disabled = true;
  const auto = pickSeat && !(target && target.seat);
  act({ type: 'enter', ...(target && target.seat ? { seatId: target.seat } : {}) }).then(st => { // おまかせの席はサーバーのpickSeatが決める
    entering = false; $('enterBtn').disabled = false;
    if (!st || !ME.present) return;
    const greetSeated = () => { if (!ME.present) return; if (ME.walking) later(greetSeated, 300); else showGreet(); }; // あいさつは歩いて席に着いてから(動きを減らす設定は歩かないのですぐ)
    greetSeated();
    const meet = target && isMeet(target.room);
    if (meet) seatMe({ room: target.room }, { silent: true });
    // 島が満席でほかの場所に回したときは、サーバーのお知らせ(notice)が代わりに出ている
    const meetUrl = meet && MEET_URLS[target.room]; // 会議室のMeetがあれば「Meetを開く」
    if (meet || !ME.overflow) { const t = showToast(`<span class="t">${msg || (meet ? _t('engine.enter.meet') : esc(_t('engine.enter.seated', { room: roomName(ME.room, null) })))}${auto ? _t('engine.enter.moveHint') : ''}</span>${meetUrl ? MEET_BTN : ''}`, msg || meetUrl ? 10000 : auto ? 5000 : 3000); if (meetUrl) bindMeet(t, target.room); }
    if (meet || reduceMotion) frameMe(); // 歩いて入るときは、歩き終わってから寄せる(stopAtMe)
  });
}
// 退出: エレベーターへ歩いて出る。10秒「戻す」を出す
function leaveOffice() {
  if (!ME.present) return;
  showMe(); // 歩いて出ていく自分が見えるように
  const prev = { room: ME.room, seat: ME.seat, memo: ME.memo };
  act({ type: 'leave' }, () => {
    const pl = isHere(ME) ? placeOf(ME) : null, fl = floorOf(ME.room);
    walkers = walkers.filter(w => !w.isMe);
    bubbles.filter(b => b.who === ME).forEach(dropBubble);
    ME.present = false; ME.away = false; ME.walking = false; ME.room = null; ME.seat = null; ME.tgtKey = '';
    MSGS = []; unread = 0;
    if (pl && !pl.over) { const w = addWalker(ME, 'out', { x: pl.cx, y: pl.cy, fl }, null); if (w) say(w.look, _t('engine.say.byeMe'), 3000); }
    closePop(); refresh();
  }).then(st => {
    if (!st) return;
    const t = showToast(`<span class="t">${_t('engine.leave.done')}</span><button class="pbtn" data-undo>${_t('engine.undo')}</button>`, 10000);
    t.querySelector('[data-undo]').onclick = () => { t.hidden = true; undoLeave(prev); };
  });
}
// 退出の取り消し: 同じ席に入り直し(埋まっていたら空いている席)、ひとことも送り直す(サーバーは退出でひとことを消す)。歩いて入り直さない
function undoLeave(prev) {
  const st = prev.seat && seatById(prev.seat), free = st && !occupantOf(st) && !awayAt(st) && !reserved(st);
  instantMe = true;
  act({ type: 'enter', ...(free ? { seatId: prev.seat } : {}) }).then(s => {
    if (!s) { instantMe = false; return; }
    ensureMeVisible();
    if (isMeet(prev.room)) seatMe({ room: prev.room }, { silent: true });
    if (prev.memo) act({ type: 'memo', text: prev.memo }, () => { ME.memo = prev.memo; renderHUD(); });
  });
}
for (const id of ['leaveBtn', 'leaveBtn2']) $(id).addEventListener('click', leaveOffice);
// 入室する: 毎回、まず空いている島の席を緑にして選んでもらう(このボタンは「おまかせで座る」になる。フリーアドレス)
$('enterBtn').addEventListener('click', () => { if (pickSeat) enterAt(null); else { pickSeat = true; userCam = false; initialView(); refresh(); } }); // 空いている席に×2で寄せる
for (const id of ['awayBtn', 'awayBtn2']) $(id).addEventListener('click', toggleAway);
$('islandMeet').addEventListener('click', () => openMeet(myRoomId()));
// 入力欄: Enterで送る・Shift+Enterで改行(5行まで。変換中のEnterは送らない)。1〜3行に伸び、残り50字を切ったら字数
const sayIn = $('sayInput');
// 行数はサーバー(presence.tsのkeepLines)と同じ数え方: 各行の前後の空白を落とし、先頭・末尾の空行を落とし、空行の連続は1つ
const sayLines = v => v.replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[^\S\n]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n').length;
function fitSay() {
  sayIn.style.height = 'auto'; sayIn.style.height = sayIn.scrollHeight + 2 + 'px'; // 2 = 上下の枠。3行より上はCSSのmax-heightで中をスクロール
  const n = sayIn.value.length; $('sayCnt').hidden = n <= 150; $('sayCnt').textContent = `${n}/200`; $('sayCnt').classList.toggle('w', n > 180);
}
// @の候補: 同じ部屋の人(自分以外・入室中)。↑↓で選び、Enterか押すと「@名字 」が入る。Escで閉じる
let atList = [], atSel = 0;
function closeAt() { atList = []; $('atPop').hidden = true; sayIn.removeAttribute('aria-activedescendant'); }
function showAt() {
  const q = sayIn.value.slice(0, sayIn.selectionStart).match(/(?:^|\s)@([^\s@]*)$/); // @が行頭か空白の後のときだけ(メールアドレスやURLの@では出さない)
  atList = q ? PEOPLE.filter(p => sameRoom(p) && p.name.replace(/[ 　]/g, '').includes(q[1])).slice(0, 8) : [];
  if (!atList.length) { closeAt(); return; }
  atSel = Math.min(atSel, atList.length - 1);
  $('atPop').innerHTML = `<h4>${_t('engine.at.label')}</h4>` + atList.map((p, i) => `<div role="option" id="atOpt${i}" aria-selected="${i === atSel}" data-at="${i}"><img class="face px" src="${faceURL(p)}" alt="">${esc(p.name)}</div>`).join('');
  $('atPop').hidden = false; sayIn.setAttribute('aria-activedescendant', 'atOpt' + atSel);
}
function pickAt(p) {
  const c = sayIn.selectionStart, head = sayIn.value.slice(0, c).replace(/@[^\s@]*$/, ''), label = tagName(p), at = head.length + label.length + 2;
  sayIn.value = `${head}@${label} ${sayIn.value.slice(c)}`; sayIn.setSelectionRange(at, at);
  atPicked.push({ id: p.id, label }); closeAt(); fitSay(); sayIn.focus();
}
$('atPop').addEventListener('mousedown', e => { e.preventDefault(); const o = e.target.closest('[data-at]'); if (o) pickAt(atList[o.dataset.at]); }); // 押しても入力欄のフォーカスを外さない
sayIn.addEventListener('input', () => { atSel = 0; fitSay(); showAt(); });
sayIn.addEventListener('blur', closeAt);
sayIn.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (atList.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') closeAt(); else if (e.key === 'Enter') pickAt(atList[atSel]); else { atSel = (atSel + (e.key === 'ArrowDown' ? 1 : atList.length - 1)) % atList.length; showAt(); }
    return;
  }
  if (e.key !== 'Enter') return;
  if (!e.shiftKey) { e.preventDefault(); $('sayForm').requestSubmit(); } else if (sayLines(sayIn.value) >= 5) e.preventDefault(); // 改行は5行まで(サーバーも弾く)
});
$('sayForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = sayIn.value.trim();
  if (!v || !ME.present) return;
  if (sayLines(v) > 5) { showToast(`<span class="t">${_t('engine.say.lines')}</span>`); return; }
  const picked = atPicked, mentions = [...new Set(picked.filter(x => new RegExp(`@${reEsc(x.label)}(?=\\s|$)`).test(v)).map(x => x.id))]; // 本文に残っている名指しだけ(表示のチップと同じく後ろが空白か末尾)
  sayIn.value = ''; atPicked = []; closeAt(); fitSay();
  postChat(v, mentions, picked);
});
sayIn.addEventListener('focus', () => { if (unread) markRead(); });
// ログの開閉は端末に覚える(vo-log-open)。開いたら既読にして、前に読んだ所の下に「ここから未読」
function setLogOpen(o, boot) {
  $('hudLog').classList.toggle('open', o); $('logHead').setAttribute('aria-expanded', o); $('logHead').textContent = o ? '▼' : '▲';
  if (boot) return;
  try { localStorage.setItem('vo-log-open', o ? '1' : '0'); } catch (e) { /* 覚えられなくても動く */ }
  if (!o) return;
  unrAfter = readId; markRead(); renderLog(true);
  const ol = $('logList'), u = ol.querySelector('.unr'); if (u) ol.scrollTop = Math.min(ol.scrollTop, u.offsetTop - 4); // 未読が多ければリボンを上に
}
$('logHeadRow').addEventListener('click', e => { if (!e.target.closest('.meetbtn')) setLogOpen(!$('hudLog').classList.contains('open')); }); // ▲と見出しの空いた所
try { if (localStorage.getItem('vo-log-open') === '1') setLogOpen(true, true); } catch (e) { /* 読めなければ閉じたまま */ }
for (const id of ['logList', 'logList2']) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('[data-log-meet], [data-react], [data-unchat]'), m = b && MSGS.find(x => x.id === b.closest('li').dataset.mid);
    if (!b) return;
    if (b.dataset.logMeet) openMeet(b.dataset.logMeet); // 返事の行の「Meetを開く」
    else if (m && b.dataset.react) react(m, b.dataset.react);
    else if (m) unchat(m);
  });
  $(id).addEventListener('scroll', e => { const ol = e.currentTarget; if (newBelow && ol.scrollHeight - ol.scrollTop - ol.clientHeight < 8) { newBelow = false; ol.querySelector('.nx')?.remove(); } }); // 下まで見たら▼を消す
}
// 入室した直後に1回だけ、入力欄の上に「「おはようございます」と言う」(11時から「お疲れさまです」)。押すと送って消える。×か60秒で消える
let greetTimer = 0;
function showGreet() {
  const g = greeting();
  $('greetBtn').textContent = _t('engine.greet.btn', { g }); $('greetBtn').dataset.say = g; $('greet').hidden = false;
  clearTimeout(greetTimer); greetTimer = later(() => { $('greet').hidden = true; }, 60000);
}
$('greetBtn').addEventListener('click', e => { $('greet').hidden = true; postChat(e.currentTarget.dataset.say); });
$('greetX').addEventListener('click', () => { $('greet').hidden = true; });
function openSheet(o) {
  const open = o ?? !$('hudSheet').classList.contains('open');
  $('hudSheet').classList.toggle('open', open);
  $('sheetBtn').setAttribute('aria-expanded', open); $('sheetIcon').textContent = open ? '×' : '≡';
  if (open) { unrAfter = readId; markRead(); renderLog(true); }
}
$('sheetBtn').addEventListener('click', () => openSheet());
function toggleFS() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => showToast(`<span>${_t('engine.fs.fail')}</span>`)); }
$('fsBtn').addEventListener('click', toggleFS); $('fsBtn2').addEventListener('click', toggleFS);
on(document, 'fullscreenchange', () => { const t = _t(document.fullscreenElement ? 'engine.fs.exit' : 'engine.hud.fs'); $('fsBtn').textContent = t; $('fsBtn2').textContent = t; });
let toastTimer = 0;
function showToast(html, ms) {
  const t = $('toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = later(() => { t.hidden = true; }, ms || 2600);
  return t;
}

/* ---------- 着替え(パソコンも)・机の飾り ---------- */
const PC_KINDS = [['mac', 'MacBook'], ['win', 'Windows']];
const KEYBOARD_KINDS = [['none', 'engine.kb.none'], ['colorful', 'engine.kb.colorful'], ['dark', 'engine.kb.dark'], ['split', 'engine.kb.split']];
// きせかえの項目: [lookのキー(見出しはengine.dress.キー), 一覧, 見本(face=顔bust=胸から上 なし=色の四角)]
const DRESS = [['hair', HAIRS, 'face'], ['hc', HAIR_COLS], ['sk', SKINS], ['ot', OUTFITS, 'bust'], ['cl', CLOTHES], ['pt', PANTS], ['ac', ACCS, 'face']];
const optLabel = v => _t(typeof v[1] === 'string' ? v[1] : v[3]); // 形は [記号, ラベル, ...]、色は [記号, 置き換え, 見本の色, ラベル]
const curOpt = (k, list) => (isHex(ME[k]) ? null : list.find(v => v[0] === ME[k]) || list[0]);
const curLabel = (k, list) => (isHex(ME[k]) ? ME[k] : optLabel(curOpt(k, list)));
// 好きな色(髪・服・ズボン)の見本。今の色が選択肢ならその色から始める
const PICK = { hc: HAIR_COLS, cl: CLOTHES, pt: PANTS };
const pickValue = k => (isHex(ME[k]) ? ME[k] : curOpt(k, PICK[k])[2]);
const PART_KIND = { hair: 'hair', ot: 'ot', ac: 'ac' };
function dressIcon(k, v, kind) { // 今の自分にその選択肢を当てた見本(髪型は小物を外して見せる)
  const look = Object.assign(lookOf(ME), { [k]: v }, k === 'hair' ? { ac: 'none' } : null);
  if (kind === 'bust') {
    const c = spriteCanvas(24, 32, bodyStamps(look), '#ccd8e2');
    c.classList.add('bodyopt');
    return c;
  }
  const c = spriteCanvas(24, 24, dressHeadStamps(look), '#ccd8e2');
  c.classList.add('faceopt');
  return c;
}
function openDress(anchor) {
  const shared = k => { // みんなのパーツ(描いた人の名前をtitleに)と、描くページへのリンク
    if (!PART_KIND[k]) return '';
    const mine = PARTS.filter(x => x.kind === k);
    return `<div class="grp sub"><b>${esc(_t('parts.dress.shared'))}</b><div class="sw ic">${mine.map(x => `<button data-k="${k}" data-v="u:${esc(x.id)}" aria-pressed="${ME[k] === 'u:' + x.id}" aria-label="${esc(x.name)}" title="${esc(x.name)}${x.createdByName ? ' / ' + esc(x.createdByName) : ''}"><i></i>${esc(x.name)}</button>`).join('')}</div><a class="draw" href="/parts/new?kind=${k}">${esc(_t('parts.dress.draw'))}</a></div>`;
  };
  const grp = ([k, list, kind]) => { const title = _t('engine.dress.' + k); return `<div class="grp"><b>${title}<span data-cur="${k}">${esc(curLabel(k, list))}</span></b><div class="sw${kind ? ' ic' : ''}">${list.map(v => `<button data-k="${k}" data-v="${v[0]}" aria-pressed="${v === curOpt(k, list)}" aria-label="${title} ${optLabel(v)}" title="${optLabel(v)}"${kind ? `><i></i>${optLabel(v)}` : ` style="background:${v[2]}">`}</button>`).join('')}${PICK[k] ? `<input type="color" class="pick" data-kc="${k}" value="${pickValue(k)}" aria-label="${title} ${esc(_t('parts.dress.color'))}" title="${esc(_t('parts.dress.color'))}">` : ''}</div></div>${shared(k)}`; };
  const html = `<div class="top"><h3>${_t('engine.hud.dress')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3><div class="pv"><span class="bodypv"></span><span class="facepv"></span><div class="preview-direction" role="group" aria-label="${_t('engine.dress.dir')}"><button type="button" class="pbtn sm" data-preview="front" aria-pressed="true">${_t('engine.dress.front')}</button><button type="button" class="pbtn sm" data-preview="back" aria-pressed="false">${_t('engine.dress.back')}</button></div></div></div>`
    + DRESS.map(grp).join('')
    + `<div class="grp"><b>${_t('engine.pc.title')}</b><div class="sw pcsw">${PC_KINDS.map(([k, label]) => `<button data-pc="${k}" aria-pressed="${ME.pc === k}"><span data-pcic="${k}"></span>${label}</button>`).join('')}</div>`
    + `<div class="sw pcsw">${[0, 1, 2].map(n => `<button data-mon="${n}" aria-pressed="${(ME.mon || 0) === n}" aria-label="${_t(n ? 'engine.pc.monN' : 'engine.pc.monNone', { n })}">${n ? `<span data-pcic="mon${n}"></span>` : ''}${_t(n ? 'engine.pc.mon' : 'engine.pc.laptop', { n })}</button>`).join('')}</div><p class="note">${_t('engine.pc.note')}</p></div>`
    + `<div class="grp"><b>${_t('engine.kb.title')}</b><div class="sw pcsw">${KEYBOARD_KINDS.map(([k, label]) => `<button data-keyboard="${k}" aria-pressed="${(ME.keyboard || 'none') === k}">${k === 'none' ? '' : `<span data-pcic="${k}"></span>`}${_t(label)}</button>`).join('')}</div></div>`;
  const p = openPop(html, anchor.getBoundingClientRect(), 'above', 'dress', 'dress');
  if (!p) return;
  p.querySelectorAll('[data-pcic]').forEach(s => s.replaceWith(iconCanvas(PC_ICONS[s.dataset.pcic])));
  let previewBack = false;
  const paintPreviews = () => {
    const direction = _t(previewBack ? 'engine.dress.back' : 'engine.dress.front');
    const body = bodyCanvas(ME, previewBack); body.setAttribute('role', 'img'); body.setAttribute('aria-label', _t('engine.dress.bodyPv', { dir: direction })); p.querySelector('.bodypv').replaceChildren(body);
    const f = dressFaceCanvas(ME, previewBack); f.setAttribute('role', 'img'); f.setAttribute('aria-label', _t('engine.dress.facePv', { dir: direction })); p.querySelector('.facepv').replaceChildren(f);
    p.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.preview === 'back') === previewBack)));
  };
  const paint = () => {
    paintPreviews();
    for (const b of p.querySelectorAll('.sw.ic button')) b.firstElementChild.replaceWith(dressIcon(b.dataset.k, b.dataset.v, DRESS.find(d => d[0] === b.dataset.k)[2]));
  };
  const syncDresser = () => {
    for (const [k, list] of DRESS) {
      const label = p.querySelector(`[data-cur="${k}"]`);
      if (label) label.textContent = curLabel(k, list);
      const pick = p.querySelector(`[data-kc="${k}"]`);
      if (pick) pick.value = pickValue(k);
      p.querySelectorAll(`[data-k="${k}"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ME[k] ? 'true' : 'false'));
    }
    p.querySelectorAll('[data-pc]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pc === ME.pc ? 'true' : 'false'));
    p.querySelectorAll('[data-mon]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.mon === (ME.mon || 0) ? 'true' : 'false'));
    p.querySelectorAll('[data-keyboard]').forEach(b => b.setAttribute('aria-pressed', b.dataset.keyboard === (ME.keyboard || 'none') ? 'true' : 'false'));
    paint();
  };
  paint();
  // 好きな色: 選び終わったとき(change)に送る
  p.onchange = e => {
    const kc = e.target.dataset?.kc; if (!kc || !isHex(e.target.value)) return;
    const look = Object.assign(lookOf(ME), { [kc]: e.target.value });
    act({ type: 'profile', look }, () => { Object.assign(ME, look); ME.map = mkMap(ME); popChanged = true; syncDresser(); renderHUD(); drawWorld(); }, syncDresser);
  };
  p.onclick = e => {
    const preview = e.target.closest('[data-preview]');
    if (preview) { previewBack = preview.dataset.preview === 'back'; paintPreviews(); return; }
    const pb = e.target.closest('[data-pc],[data-mon],[data-keyboard]');
    if (pb) { // パソコンと外部モニターは自分の机にすぐ出る
      const key = pb.dataset.pc ? 'data-pc' : pb.dataset.mon !== undefined ? 'data-mon' : 'data-keyboard';
      // lookも一緒に送る(サーバーはプロフィールの行がまだ無い人のlookを作るので。2026-10-25時点でlookなしだと500)
      const field = pb.dataset.pc ? { pc: pb.dataset.pc } : pb.dataset.mon !== undefined ? { mon: +pb.dataset.mon } : { keyboard: pb.dataset.keyboard };
      act({ type: 'profile', look: lookOf(ME), ...field }, () => {
        Object.assign(ME, field);
        p.querySelectorAll(`[${key}]`).forEach(x => x.setAttribute('aria-pressed', x === pb));
        popChanged = true; drawWorld();
      }, syncDresser);
      return;
    }
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, look = Object.assign(lookOf(ME), { [k]: b.dataset.v });
    act({ type: 'profile', look }, () => {
      Object.assign(ME, look); ME.map = mkMap(ME);
      popChanged = true; syncDresser(); renderHUD(); drawWorld();
    }, syncDresser);
  };
}
for (const id of ['dressBtn', 'dressBtn2']) $(id).addEventListener('click', e => openDress(e.currentTarget));
function openDeco(anchor) {
  const p = openPop(`<div class="deco"><h3>${_t('engine.hud.deco')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3><div class="sw">${DECOS.map(([k, label]) => `<button data-deco="${k}" aria-pressed="${ME.deco === k}"><span data-ic="${k}"></span>${_t(label)}</button>`).join('')}<button data-deco="" aria-pressed="${!ME.deco}">${_t('engine.deco.none')}</button></div><p class="note">${_t('engine.deco.note')}</p></div>`, anchor.getBoundingClientRect(), 'above', 'deco', 'decopop');
  if (!p) return;
  p.querySelectorAll('[data-ic]').forEach(s => s.replaceWith(decoIcon(s.dataset.ic)));
  p.querySelector('.sw [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }); // 低い画面で一覧がスクロールするとき、選んでいる物を見える所に
  p.onclick = e => { const b = e.target.closest('[data-deco]'); if (!b) return; act({ type: 'profile', look: lookOf(ME), deco: b.dataset.deco || null }, () => { ME.deco = b.dataset.deco || null; p.querySelectorAll('[data-deco]').forEach(x => x.setAttribute('aria-pressed', x === b)); popChanged = true; drawWorld(); }); };
}
for (const id of ['decoBtn', 'decoBtn2']) $(id).addEventListener('click', e => openDeco(e.currentTarget));
// エモーション: 10種の格子。押すとすぐ自分が動いて送る(押しても閉じないので続けて押せる)
function openEmote(anchor) {
  if (isPhone()) { openSheet(false); anchor = $('sheetBtn'); } // スマホはシートを閉じて、自分が動くのを見せる
  const p = openPop(`<div class="emote"><h3>${_t('engine.hud.emote')}<button class="x" aria-label="${_t('engine.close')}">×</button></h3><div class="sw">${EMOTES.map(([k, label]) => `<button data-emote="${k}"><span data-ic="${k}"></span>${_t(label)}</button>`).join('')}</div><p class="note">${_t('engine.emote.note')}</p></div>`, anchor.getBoundingClientRect(), 'above', 'emote', 'emotepop');
  if (p) p.querySelectorAll('[data-ic]').forEach(s => s.replaceWith(iconCanvas(EMOTE_ICON[s.dataset.ic])));
}
for (const id of ['emoteBtn', 'emoteBtn2']) $(id).addEventListener('click', e => openEmote(e.currentTarget));
// 押したときの処理はpopに1回だけ付ける(開くたびに足すと、開いた回数ぶん送る)。連打は1.1秒あける(サーバーは1秒で429。届くまでの揺れで429にならないよう少し長め)
let emoteAt = 0;
pop.addEventListener('click', e => {
  const b = e.target.closest('[data-emote]');
  if (!b || !ME.present || Date.now() - emoteAt < 1100) return;
  emoteAt = Date.now(); showMe(); startEmote(ME, b.dataset.emote);
  // actは使わない: 失敗時のrestoreMeが歩いている自分を消す。エモーションは自分の状態を変えないので戻す物がない
  config.send({ type: 'emote', emote: b.dataset.emote }).then(st => { if (!destroyed) applyState(st, true); }, err => { if (!destroyed) showToast(`<span class="t">${esc((err && err.message) || _t('engine.err.comm'))}</span>`, 4000); });
});

/* ---------- 「ちょっといい？」を受けたとき(出来事 call) ----------
   返事する(行く/あとで)まで消さない: 上の別の枠のトースト(×で閉じても呼ばれたまま)・カードのチップ・呼んだ人の頭上の「!」・タブ名の (!)・ログの1行 */
// トーストの顔と名前: 押すとその人に寄せる(ほかの階の人ならその階に切り替える。名簿の行と同じ)
function faceLink(t, p) { for (const el of t.querySelectorAll('canvas, .t b')) { el.classList.add('plink'); el.title = _t('engine.show', { name: p.name }); el.onclick = () => focusPerson(p.id); } }
function incomingCall(e) {
  pendingCall = e;
  if (!SYS_LOG.some(x => x.id === 'call' + e.id)) SYS_LOG.push({ id: 'call' + e.id, sys: true, createdAt: e.createdAt, text: _t('engine.call.log', { name: e.fromName }) });
  showCallToast();
  refresh();
}
function showCallToast() {
  const e = pendingCall, t = $('callToast');
  if (!e) { t.hidden = true; return; }
  const from = personOf(e.fromUserId, e.fromName);
  t.innerHTML = `<canvas></canvas><span class="t">${_t('engine.call.in', { name: esc(from.name) })}</span><button class="pbtn go" data-go>${_t('engine.call.go')}</button><button class="pbtn" data-later>${_t('engine.hud.later')}</button><button class="x" data-close aria-label="${_t('engine.call.close')}">×</button>`;
  t.querySelector('canvas').replaceWith(faceCanvas(from)); faceLink(t, from);
  t.querySelector('[data-go]').onclick = () => answerCall(e, true);
  t.querySelector('[data-later]').onclick = () => answerCall(e, false);
  t.querySelector('[data-close]').onclick = () => { t.hidden = true; };
  t.hidden = false;
}
function answerCall(e, go) {
  const from = personOf(e.fromUserId, e.fromName);
  const done = () => { if (pendingCall && pendingCall.id === e.id) pendingCall = null; $('callToast').hidden = true; refresh(); };
  // 返事は呼んだ人へのトーストで届く(部屋のチャットには書かない)。声かけがもう無い(404)・返事済み(409)なら呼ばれていない扱いに戻す
  act({ type: 'answer', callId: e.id, answer: go ? 'go' : 'later' }, null, err => { if (err && (err.status === 404 || err.status === 409)) done(); }).then(st => {
    if (!st) return;
    SYS_LOG.push({ id: 'ansme' + e.id, sys: true, createdAt: new Date().toISOString(), text: _t('engine.ans.logMe', { said: _t(go ? 'engine.ans.go' : 'engine.ans.later') }) }); // 呼んだ側の「〇〇さんから『いま行きます』」と同じくログに残す(doneのrefreshで出る)
    done();
    if (!go) { showToast(`<span class="t">${esc(_t('engine.ans.laterSent', { name: from.name }))}</span>`, 3200); return; }
    goTo(from);
    if (ME.manual === 'focus') setManual('work'); // 話しに行くので集中を終える(タイマーも止まる)。移動の後に送る(先に送ると応答で一瞬もとの席に戻る)
  });
}
// 「行く」のあとに話す手段: 部屋のMeetが設定してあれば「Meetを開く」(別タブ)。無ければ「チャットで話す」
// (2人とも新しいMeetを開くと別々の会議になるので出さない。同じ部屋になっていればそのまま部屋のチャットで話せる)
const MEET_BTN = `<button class="pbtn go" data-meet-open>${_t('engine.meet.open')}</button>`;
const talkBtn = roomId => (MEET_URLS[logicalRoom(roomId)] ? MEET_BTN : `<button class="pbtn go" data-talk>${_t('engine.talk.chat')}</button>`);
function bindMeet(t, roomId) {
  const b = t.querySelector('[data-meet-open]'); if (b) b.onclick = () => { t.hidden = true; openMeet(roomId); };
  const c = t.querySelector('[data-talk]'); if (c) c.onclick = () => { t.hidden = true; if (isPhone()) openSheet(true); $('sayInput').focus(); }; // スマホはシートのチャットを開く
}
function goTo(person) {
  if (!person.present) { showToast(`<span class="t">${esc(_t('engine.go.absent', { name: person.name }))}</span>`); return; }
  // もう同じ部屋にいるなら席は動かさない
  if (ME.present && myRoomId() === logicalRoom(person.room)) {
    later(() => iconAt(person, HAND, 'wave'), 200);
    const t = showToast(`<span class="t">${esc(_t('engine.ans.goSent', { name: person.name }))}</span>${talkBtn(person.room)}`, 10000);
    bindMeet(t, person.room);
    return;
  }
  const pl = isHere(person) ? placeOf(person) : null;
  // 呼んだ人の部屋(島)に空席が無ければ、別の島へは回さず席はそのまま。2人とも呼んだ人の部屋のMeetへ(呼んだ側はincomingAnswerで同じ判定)
  const target = nearestFree(person.room, pl?.cx, pl?.cy);
  if (!target) {
    const t = showToast(`<span class="t">${esc(_t('engine.ans.noSeat', { name: person.name, room: roomById(person.room).name }))}</span>${MEET_BTN}`, 10000);
    bindMeet(t, person.room);
    later(() => iconAt(person, HAND, 'wave'), 400);
    return;
  }
  seatMe(target, { msg: esc(_t('engine.ans.moved', { name: person.name, room: roomName(target.room, ME.room) })), meetRoom: person.room });
  later(() => iconAt(person, HAND, 'wave'), 400); // 呼んだ人の頭上に手(決まり文句の吹き出しは出さない)
}
// 手を振られた(振り返せる)・返事が来た(出来事wave・answer)
function incomingWave(e) {
  const from = personOf(e.fromUserId, e.fromName), reply = Date.now() - (wavedAt.get(from.id) || 0) < WAVE_BACK_MS, back = !reply && inOffice(ME) && from.present;
  if (reply) wavedAt.delete(from.id); // 次に来た手はまた振り返せる
  iconAt(from, HAND, 'wavebig'); // 振られた側は大きめに3回振る(×2の小さい手だと気づかれなかった)
  if (!SYS_LOG.some(x => x.id === 'wave' + e.id)) { SYS_LOG.push({ id: 'wave' + e.id, sys: true, createdAt: e.createdAt, text: _t(reply ? 'engine.wave.logBack' : 'engine.wave.logIn', { name: from.name }) }); renderLog(); } // トースト(6秒)を見逃してもログに残す
  const t = showToast(`<canvas></canvas><span class="t">${_t(reply ? 'engine.wave.toastBack' : 'engine.wave.toastIn', { name: esc(from.name) })}</span>${back ? `<button class="pbtn" data-wave>${_t('engine.wave.back')}</button>` : ''}`, 6000);
  t.querySelector('canvas').replaceWith(faceCanvas(from)); faceLink(t, from);
  const b = t.querySelector('[data-wave]');
  if (b) b.onclick = () => { t.hidden = true; waveTo(from); };
}
function incomingAnswer(e) {
  const from = personOf(e.fromUserId, e.fromName), go = e.answer === 'go';
  endCallWait(from.id); // 返事が来たらカードの「返事待ち…」を戻す
  // 相手がこの部屋に来られない(相手から見たnearestFreeと同じ空き)ときは、相手のgoToと同じくこの部屋のMeetで話す
  const noSeat = go && ME.present && from.room !== ME.room && !isMeet(ME.room) && !SEATS.some(s => s.room === ME.room && s.type !== 'desk' && s.type !== 'armchair' && openSeat(s));
  const said = _t(go ? (noSeat ? 'engine.ans.goMeet' : 'engine.ans.go') : 'engine.ans.later');
  const meet = go && ME.present && (noSeat || !!MEET_URLS[ME.room]) ? ME.room : null; // トーストに「Meetを開く」が出るときは、ログの行にも付ける
  if (!SYS_LOG.some(x => x.id === 'ans' + e.id)) { SYS_LOG.push({ id: 'ans' + e.id, sys: true, createdAt: e.createdAt, text: _t('engine.ans.log', { name: from.name, said }), meet }); renderLog(); } // トーストを見逃してもログに残す
  // 受けた側の声かけと同じく、閉じる(×)まで残す。見ていないタブなら、見るまでタブ名に「(返事) 」
  const t = showToast(`<canvas></canvas><span class="t">${_t('engine.ans.from', { name: esc(from.name), said })}</span>${go && ME.present ? (noSeat ? MEET_BTN : talkBtn(ME.room)) : ''}<button class="x" data-close aria-label="${_t('engine.close')}">×</button>`, 864e5);
  t.querySelector('canvas').replaceWith(faceCanvas(from)); faceLink(t, from);
  t.querySelector('[data-close]').onclick = () => { t.hidden = true; };
  if (go) bindMeet(t, ME.room); // 呼んだ側にも同じ(自分の部屋のMeetがあれば「Meetを開く」、無ければ「チャットで話す」)
  if (document.hidden || !document.hasFocus()) { answerNag = true; renderUnread(); }
}

// 見る階を切り替える。階のボタンはマップのfloorsから作る(上の階が上。階が1つなら出さない)
const floorsEl = $('floors');
for (const f of FLS.slice().reverse()) {
  const b = document.createElement('button');
  b.className = 'pbtn'; b.dataset.floor = f.id; b.textContent = f.name;
  b.setAttribute('aria-pressed', String(f.id === FLOOR)); b.setAttribute('aria-label', _t('engine.floor.view', { floor: f.name }));
  b.addEventListener('click', () => { if (f.id !== FLOOR) { userCam = true; setFloor(f.id); } }); // 自分で選んだ階は、大きさが変わっても自分の階へ戻さない
  floorsEl.appendChild(b);
}
floorsEl.hidden = FLS.length < 2;
function setFloor(f) {
  if (f === FLOOR) return;
  FLOOR = f; hoverSeat = null; config.onFloorChange?.(f);
  for (const b of floorsEl.children) b.setAttribute('aria-pressed', String(b.dataset.floor === f));
  refresh();
}
// 自分のいる階が変わったら(入室・移動・おまかせ・サーバーが席を変えた)その階を見せる。切り替えたらtrue(setFloorが描き直してある)
function followMyFloor() {
  const f = ME && ME.present ? floorOf(ME.room) : null, moved = !!f && f !== myFloor;
  myFloor = f;
  if (!moved || f === FLOOR) return false;
  setFloor(f); return true;
}
const showMyFloor = () => { if (ME.present) setFloor(floorOf(ME.room)); }; // 「自分」ボタン・着替えのあとなど、自分に寄せるとき
// エモーション・発言・退出: 自分のいない階を見ていたら、自分の階に切り替えて自分を画面に入れる(同じ階ならカメラは動かさない)
const showMe = () => { if (ME.present && floorOf(ME.room) !== FLOOR) { showMyFloor(); ensureMeVisible(); } };
function applyEnv() { buildPalettes(); groundTile(); buildBack(); initPrecip(); drawIcons(); drawWorld(); }
function drawIcons() {
  const c = $('wxIcon'), g = c.getContext('2d'); g.clearRect(0, 0, 11, 9);
  const disc = (cx, cy, r, col) => { g.fillStyle = col; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) g.fillRect(cx + x, cy + y, 1, 1); };
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (WEATHER === 'sunny') { if (TIME === 'night') { disc(4, 4, 3, '#fff3c4'); disc(6, 3, 2, '#37486f'); } else disc(5, 4, 3, '#f4c651'); }
  else { r(2, 2, 7, 3, '#c3c7ce'); r(1, 3, 9, 2, '#c3c7ce'); r(3, 1, 4, 1, '#c3c7ce'); if (WEATHER === 'rain') { r(2, 6, 1, 1, '#8fcbe0'); r(5, 7, 1, 1, '#8fcbe0'); r(8, 6, 1, 1, '#8fcbe0'); } if (WEATHER === 'snow') { r(2, 6, 1, 1, '#fbf9f3'); r(5, 8, 1, 1, '#fbf9f3'); r(8, 6, 1, 1, '#fbf9f3'); } }
  // 天気はページがOpen-Meteo(src/lib/weather.ts)から読んで渡す。取れなかったら出さない
  const w = WEATHERS.find(x => x[0] === WEATHER), wx = config.weather, label = wx && wx.kind === WEATHER ? wx.label : _t(w[1]);
  $('wxText').textContent = wx ? `${label} ${wx.temp}℃` : label;
  $('weatherBox').title = _t('engine.hud.weatherTitle', { label });
  $('weatherBox').hidden = !wx;
}
/* ============================================================
   歩く人(出社・退社・自分の離席)
   ============================================================ */
const NPC_LOOK = (p) => Object.assign({ look: true }, p, { map: p.map });
// 出社: 入口から出る→扉→席。退社はその逆。
// move: 席から席へ(fromからatへ)
// noStreet=true: 自分の入室(歩く速さの上限が違う)
// at・fromのflは階のid。階をまたぐmoveは、元の階のエレベーターまで歩いて消え、行き先の階のエレベーターから出て歩く
function addWalker(person, kind, at, onDone, from, noStreet) {
  const seatTile = [wgx(at.x), wgy(at.y)], fl = at.fl, ffl = from ? from.fl : fl, hop = kind === 'move' && ffl !== fl; // 歩く経路は8単位のマス
  const pts = p => p && p.map(([gx, gy]) => ({ x: wtx(gx), y: wty(gy) }));
  const ent = ENTRANCE[fl], path = kind === 'move' && !hop ? findPath(wgx(from.x), wgy(from.y), seatTile[0], seatTile[1], fl) : kind === 'out' ? findPath(seatTile[0], seatTile[1], ent.tile[0], ent.tile[1], fl) : findPath(ent.tile[0], ent.tile[1], seatTile[0], seatTile[1], fl);
  const up = hop && pts(findPath(wgx(from.x), wgy(from.y), ENTRANCE[ffl].tile[0], ENTRANCE[ffl].tile[1], ffl)); // 階をまたぐときの元の階の区間(席→エレベーター)
  if (!path || (hop && !up)) { onDone && onDone(); return null; }
  const office = pts(path);
  let legs;
  if (hop) { up[0] = { x: from.x, y: from.y }; up.push({ ...ENTRANCE[ffl].in }); office[0] = { ...ent.in }; office.push({ x: at.x, y: at.y }); legs = [{ where: 'office', fl: ffl, pts: up }, { where: 'office', fl, pts: office }]; }
  else if (kind === 'move') { office[0] = { x: from.x, y: from.y }; office.push({ x: at.x, y: at.y }); legs = [{ where: 'office', fl, pts: office }]; }
  else if (kind === 'in') { office[0] = { ...ent.in }; office.push({ x: at.x, y: at.y }); legs = [{ where: 'office', fl, pts: office }]; }
  else { office[0] = { x: at.x, y: at.y }; office.push({ ...ent.in }); legs = [{ where: 'office', fl, pts: office }]; }
  // 区間ごとの速さ: ふだんは2.5(1回0.1秒あたり)。長い経路は上限の回数で歩き切るよう速くする
  // (入室と退出で4.5秒、席の移動と自分の入室で6.5秒まで)
  for (const lg of legs) {
    let len = 0; for (let k = 1; k < lg.pts.length; k++) len += Math.hypot(lg.pts[k].x - lg.pts[k - 1].x, lg.pts[k].y - lg.pts[k - 1].y);
    const base = 2.5, cap = kind === 'move' || noStreet ? 65 : 45;
    lg.v = Math.max(base, len / cap);
  }
  const w = { look: NPC_LOOK(person), legs, leg: 0, i: 1, x: legs[0].pts[0].x, y: legs[0].pts[0].y, where: legs[0].where, fl: legs[0].fl, face: 'SW', step: 0, moving: true, kind, onDone, isMe: !!person.me, pid: person.id, toSeat: at.seat || null, wait: 0, greet: kind === 'in' };
  w.look.walker = w;
  walkers.push(w);
  if (kind === 'in' && noStreet) { FL[fl].ev = 8; later(() => say(w.look, greeting(), 3000), 200); }
  kickLoop(); // 止まっていたら10fpsに戻す
  return w;
}
// 人が近づくと扉が開く
function updateDoors() {
  const near = (f, x, y) => walkers.some(w => w.where === 'office' && w.fl === f.id && Math.hypot(w.x - x, w.y - y) < 22);
  for (const f of FLS) {
    for (const d of f.doors) {
      const cx = d.axis === 'y' ? d.at : (d.a + d.b) / 2, cy = d.axis === 'y' ? (d.a + d.b) / 2 : d.at;
      if (near(f, cx, cy)) doorOpen[d.k] = Math.max(doorOpen[d.k], 6);
      else if (doorOpen[d.k] > 0) doorOpen[d.k]--;
    }
    if (near(f, ENTRANCE[f.id].at.x, ENTRANCE[f.id].at.y)) f.ev = Math.max(f.ev, 6); // 入口(エレベーター)の前に人がいると開く
    else if (f.ev > 0) f.ev--;
  }
}
const doorsMoving = () => FLS.some(f => f.ev > 0 || f.doors.some(d => doorOpen[d.k] > 0));
function updateWalkers() {
  for (const w of walkers) {
    if (w.wait > 0) { // 建物の中(エレベーター)を移動中
      if (--w.wait === 0) {
        w.leg++; const lg = w.legs[w.leg]; w.where = lg.where; w.fl = lg.fl; w.x = lg.pts[0].x; w.y = lg.pts[0].y; w.i = 1;
        if (lg.where === 'office') { FL[lg.fl].ev = 8; if (w.greet) say(w.look, greeting(), 3000); } // 着いた階の入口が開く
      }
      continue;
    }
    // 1回ぶんの距離を、曲がり角(経路の点)をまたいでも使い切る(点ごとに1回止まると、速くしても点の数だけ時間がかかる)
    const lg = w.legs[w.leg];
    let left = lg.v || 2.5;
    while (left > 0) {
      const tgt = lg.pts[w.i];
      if (!tgt) { w.done = true; break; }
      const dx = tgt.x - w.x, dy = tgt.y - w.y, d = Math.hypot(dx, dy);
      if (d > left) { w.x += dx / d * left; w.y += dy / d * left; w.step++; w.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'SE' : 'NW') : (dy > 0 ? 'SW' : 'NE'); break; }
      w.x = tgt.x; w.y = tgt.y; w.i++; left -= d;
      if (w.i >= lg.pts.length) {
        if (w.leg + 1 < w.legs.length) { if (lg.where === 'office') FL[lg.fl].ev = 8; w.where = 'hidden'; w.wait = 10; bubbles.filter(b => b.who === w.look).forEach(dropBubble); }
        else w.done = true;
        break;
      }
    }
  }
  const done = walkers.filter(w => w.done);
  walkers = walkers.filter(w => !w.done);
  done.forEach(w => w.onDone && w.onDone());
  updateDoors();
}
/* ============================================================
   小窓(Document Picture-in-Picture。使えなければ window.open で ?mini=1 のページを開く。そのページはこの小窓だけを出す)
   ============================================================ */
let mini = null;
async function openMini() {
  if (mini && mini.win && mini.win !== window && !mini.win.closed) { mini.win.focus(); return; }
  let win = null;
  try { if ('documentPictureInPicture' in window) win = await documentPictureInPicture.requestWindow({ width: 480, height: 320 }); } catch (e) { win = null; }
  if (!win) { if (!window.open('/?mini=1', 'vo-mini', 'popup,width=480,height=320')) showToast(`<span>${_t('engine.mini.blocked')}</span>`); return; }
  mountMini(win);
}
$('miniBtn').addEventListener('click', openMini); $('miniBtn2').addEventListener('click', openMini);
function mountMini(win) {
  const doc = win.document;
  if (win !== window) {
    doc.head.innerHTML = '';
    document.querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"]').forEach(n => doc.head.appendChild(doc.importNode(n, true)));
    doc.title = _t('engine.mini.title'); doc.body.innerHTML = ''; doc.body.style.margin = '0';
  }
  const mroot = doc.createElement('div');
  mroot.className = 'mini';
  mroot.innerHTML = `<div class="mini-head"><span data-m="pres"></span><span class="sp"></span><span class="mst" data-m="mst" role="radiogroup" aria-label="${_t('engine.status.title')}"></span><span data-m="clock"></span></div>
    <div class="mini-stage"><canvas></canvas><div class="mini-ov"></div><div class="mini-away" hidden>${_t('engine.status.away')}</div>
      <div class="mini-call win" hidden><span data-m="callface"></span><span class="t"></span><span data-m="callacts"></span><button class="pbtn" data-m="later">${_t('engine.hud.later')}</button></div>
      <div class="mini-call win" data-m="meetask" hidden><span class="t">${_t('engine.meet.ask')}</span><button class="pbtn go" data-m="meetdone">${_t('engine.meet.back')}</button></div></div>
    <ol class="mini-log" data-m="log" aria-label="${_t('engine.mini.log')}"></ol>
    <form class="mini-say" autocomplete="off"><input aria-label="${_t('engine.say.aria')}" maxlength="200"><button class="pbtn go" type="submit">${_t('engine.say.send')}</button></form>`;
  if (win === window) root.appendChild(mroot);
  else { const host = doc.createElement('div'); host.className = 'vo-page'; host.appendChild(mroot); doc.body.appendChild(host); } // CSSは .vo-pageの下に閉じてある
  const q = k => mroot.querySelector(`[data-m="${k}"]`);
  mini = { win, doc, root: mroot, canvas: mroot.querySelector('canvas'), ov: mroot.querySelector('.mini-ov'), q };
  mroot.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const inp = mroot.querySelector('input'), v = inp.value.trim(); if (!v || !ME.present) return; inp.value = ''; postChat(v); });
  q('mst').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b || b.disabled) return; setManual(b.dataset.st); });
  q('callacts').addEventListener('click', () => { if (pendingCall) answerCall(pendingCall, true); });
  q('later').addEventListener('click', () => { if (pendingCall) answerCall(pendingCall, false); });
  q('meetdone').addEventListener('click', meetDone);
  if (win !== window) { win.addEventListener('blur', leftForMeet); win.addEventListener('focus', askMeetDone); } // Meetから小窓に戻ってきたときも「会議おわった？」
  if (win !== window) win.addEventListener('pagehide', () => { if (mini && mini.win === win) mini = null; });
  const fit = () => mroot.classList.toggle('textonly', (win.innerHeight || 0) < 240);
  fit(); win.addEventListener('resize', () => { fit(); drawMini(); });
  showMyFloor(); /* 小窓は自分の席を映すので、開くときは本体も自分の階にする(ほかの階のままだと小窓が空のまま) */
  renderMiniHead(); drawMini();
}
function renderMiniHead() {
  if (!mini) return;
  const { q } = mini;
  const fixed = !ME.away && statusReason(ME);
  q('mst').innerHTML = ['work', 'focus', 'break', 'meet'].map(k => `<button data-st="${k}" role="radio" aria-checked="${!fixed && ME.manual === k}" aria-pressed="${!fixed && ME.manual === k}" ${fixed || ME.away || !isHere(ME) ? 'disabled' : ''} title="${esc(fixed || '')}"><i class="sq ${STATUS[k].cls}"></i>${STATUS[k].label}</button>`).join('');
  q('pres').textContent = _t('engine.presence', { n: PEOPLE.filter(inOffice).length });
  const awayEl = mini.root.querySelector('.mini-away');
  awayEl.hidden = ME.present && !ME.away; awayEl.textContent = _t(ME.present ? 'engine.status.away' : 'engine.mini.out');
  mini.root.querySelector('input').placeholder = ME.present ? _t('engine.say.to', { room: talkName(myRoomId()) }) + sayCount() : _t('engine.say.enterFirst');
  const call = mini.root.querySelector('.mini-call');
  call.hidden = !pendingCall; // 返事するまで出したまま
  q('meetask').hidden = !!pendingCall || Date.now() >= meetAskUntil || !meetLive();
  if (pendingCall) {
    const f = personOf(pendingCall.fromUserId, pendingCall.fromName);
    q('callface').replaceChildren(faceCanvas(f));
    call.querySelector('.t').innerHTML = `<b>${esc(f.name)}</b><span class="q">${_t('engine.call.q')}</span>`;
    q('callacts').innerHTML = `<button class="pbtn go" data-go>${_t('engine.call.go')}</button>`;
  }
  const row = (cls, name, text) => { const li = mini.doc.createElement('li'); li.className = cls; li.append(Object.assign(mini.doc.createElement('b'), { textContent: name }), Object.assign(mini.doc.createElement('span'), { textContent: text })); return li; };
  const rows = MSGS.slice(-3).map(m => row([m.userId === ME.id && 'me', (m.mentions ?? []).includes(ME.id) && 'men', m.deleted && 'del'].filter(Boolean).join(' '), m.userId === ME.id ? _t('engine.you') : nameParts(m.name)[0], m.deleted ? _t('engine.msg.deleted') : m.text));
  q('log').replaceChildren(...(rows.length ? rows : [row('empty', '', _t('engine.log.empty'))]));
  q('clock').textContent = nowHM();
}
function drawMini() {
  if (!mini || mini.root.classList.contains('textonly')) return;
  /* 本体がほかの階を見ているあいだは描き直さない。worldCanvas はその階の絵なので、自分の席の所に違う階が映る。前の絵のまま残す */
  if (ME.present && floorOf(ME.room) !== FLOOR) return;
  const stage = mini.root.querySelector('.mini-stage'), W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const k = Math.max(1, Math.min(3, Math.floor(H / 70)));
  const cw = Math.ceil(W / k), ch = Math.ceil(H / k);
  const pl = isHere(ME) ? placeOf(ME) : ME.present ? placeOfSeat(ME) : null; // 離席中は自分の席のあたり。入室していなければオフィスの真ん中
  const cx = pl ? PX(pl.cx, pl.cy) : (BOX.x0 + BOX.x1) / 2, cy = pl ? PY(pl.cx, pl.cy, 14) : (BOX.y0 + BOX.y1) / 2;
  const x0 = Math.round(cx - cw / 2), y0 = Math.round(cy - ch / 2);
  const c = mini.canvas;
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  c.style.width = cw * k + 'px'; c.style.height = ch * k + 'px'; c.style.marginLeft = -cw * k / 2 + 'px'; c.style.marginTop = -ch * k / 2 + 'px'; c.style.transform = 'scaleX(-1)'; // 本体と同じく左右反転
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = CUR_SKY.x; g.fillRect(0, 0, cw, ch);
  g.drawImage(worldCanvas, x0, y0, cw, ch, 0, 0, cw, ch);
  const shown = PEOPLE.filter(p => isHere(p) && floorOf(p.room) === FLOOR); // 本体と同じく見ている階の人だけ
  const key = [x0, y0, k, W, H, FLOOR, shown.map(p => p.id + p.seat + statusOf(p) + p.away + p.name).join()].join(':');
  if (mini.ovKey !== key) {
    mini.ovKey = key;
    const ox = (W - cw * k) / 2, oy = (H - ch * k) / 2;
    mini.ov.innerHTML = shown.map(p => { const h = headXY(p); if (!h) return ''; const x = W - ((h.x - x0) * k + ox), y = (h.y - y0) * k + oy; if (x < 10 || x > W - 10 || y < 14 || y > H) return ''; const st = STATUS[statusOf(p)]; return `<div class="tag${p.me ? ' me' : ''}${p.away ? ' off' : ''}" style="--s:1;--x:${x};--y:${y}">${p.away ? '' : `<i class="sq ${st.cls}"></i>`}${p.me ? _t('engine.you') : esc(tagName(p))}</div>`; }).join('');
  }
}

/* ============================================================
   VoState から作り直す(人・席・チャット・出来事)。操作は act で送る
   ============================================================ */
let pending = 0, lastServer = 0, lastEventId = -1, lastSig = '', msgRoom, booted = false;
const seenMsg = new Set(), talkShown = new Map(), emoteSeen = new Set();
const delSeen = new Set(); // 取り消しを見た発言(吹き出しを消すのは1回だけ)
const keyOf = p => (p.present ? `${p.room}|${p.seat || ''}|${p.away ? 1 : 0}` : '');
const lookOf = p => ({ hair: p.hair, hc: p.hc, sk: p.sk, cl: p.cl, pt: p.pt, ot: p.ot, ac: p.ac });
const ME_KEYS = ['present', 'away', 'walking', 'room', 'seat', 'manual', 'focusEnd', 'focusDone', 'memo', 'hair', 'hc', 'sk', 'cl', 'pt', 'ot', 'ac', 'deco', 'pc', 'mon', 'keyboard', 'tgtKey', 'joinT', 'overflow'];
const snapMe = () => Object.fromEntries(ME_KEYS.map(k => [k, ME[k]]));
function restoreMe(o) { walkers = walkers.filter(w => !w.isMe); Object.assign(ME, o); ME.map = mkMap(ME); }
// 出来事の差出人(いまの一覧にいなければ名前だけの人を作る)
function personOf(id, name) { return PEOPLE.find(p => p.id === id) || { id, name, hair: 'short', hc: 'black', sk: 'l', cl: 'grey', pt: 'navy', map: mkMap({}), phase: 0 }; }
// 操作: 先に画面を変えて(optimistic)から送る。失敗したら自分を元に戻してトースト。成功したら応答のVoStateを反映する。結果はVoStateかnull
function act(action, optimistic, undo) {
  if (preview) return Promise.resolve(null);
  const snap = snapMe();
  if (optimistic) {
    try { optimistic(); } catch (e) { // 画面を先に変える途中で落ちたら、自分を元に戻して知らせる(送らない)
      restoreMe(snap); refresh();
      showToast(`<span class="t">${_t('engine.err.retry')}</span>`, 4000);
      return Promise.resolve(null);
    }
  }
  pending++;
  if (action.type === 'enter') lastNotice = null; // 島が満席のお知らせは、同じ文言でも入室のたびに出す
  return config.send(action).then(state => { pending--; if (!destroyed) applyState(state, true); return state; }, err => {
    pending--;
    if (destroyed) return null;
    restoreMe(snap); if (undo) undo(err); refresh();
    showToast(`<span class="t">${esc((err && err.message) || _t('engine.err.comm'))}</span>`, 4000);
    return null;
  });
}
let lastNotice = null;
function showNotice(n) {
  if (!n) return;
  const text = typeof n === 'string' ? n : n.text || n.message, key = typeof n === 'string' ? n : String(n.id ?? text);
  if (!text || key === lastNotice) return;
  lastNotice = key;
  showToast(`<span class="t">${esc(text)}</span>`, 6000);
}
// 18時以降に操作がなくて自動で退出した(サーバーのautoLeftAt): 見えているときに、その時刻ごとに1回だけ。端末に覚えられなくても開いている間は1回(showNotice)
// 覚えるのは出したとき(later)。開発中のStrict Modeの2回目のマウントで出なくならないように(ヒントと同じ)
const AUTO_LEFT = 'vo-auto-left';
function autoLeftNotice(at) {
  if (!at || document.hidden) return;
  try { if (localStorage.getItem(AUTO_LEFT) === at) return; } catch (e) { /* 覚えられなくても動く */ }
  later(() => {
    try { localStorage.setItem(AUTO_LEFT, at); } catch (e) { /* 覚えられなくても動く */ }
    showNotice({ id: at, text: _t('engine.autoLeft', { h: config.workEndHour ?? 18 }) });
  }, 0);
}
function applyState(state, fromSend) {
  SEASON = state.season ?? null;
  handleEvents(state); // 出来事はidで一度だけ。人の反映を飛ばすときも取りこぼさない
  showNotice(state.notice); // 自分あての1回きりのお知らせ(サーバーが付けたときだけ)
  autoLeftNotice(state.autoLeftAt);
  // 操作の途中に届いたポーリングと、追い越された古い応答は反映しない(押した直後の画面が戻らないように)
  const t = Date.parse(state.serverTime) || 0;
  if ((!fromSend && pending > 0) || t < lastServer) return;
  lastServer = t;
  const psig = JSON.stringify(state.plugins ?? {});
  if (psig !== PSIG) { PSIG = psig; PSTATE = state.plugins ?? {}; if (booted) drawWorld(); }
  if (booted && t) srvOff = t - Date.now(); // 時計をサーバーに合わせる(開いたときのstateはページの読み込みのぶん古いので使わない)
  if (booted) { // ほかの部屋で話している人(直近8秒にチャットを書いた人)の頭上に、数秒だけ「…」(中身は出さない)。人の様子が変わらない回でも出す
    const nowMs = Date.now();
    for (const id of state.talkingUserIds || []) {
      const p = PEOPLE.find(x => x.id === id);
      if (!p || p.me || !p.present || (ME.present && logicalRoom(p.room) === myRoomId()) || nowMs - (talkShown.get(id) || 0) < 7000) continue;
      talkShown.set(id, nowMs); say(p, '…', 3000, 'talk');
    }
  }
  // エモーション(直近6秒に押した人)。押した時刻ごとに1回だけ。自分の分は押したときに出した。開いたときの分は動かさない。人の様子が変わらない回でも出す
  for (const e of state.emotes || []) {
    const k = e.userId + '|' + e.at, p = booted && e.userId !== state.meId && !emoteSeen.has(k) && PEOPLE.find(x => x.id === e.userId);
    emoteSeen.add(k);
    if (p) startEmote(p, e.emote);
  }
  // 取り消された発言の吹き出しを消す(待っている分も)。自分の吹き出しは送信が通ったときにpostChatがidを入れる
  for (const m of state.messages) if (m.deleted && !delSeen.has(m.id)) {
    delSeen.add(m.id);
    for (let i = bubbleQueue.length; i--;) if (bubbleQueue[i].o?.id === m.id) bubbleQueue.splice(i, 1);
    bubbles.filter(b => b.o?.id === m.id).forEach(dropBubble);
  }
  const sig = JSON.stringify([state.meId, state.isAdmin, state.people, state.messages.map(m => [m.id, m.deleted, m.reactions]), state.meetUrls, state.talkingRooms]);
  if (booted && sig === lastSig) return; // 変わっていなければ描き直さない(4秒ごとにHUDのフォーカスを奪わない)
  lastSig = sig;
  MEET_URLS = Object.fromEntries(Object.entries(state.meetUrls || {}).filter(([, u]) => httpUrl(u))); // http(s)以外(javascript:など)は捨てる
  TALK_ROOMS = state.talkingRooms ?? [];
  const seen = new Set(), next = [];
  for (const v of state.people) {
    let p = PEOPLE.find(x => x.id === v.id);
    if (!p) { p = { id: v.id, present: false, away: false, walking: false, room: null, seat: null, tgtKey: '', phase: (PEOPLE.length * 7) % 13, joinT: 0 }; PEOPLE.push(p); }
    seen.add(v.id);
    const pr = v.presence, focusEnd = pr && pr.focusUntil ? Date.parse(pr.focusUntil) : null;
    if (p.focusEnd !== focusEnd) p.focusDone = !!focusEnd && t - focusEnd > 10 * 60e3; // 10分より前に終わっていた集中は知らせない
    Object.assign(p, { me: v.id === state.meId, name: v.name, ...v.look, deco: v.deco, pc: v.pc, mon: v.mon, keyboard: v.keyboard || 'none', memo: v.memo, manual: pr ? pr.status : 'work', focusEnd, overflow: !!(pr && pr.overflow) });
    p.map = mkMap(p);
    // 押し忘れ(ハートビートが2時間来ていないstale)の人は地図にも名簿にも出さない(席は空いて見える)。歩いて出ていかせずに消す
    const stale = !!(pr && pr.stale) && !p.me;
    next.push([p, pr && !stale ? { room: pr.room, seat: pr.seatId, away: pr.away } : null, stale]);
  }
  ME = PEOPLE.find(p => p.id === state.meId);
  if (!ME) { ME = Object.assign(personOf(state.meId, ''), { me: true, present: false, away: false, walking: false, tgtKey: '', manual: 'work', memo: '', deco: null, pc: 'mac', mon: 0, keyboard: 'none' }); PEOPLE.push(ME); }
  for (const [p, tgt, stale] of next) transition(p, tgt, !booted || stale);
  for (const p of PEOPLE) if (!seen.has(p.id) && p !== ME) transition(p, null, !booted);
  // チャット: 開いたときと部屋を移ったときは既読あつかい。新しい発言は吹き出し(自分のは送ったときに出した)と未読
  const room = myRoomId();
  if (!booted || room !== msgRoom) { state.messages.forEach(m => seenMsg.add(m.id)); unread = 0; unreadAt = false; unrAfter = null; readId = state.messages.map(m => m.id).pop() || ''; }
  else for (const m of state.messages) {
    if (seenMsg.has(m.id)) continue;
    seenMsg.add(m.id);
    if (m.userId === ME.id) continue;
    const sp = PEOPLE.find(p => p.id === m.userId);
    if (sp && !m.deleted) say(sp, m.text, undefined, undefined, { id: m.id, mention: (m.mentions ?? []).includes(ME.id) });
  }
  msgRoom = room;
  MSGS = state.messages.slice();
  if (logIsOpen() && !document.hidden) readId = MSGS.map(m => m.id).pop() || readId; // 開いていて見えているあいだに来た発言は読んだことにする(別のタブにいる間は未読)
  countUnread();
  const first = !booted;
  booted = true;
  if (!first) refresh();
}
// 在室の変化を絵に出す: 入室=入口から歩いて席へ / 退出=入口へ / ほかの人の席の移動=歩く(階をまたぐなら入口を通る) / 離席になる・戻る=座ったまま(札と名札だけ変わる)。
// 自分の操作は押したときに画面を変えてtgtKeyもそろえてあるので、応答では何も起きない
const walkTo = p => { if (isMeet(p.room)) return { ...MEET[p.room].inAt }; const st = seatById(p.seat); return st ? { x: st.cx, y: st.cy } : null; }; // 会議室は入口の内側まで
function transition(p, tgt, instant) {
  const key = tgt ? `${tgt.room}|${tgt.seat || ''}|${tgt.away ? 1 : 0}` : '';
  if (p.tgtKey === key) return;
  p.tgtKey = key;
  const from = isHere(p) ? placeOf(p) : null, wasPresent = p.present, wasAway = p.away, fromFl = floorOf(p.room);
  walkers = walkers.filter(w => w.pid !== p.id);
  if (tgt) { if (isMeet(tgt.room) && !isMeet(p.room)) p.joinT = ++joinSeq; Object.assign(p, { present: true, room: tgt.room, seat: tgt.seat, away: tgt.away }); }
  else Object.assign(p, { present: false, room: null, seat: null, away: false });
  p.walking = false;
  if (instant || reduceMotion || (p.me && instantMe)) { if (p.me) instantMe = false; return; } // instantMe: 退出の取り消しは歩いて入り直さない
  if (p.me && wasPresent && tgt) later(ensureMeVisible, 0); // サーバーが自分の席を変えたとき(席を外されて空いた席へ移ったなど)、画面の外なら寄せる
  const out = from && !from.over ? { x: from.cx, y: from.cy, fl: fromFl } : null;
  if (!tgt) { if (out) { const w = addWalker(p, 'out', out, null); if (w && !p.me) say(w.look, _t('engine.say.bye'), 3000); } return; }
  if (tgt.away || (wasPresent && wasAway)) return; // 自分で押した離席も、ハートビートが15分来ない自動の離席も、歩かせない
  const to = walkTo(p); if (!to) return;
  to.fl = floorOf(p.room);
  const arrive = () => { p.walking = false; refresh(); if (p.me) stopAtMe(); };
  // 自分の入室はエレベーターから出て席へ歩き、カメラが×2で追う(着いたらstopAtMe)。ほかの人は入口から歩いてくる
  if (!wasPresent) { p.walking = true; addWalker(p, 'in', { ...to, seat: tgt.seat }, arrive, null, p.me); if (p.me) { followMe = true; if (view.s !== 2) { view.s = 2; applyScale(); } { const ei = ENTRANCE[floorOf(p.room)].in; centerOn(PX(ei.x, ei.y), PY(ei.x, ei.y, 20)); } } }
  else if (out && !p.me) { p.walking = true; addWalker(p, 'move', { ...to, seat: tgt.seat }, arrive, out); }
}
function handleEvents(state) {
  const evs = (state.events || []).filter(e => e.id > lastEventId).sort((a, b) => a.id - b.id);
  if (lastEventId < 0) { // 開いたとき: サーバーは直近15分の出来事を返す。いちばん新しい「ちょっといい？」だけ出す(プッシュ通知から開いて返事できるように)
    const call = evs.filter(e => e.kind === 'call').pop();
    lastEventId = Math.max(0, state.lastEventId || 0, ...evs.map(e => e.id));
    if (call) later(() => incomingCall(call), 800);
    return;
  }
  for (const e of evs) {
    lastEventId = Math.max(lastEventId, e.id);
    if (e.kind === 'call') incomingCall(e); else if (e.kind === 'wave') incomingWave(e); else if (e.kind === 'answer') incomingAnswer(e);
  }
}
function setMode() {
  root.classList.remove('vo-mode-mini', 'vo-mode-phone', 'vo-mode-desk');
  root.classList.add('vo-mode-' + (MINI ? 'mini' : isPhone() ? 'phone' : 'desk'));
}
let tick = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
setCustomParts(PARTS);
buildPalettes();
buildGrid();
setMode();
groundTile(); buildBack(); initPrecip(); drawIcons();
applyState(config.initial, true);
followMyFloor(); // 自分のいる階を開く(入室前は作業エリアのある階)
config.onFloorChange?.(FLOOR);
renderWorld();
if (MINI) { mountMini(window); }
else {
  initialView();
  refresh();
  let rz = 0, lastPhone = isPhone();
  // 大きさが変わったら今の構図(全体・自分に寄せた×2・最初の構図)を取り直す。ただし自分でズーム・パンしたあとと、高さだけが150px以下で変わったとき(スマホのアドレスバーの出入り)は取り直さない
  let lastW = innerWidth, lastH = innerHeight;
  const reframe = () => { if (lastFrame === 'fit') frameAll(); else if (lastFrame === 'me' && ME.present) frameMe(); else initialView(); };
  on(window, 'resize', () => { clearTimeout(rz); rz = later(() => {
    setMode(); if (lastPhone !== isPhone()) closePop();
    const phoneChanged = lastPhone !== isPhone(), onlyHeight = innerWidth === lastW && Math.abs(innerHeight - lastH) <= 150;
    lastPhone = isPhone(); lastW = innerWidth; lastH = innerHeight;
    if (phoneChanged || (!userCam && !onlyHeight)) reframe(); else applyScale();
    renderLog();
    if (popFor === 'guide' && !pop.hidden) openGuide(guideAt); // 指す物の位置が変わるので今のページで開き直す
  }, 120); });
  // まだ見ていなければ、入室している状態になったとき1回だけ案内カード(renderHUD → guideOnEnter。閉じると触れるものに小さなヒント)
  // 見たことを覚えるのは出したとき。開発中はReactのStrict Modeがマウントを2回するので、先に覚えると1回目が消えて2回目で出なかった
  guideWait = true; try { guideWait = localStorage.getItem('vo-guide') !== '1'; } catch (e) { /* 保存できなくても動く */ }
  guideOnEnter(600); // 入室済みで開いたとき
}
// 時計と、時間帯の切り替わり(開いたままでも夕方・夜になる)
const tickClock = () => {
  $('clock').textContent = nowHM(); if (mini) mini.q('clock').textContent = nowHM();
  const tm = TIME_FIXED ? TIME : zonedTime();
  if (tm !== TIME) { TIME = tm; applyEnv(); }
};
tickClock(); if (!preview) every(tickClock, 10000);
// 集中タイマー(ステータスを集中にすると25分。終わりはサーバーのfocusUntil)。終わったら作業中に戻し、
// タブ名を「(休憩しませんか) …」にしてトーストと一緒にフォーカスが戻るまで残す。通知を許可していればブラウザの通知を1回
function checkFocusEnd() {
  if (!(ME.focusEnd && isHere(ME) && !ME.away && statusOf(ME) === 'focus')) return;
  $('meTimer').textContent = _t('engine.focusLeft', { t: mmss(ME.focusEnd - Date.now()) });
  if (ME.focusDone || Date.now() < ME.focusEnd) return;
  ME.focusDone = true;
  setManual('work'); // 時間が来たら作業中に戻す(トーストを見逃しても「残り0:00」のまま残らない)
  const t = showToast(`<span class="t">${_t('engine.focus.done')}</span><button class="pbtn go" data-rest>${_t('engine.focus.rest')}</button><button class="pbtn" data-more>${_t('engine.focus.more')}</button>`, 864e5);
  focusNag = t; renderUnread();
  if (!document.hasFocus() || document.hidden) notifyFocusEnd(); else later(endFocusNag, 12000); // 見ているならふつうに消す
  t.querySelector('[data-rest]').onclick = () => { // 休憩の部屋へ移る
    t.hidden = true; endFocusNag(); const br = ROOMS.find(r => r.kind === 'break' && SEATS.some(st => st.room === r.id)), s = br && nearestFree(br.id); setManual('work');
    if (s) seatMe(s, { msg: esc(_t('engine.focus.moved', { room: br.name })) });
  };
  t.querySelector('[data-more]').onclick = () => { t.hidden = true; endFocusNag(); act({ type: 'status', status: 'focus', focusMinutes: FOCUS_MS / 60000 }, () => { ME.focusEnd = Date.now() + FOCUS_MS; ME.focusDone = false; renderHUD(); }); };
}
function endFocusNag() { if (!focusNag) return; const t = focusNag; focusNag = null; renderUnread(); if ($('toast') === t && t.querySelector('[data-rest]')) t.hidden = true; }
// フォーカスが戻ったら、タブ名を戻してトーストは12秒後に消す
on(window, 'focus', () => { if (focusNag) later(endFocusNag, 12000); });
// 返事のタブ名の印は、このタブを見たら外す(トーストは×で閉じるまで残る)
const seenAnswer = () => { if (answerNag && !document.hidden && document.hasFocus()) { answerNag = false; renderUnread(); } };
on(window, 'focus', seenAnswer); on(document, 'visibilitychange', seenAnswer);
// ログを開いたまま別のタブにいた間の発言は未読。戻ってきたら読んだことにして、その上に「ここから未読」
const seenLog = () => { if (!document.hidden && logIsOpen() && unread) { unrAfter = readId; markRead(); renderLog(); } };
on(window, 'focus', seenLog); on(document, 'visibilitychange', seenLog);
function notifyFocusEnd() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = _t('engine.focus.notifyTitle'), opt = { body: _t('engine.focus.notifyBody'), tag: 'vo-focus-end' };
  (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null))
    .then(reg => (reg ? reg.showNotification(title, opt) : new Notification(title, opt)))
    .catch(() => { try { new Notification(title, opt); } catch (e) { /* 通知が出せなくてもトーストとタブ名で知らせている */ } });
}
// 描く間隔: 歩く人・扉・ドラッグなど動いているものがあれば10fps。なければ2fps(湯気・ランプ・まばたきだけ)、
// 別のウィンドウで作業中(blur。小窓にもフォーカスがない)は1fps(歩く人がいるときだけ10fps。扉は待たせる)。タブが隠れていて小窓も無ければ描かない。
// 間隔をあけたぶんは歩く人・車などを何回か進めて、速さを変えない
on(window, 'focus', () => { focused = true; kickLoop(); });
on(window, 'blur', () => { focused = false; });
const moving = seen => (walkers.length > 0 || pointers.size > 0 ? 100 : (seen && doorsMoving()) || PEOPLE.some(p => p.emo && p.emo.end > Date.now()) ? 200 : 0); // 歩く人・ドラッグは10fps、扉だけなら5fps。エモーションは数秒なので別のウィンドウで作業中でも5fps
let lastStepAt = performance.now(), tickDebt = 0;
function kickLoop() { if (destroyed || config.freeze) return; if (loopTimer) { clearTimeout(loopTimer); timers.delete(loopTimer); } loopTimer = later(step, 0); } // freeze: 描画ループを回さない(ハーネス用)
function step() {
  const off = document.hidden && !mini;
  const miniFocus = !!mini && mini.win !== window && mini.win.document.hasFocus();
  const seen = focused || miniFocus;
  const ms = off ? 1000 : reduceMotion ? 500 : moving(seen) || (seen ? 500 : 1000);
  const now = performance.now(); // 実際にたった時間ぶん進める(描く時間で遅れないように。端数は次に持ち越す)
  tickDebt = Math.min(10, tickDebt + (now - lastStepAt) / 100); lastStepAt = now;
  const n = config.freeze ? 0 : Math.floor(tickDebt); tickDebt -= n; // freezeのときは時間を進めない(animTが動かず、フレームが毎回同じになる)
  if (!off) {
    for (let i = 0; i < n; i++) {
      tick++;
      if (!reduceMotion) { updateWalkers(); updatePrecip(); }
      if (tick % 2 === 0) animT++;
    }
    if (followMe) { const w = walkers.find(x => x.isMe && x.where === 'office'); if (w) centerOn(PX(w.x, w.y), PY(w.x, w.y, 20)); }
    if (walkers.length || bubbles.some(b => b.who.walker)) layoutBubbles();
    drawWorld();
  }
  checkFocusEnd(); // タブが隠れているあいだも判定する(ループは1秒ごとに回る)
  checkMeetAuto();
  if (!config.freeze) loopTimer = later(step, ms);
}
step();

return {
  update(state) { if (!destroyed) applyState(state, false); },
  setParts(parts) {
    if (destroyed) return;
    PARTS = parts || []; PARTS_VER++; setCustomParts(PARTS); imgURLs.clear();
    if (booted) { renderHUD(); renderLog(); drawWorld(); }
  },
  setPluginState(id, value) {
    if (destroyed) return;
    PSTATE = { ...PSTATE, [id]: value }; PSIG = JSON.stringify(PSTATE);
    if (booted) drawWorld();
  },
  miniOpen: () => !!mini && mini.win !== window,
  worldCanvas: () => worldCanvas,
  camera: () => ({ s: view.s, x: view.x, y: view.y, floor: FLOOR, user: userCam }),
  destroy() {
    if (destroyed) return;
    destroyed = true;
    cleanups.forEach(f => f()); timers.forEach(clearTimeout); timers.clear();
    if (mini && mini.win !== window) { try { mini.win.close(); } catch (e) { /* もう閉じている */ } }
    mini = null;
    document.title = baseTitle();
    root.innerHTML = ''; root.style.cssText = ''; root.className = root.className.replace(/\bvo-\S+|\bout\b|\bs1\b/g, '').trim();
  },
};
}
