// 建物のまわりの景色(map.backdrop: "city" | "countryside")。建物の外形のまわりに、マップの名前から決まる架空の街・田舎を作って、1枚の画像に焼く。
// 時間帯と天気が変わったときだけ作り直す(office.jsのapplyEnv)。毎フレームはblitが貼るだけ。実在の場所・看板・文字は描かない。DOMはcanvasを作るだけ
// 座標はoffice.jsと同じワールド単位(画面x=OX+X-Y, y=OY+(X+Y)/2-Z)。地面は建物の床の下(Z=-slab)

const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hashN = (...v) => { let h = 0x9e3779b9; for (const x of v) { h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; } return (h >>> 0) / 4294967296; };
const seedOf = s => { let h = 7; for (const ch of String(s)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return h; };
// 時間帯の色味(掛ける)。夜は暗い青、夕方は暖かい色
const MUL = { morning: [0.97, 0.99, 1.03], day: [1, 1, 1], evening: [1, 0.8, 0.64], night: [0.3, 0.36, 0.58] };
const LIT = { morning: 0.08, day: 0, evening: 0.3, night: 0.4 }; // 窓に明かりが付く割合

const MARGIN = { x: 900, top: 520, bottom: 720 }; // 建物の外形の外側に作る画像の余白(画素)。パンの範囲と大きい画面ぶん。shortcut: これより外は空の色のまま
const R = 700; // 地面の広がり(外形から)。この外は遠景の稜線・ビル群

export function makeBackdrop({ kind, name, bounds, ox, oy, slab, box, time, weather, sky }) {
  const { XB, XE, YA, YE } = bounds, x0 = Math.floor(box.x0 - MARGIN.x), y0 = Math.floor(box.y0 - MARGIN.top);
  const w = Math.ceil(box.x1 + MARGIN.x - x0), h = Math.ceil(box.y1 + MARGIN.bottom - y0);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h), buf = new Uint32Array(img.data.buffer);
  const seed = seedOf(name), mul = MUL[time] || MUL.day, snow = weather === 'snow', gray = weather === 'rain' || weather === 'cloudy' ? 0.22 : 0, skyRgb = hex2(sky);
  // 色: 色味と天気をかけて、画素の値にする。cols[名前] = 画素値
  const cache = new Map();
  const C = (hx, whiten = 0) => {
    const key = hx + whiten; let v = cache.get(key); if (v !== undefined) return v;
    let c = hex2(hx); if (snow && whiten) c = mix(c, [242, 246, 250], whiten);
    if (gray) c = mix(c.map(x => x * 0.93), [128, 132, 138], gray);
    c = c.map((x, i) => Math.max(0, Math.min(255, x * mul[i])));
    v = (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; cache.set(key, v); return v;
  };
  const far = (hx, t) => { const c = mix(hex2(hx).map((x, i) => x * mul[i]), skyRgb, t); return (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }; // 遠景は空の色に寄せる
  const put = (px, py, c) => { px -= x0; py -= y0; if (px >= 0 && py >= 0 && px < w && py < h) buf[py * w + px] = c; };
  const wpix = (X, Y, Z, c) => put(ox + X - Y, oy + ((X + Y) >> 1) - Z, c);
  const zb = -slab;

  // ---- 遠景(空の上の稜線・ビル群)。地面の遠い2辺(X=XB-Rの辺とY=YA-Rの辺)の線から上に立ち上げる
  const xT = ox + (XB - R) - (YA - R), yT = oy + ((XB - R + YA - R) >> 1); // 地面の奥の頂点(画面)
  const edgeY = x => yT + Math.abs(x - xT) / 2;
  const silhouette = (fn, col, litCol) => {
    for (let x = x0; x < x0 + w; x++) {
      const e = Math.round(edgeY(x)), hh = Math.round(fn(x));
      for (let y = Math.max(y0, e - hh); y <= e + 2 && y < y0 + h; y++) put(x, y, litCol && (x % 5 === 2) && (y % 6 === 2) && y < e - 3 && hashN(seed, x, y) < LIT[time] * 1.4 ? litCol : col);
    }
  };
  if (kind === 'countryside') {
    const ph = [0, 1, 2, 3].map(i => hashN(seed, 50 + i) * 6.28);
    const ridge = (amp, base, f) => x => base + amp * (0.5 + 0.28 * Math.sin(x / (90 * f) + ph[0]) + 0.17 * Math.sin(x / (37 * f) + ph[1]) + 0.08 * Math.sin(x / (13 * f) + ph[2]));
    silhouette(ridge(250, 40, 1.5), far('#8fa3b8', 0.4)); silhouette(ridge(150, 20, 1), far('#6f8f86', 0.28));
    silhouette(x => ridge(70, 8, 0.6)(x) + (snow ? 0 : 0), far('#5b8a62', 0.15));
  } else {
    // ビル群: 幅6〜16画素の柱を並べる。遠いほうは高く空の色に寄せる
    for (const [hMax, hx, t, lit] of [[260, '#8f9bb0', 0.45, false], [150, '#6f7a8f', 0.28, true]]) {
      const hs = new Map(), widths = [];
      for (let x = x0, k = 0; x < x0 + w; k++) { const wd = 6 + Math.floor(hashN(seed, 900 + hMax, k) * 11); widths.push([x, x + wd, 20 + hashN(seed, 910 + hMax, k) ** 1.6 * hMax]); x += wd; }
      for (const [a, b, hh] of widths) for (let x = a; x < b; x++) hs.set(x, hh);
      silhouette(x => hs.get(x) || 0, far(hx, t), lit ? C('#f5c851') : 0);
    }
  }

  // ---- 地面。画面の画素から地面の(X,Y)を逆算して色を決める
  const Xmin = XB - R - 2, Xmax = XE + R + 2, Ymin = YA - R - 2, Ymax = YE + R + 2;
  const inner = { x0: XB - 40, x1: XE + 40, y0: YA - 40, y1: YE + 40 }; // 建物とその縁(広場・庭)
  const P = kind === 'city' ? 152 : 96, RW = 32; // 街区の周期・道幅
  // 軸ごとの表: 道か・道の中の位置・街区の番号と中の位置(街区: 外形の縁の外側に周期Pで並ぶ)
  const axis = (lo, hi, a0, a1) => {
    const n = a1 - a0 + 1, road = new Uint8Array(n), rp = new Int16Array(n), blk = new Int16Array(n), u = new Int16Array(n);
    for (let v = a0; v <= a1; v++) {
      const i = v - a0; let t, sgn;
      if (v < lo) { t = lo - v - 1; sgn = -1; } else if (v >= hi) { t = v - hi; sgn = 1; } else { blk[i] = 0; u[i] = v - lo; rp[i] = 0; continue; }
      const k = Math.floor(t / P), r = t - k * P;
      if (r < RW) { road[i] = 1; rp[i] = r; } else { u[i] = r - RW; blk[i] = sgn * (k + 1); }
    }
    return { road, rp, blk, u, a0 };
  };
  const AX = axis(inner.x0, inner.x1, Xmin, Xmax), AY = axis(inner.y0, inner.y1, Ymin, Ymax);
  const winding = Y => Math.round(18 * Math.sin(Y / 70 + hashN(seed, 7) * 6.28)); // 田舎の道のうねり
  const roadX0 = XE + 90 + Math.floor(hashN(seed, 8) * 60); // 田舎の道のX(外形の+X側)
  const col = {
    asphalt: C('#5d6068'), asphalt2: C('#676a72'), side: C('#bdbab2', 0.7), dash: C('#e8e4d0'), plaza: C('#cdc9bf', 0.7), plaza2: C('#c2beb3', 0.7), lot: C('#aaa79d', 0.7), park: C('#6fae5a', 0.8), park2: C('#66a354', 0.8),
    grass: C('#79b45b', 0.85), grass2: C('#6fa854', 0.85), bund: C('#a6c76d', 0.85), rice: C('#5fae4f', 0.8), rice2: C('#7ec45e', 0.8), water: C('#9fcbd8', 0.6), soil: C('#8c6b49', 0.8), veg: C('#58a444', 0.8), dirt: C('#b9a77f', 0.7), dirt2: C('#a8976f', 0.7), road: C('#8b8d92', 0.6),
  };
  const midRoad = r => r >= 6 && r < RW - 6;
  const groundAt = (X, Y) => {
    if (kind === 'city') {
      const i = X - AX.a0, j = Y - AY.a0, rx = AX.road[i], ry = AY.road[j];
      if (rx || ry) {
        const xm = rx && midRoad(AX.rp[i]), ym = ry && midRoad(AY.rp[j]);
        if (!(xm || ym)) return col.side;
        if (xm && !ry && AX.rp[i] === RW >> 1 && (Y >> 3) & 1) return col.dash; // 中央線
        if (ym && !rx && AY.rp[j] === RW >> 1 && (X >> 3) & 1) return col.dash;
        return (X + Y) & 1 && hashN(X >> 2, Y >> 2) < 0.1 ? col.asphalt2 : col.asphalt;
      }
      if (AX.blk[i] === 0 && AY.blk[j] === 0) return ((X >> 4) + (Y >> 4)) & 1 ? col.plaza : col.plaza2; // 建物の外形のまわり
      return lotType(AX.blk[i], AY.blk[j]) === 2 ? (hashN(X, Y) < 0.12 ? col.park2 : col.park) : col.lot;
    }
    // 田舎: 外形のまわりは芝。うねる道。あとは区画(田・畑・草地)
    if (X >= inner.x0 && X < inner.x1 && Y >= inner.y0 && Y < inner.y1) return hashN(X, Y) < 0.1 ? col.grass2 : col.grass;
    const dr = Math.abs(X - roadX0 - winding(Y));
    if (dr < 7) return dr < 5 ? ((Y >> 3) & 1 && dr === 0 ? col.dash : col.road) : col.dirt2;
    if (dr < 9) return col.bund;
    const lx = X - inner.x0, ly = Y - inner.y0, cx = Math.floor(lx / P), cy = Math.floor(ly / P);
    if (((lx % P) + P) % P < 3 || ((ly % P) + P) % P < 3) return col.bund;
    const t = plotType(cx, cy);
    if (t === 0) return ((Y >> 2) & 3) === 3 ? col.water : ((Y >> 2) & 1) ? col.rice : col.rice2; // 田: 苗の列と水
    if (t === 1) return ((X >> 2) & 1) ? col.soil : col.veg;
    return hashN(X, Y) < 0.1 ? col.grass2 : col.grass;
  };
  const lotType = (bx, by) => { const r = hashN(seed, bx, by, 3); return r < 0.84 ? 0 : r < 0.9 ? 1 : 2; }; // 0=建物1=空き地2=公園
  const plotType = (cx, cy) => { const r = hashN(seed, cx, cy, 5); return r < 0.36 ? 0 : r < 0.62 ? 1 : 2; }; // 0=田1=畑2=草地(家・木)
  for (let j = 0; j < h; j++) {
    const m = (y0 + j) - oy - slab;
    for (let i = 0; i < w; i++) {
      const c = (x0 + i) - ox, s = 2 * m + (c & 1), X = (s + c) >> 1, Y = (s - c) >> 1;
      if (X < Xmin || X > Xmax || Y < Ymin || Y > Ymax) continue;
      buf[j * w + i] = groundAt(X, Y);
    }
  }

  // ---- 立てる物(建物・木・車・家)。遠い順(X+Y)に描く
  const objs = [];
  const add = (X, Y, draw) => objs.push([X + Y, draw]);
  const ibox = (X0, Y0, X1, Y1, hh, top, l, r, win, z0 = 0) => { // z0: 底の高さ(屋根を壁の上に載せる)
    const zt = zb + hh, zs = zb + z0;
    for (let X = X0; X < X1; X++) for (let Y = Y0; Y < Y1; Y++) wpix(X, Y, zt, top);
    for (let X = X0; X <= X1; X++) for (let Z = zs; Z <= zt; Z++) wpix(X, Y1, Z, win ? win(X - X0, Z - zb, 0, hh) || l : l);
    for (let Y = Y0; Y < Y1; Y++) for (let Z = zs; Z <= zt; Z++) wpix(X1, Y, Z, win ? win(Y - Y0, Z - zb, 1, hh) || r : r);
  };
  const tree = (X, Y, r, cols) => {
    const px = ox + X - Y, gy = oy + ((X + Y) >> 1) - zb; // 足もと(地面)
    for (let k = 0; k < 4; k++) put(px, gy - k, C('#6b4a2b'));
    const cy = gy - 4 - r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { if (x * x + y * y > r * r + r) continue; const s = (x + y) / r; put(px + x, cy + y, cols[s < -0.6 ? 0 : s > 0.5 ? 2 : 1]); }
  };
  const GREEN = [[C('#8ed26a', 0.7), C('#5fae4f', 0.7), C('#3f8a46', 0.7)], [C('#7fc060', 0.7), C('#559f48', 0.7), C('#3b7a40', 0.7)]];
  const car = (X, Y, along) => {
    const cc = [C('#d85a4c'), C('#4a78c0'), C('#f0e9d6'), C('#4a4f58'), C('#e8c04a')][Math.floor(hashN(seed, X, Y) * 5)], [dx, dy] = along === 'x' ? [9, 5] : [5, 9];
    add(X, Y, () => { ibox(X, Y, X + dx, Y + dy, 3, cc, cc, C('#3a3d44')); ibox(X + 1, Y + 1, X + dx - 1, Y + dy - 1, 5, C('#9fb4c8'), C('#9fb4c8'), C('#7d92a6')); });
  };
  const person = (X, Y) => { const cc = [C('#d85a4c'), C('#4a78c0'), C('#3f8a46'), C('#e8c04a')][Math.floor(hashN(seed, X, Y, 1) * 4)]; add(X, Y, () => { ibox(X, Y, X + 1, Y + 1, 4, C('#f1c9a5'), cc, cc); }); };
  const bcols = [['#d5cdbf', '#bdb4a4', '#9d9484'], ['#b7c3d2', '#9dabbd', '#7f8da1'], ['#dcb9a0', '#c49a80', '#a37c64'], ['#c9ced6', '#aab1bc', '#8b93a0'], ['#e2d8a8', '#cbbf8a', '#a99d6e']];
  const building = (X0, Y0, X1, Y1, hh, id) => {
    const [, l, r] = bcols[Math.floor(hashN(seed, id, 11) * bcols.length)].map(hx => C(hx));
    const roof = C(['#cfd3d9', '#b9bec6', '#d6c9b8', '#a7b4a4'][Math.floor(hashN(seed, id, 13) * 4)], 1), lit = C('#f5c851'), dark = C('#46566e'), dim = C('#5f7390'), cl = C('#7f93ab');
    const win = (u, v, side, hgt) => {
      if (v < 5 || v > hgt - 3 || u < 2 || (u & 7) < 2 || (u & 7) > 5 || (v % 10) < 3 || (v % 10) > 6) return 0;
      return hashN(seed, id, side, u >> 3, (v / 10) | 0) < LIT[time] ? lit : time === 'night' ? dark : weather === 'sunny' && time === 'day' ? cl : dim;
    };
    add(X0, Y0, () => { ibox(X0, Y0, X1, Y1, hh, roof, l, r, win); if (hh > 60) ibox(X0 + 10, Y0 + 10, X0 + 22, Y0 + 20, 6, C('#9aa0a8'), C('#8a9098'), C('#6d737b')); });
  };
  if (kind === 'city') {
    // 街区: 外形の縁の外側に周期Pで並ぶ。近い側(+X・+Y)は低く、奥側は高くする
    const blocks = (lo, hi, a0, a1) => { // 軸ごとの街区の並び。k=0は建物の外形と同じ幅の帯(Pごとに区切る)
      const out = [], n = Math.ceil(Math.max(lo - a0, a1 - hi) / P) + 1;
      for (let m = 0; m < n; m++) { out.push({ k: -(m + 1), c: 0, a: lo - (m + 1) * P, b: lo - m * P - RW }); out.push({ k: m + 1, c: 0, a: hi + m * P + RW, b: hi + (m + 1) * P }); }
      for (let a = lo, c = 0; a + 40 < hi; a += P - RW, c++) out.push({ k: 0, c, a, b: Math.min(hi, a + P - RW) });
      return out;
    };
    for (const bx of blocks(inner.x0, inner.x1, Xmin + 8, Xmax - 8)) for (const by of blocks(inner.y0, inner.y1, Ymin + 8, Ymax - 8)) {
      if (!bx.k && !by.k) continue;
      const type = lotType(bx.k, by.k), nearSide = bx.k > 0 || by.k > 0, depth = Math.max(Math.abs(bx.k), Math.abs(by.k));
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const X0 = bx.a + 8 + a * ((bx.b - bx.a) >> 1), Y0 = by.a + 8 + b * ((by.b - by.a) >> 1), X1 = X0 + ((bx.b - bx.a) >> 1) - 14, Y1 = Y0 + ((by.b - by.a) >> 1) - 14, id = (bx.k * 40 + bx.c) * 131 + (by.k * 40 + by.c) * 17 + a * 3 + b;
        if (X1 - X0 < 14 || Y1 - Y0 < 14) continue;
        if (type === 0 && hashN(seed, id) < 0.92) building(X0, Y0, X1, Y1, Math.round(nearSide ? 16 + hashN(seed, id, 2) * 26 : 28 + hashN(seed, id, 2) ** 1.5 * (60 + depth * 26)), id);
        else if (type === 2) for (let q = 0; q < 3; q++) { const tx = X0 + 6 + Math.floor(hashN(seed, id, q, 4) * (X1 - X0 - 12)), ty = Y0 + 6 + Math.floor(hashN(seed, id, q, 5) * (Y1 - Y0 - 12)); add(tx, ty, () => tree(tx, ty, 6 + (q & 1), GREEN[q & 1])); }
      }
    }
    // 広場の木、道の車と歩行者(少しだけ)
    for (let q = 0; q < 8; q++) { const tx = inner.x0 + 12 + Math.floor(hashN(seed, 70 + q) * (inner.x1 - inner.x0 - 24)), ty = hashN(seed, 80 + q) < 0.5 ? inner.y0 - 6 : inner.y1 + 4; if (hashN(seed, 90 + q) < 0.6) add(tx, ty, () => tree(tx, ty, 6, GREEN[0])); }
    const roadC = (lo, hi, k, sg) => (sg > 0 ? hi + k * P + (RW >> 1) : lo - k * P - (RW >> 1)); // k本目の道の真ん中
    for (let q = 0; q < 26; q++) {
      const k = Math.floor(hashN(seed, 100 + q) * 5), sg = hashN(seed, 120 + q) < 0.5 ? 1 : -1, lane = hashN(seed, 130 + q) < 0.5 ? -9 : 4, pos = Math.floor((hashN(seed, 140 + q) - 0.5) * 900);
      if (hashN(seed, 150 + q) < 0.5) car(roadC(inner.x0, inner.x1, k, sg) + lane, ((inner.y0 + inner.y1) >> 1) + pos, 'y');
      else car(((inner.x0 + inner.x1) >> 1) + pos, roadC(inner.y0, inner.y1, k, sg) + lane, 'x');
    }
    for (let q = 0; q < 16; q++) { const px0 = inner.x0 + Math.floor(hashN(seed, 200 + q) * (inner.x1 - inner.x0)), py0 = hashN(seed, 210 + q) < 0.5 ? inner.y0 - 8 : inner.y1 + 8; person(px0, py0); }
  } else {
    // 田舎: 草地の区画に木と家、道ばたに生け垣
    const cMin = Math.floor((Xmin + 8 - inner.x0) / P), cMax = Math.floor((Xmax - 8 - inner.x0) / P), dMin = Math.floor((Ymin + 8 - inner.y0) / P), dMax = Math.floor((Ymax - 8 - inner.y0) / P);
    for (let cx = cMin; cx <= cMax; cx++) for (let cy = dMin; cy <= dMax; cy++) {
      const X0 = inner.x0 + cx * P, Y0 = inner.y0 + cy * P;
      if (X0 + P > inner.x0 && X0 < inner.x1 && Y0 + P > inner.y0 && Y0 < inner.y1) continue;
      if (Math.abs(X0 + P / 2 - roadX0 - winding(Y0 + P / 2)) < 20) continue;
      const t = plotType(cx, cy), id = cx * 97 + cy;
      if (t === 2) {
        if (hashN(seed, id, 6) < 0.4) { const hx = X0 + 20 + Math.floor(hashN(seed, id, 7) * 20), hy = Y0 + 20 + Math.floor(hashN(seed, id, 8) * 30), roofC = [C('#a4503f'), C('#4f6a8f'), C('#6b6f78')][id & 1 ? 0 : (id & 2 ? 1 : 2)]; add(hx, hy, () => { ibox(hx, hy, hx + 26, hy + 20, 14, C('#d9cfb8'), C('#e3dac4'), C('#c4b99f'), (u, v) => ((u & 7) > 1 && (u & 7) < 5 && v > 4 && v < 10 ? (time === 'night' && hashN(seed, id, u >> 3) < 0.6 ? C('#f5c851') : C('#6f86a0')) : 0)); ibox(hx - 2, hy - 2, hx + 28, hy + 22, 17, roofC, roofC, roofC, 0, 14); ibox(hx + 4, hy + 3, hx + 22, hy + 17, 20, roofC, roofC, roofC, 0, 17); }); } // 家(屋根は2段の積み)
        for (let q = 0; q < 4; q++) { const tx = X0 + 8 + Math.floor(hashN(seed, id, q, 9) * (P - 16)), ty = Y0 + 8 + Math.floor(hashN(seed, id, q, 10) * (P - 16)); add(tx, ty, () => tree(tx, ty, 5 + (q % 3), GREEN[q & 1])); }
      }
      if (hashN(seed, id, 12) < 0.5) for (let Xh = X0 + 4; Xh < X0 + P - 4; Xh += 5) add(Xh, Y0 + 3, () => ibox(Xh, Y0 + 3, Xh + 5, Y0 + 6, 4, GREEN[0][1], GREEN[1][1], GREEN[0][2])); // 生け垣
    }
    for (let q = 0; q < 8; q++) { const tx = inner.x0 + 10 + Math.floor(hashN(seed, 300 + q) * (inner.x1 - inner.x0 - 20)), ty = hashN(seed, 310 + q) < 0.5 ? inner.y0 - 8 : inner.y1 + 6; add(tx, ty, () => tree(tx, ty, 6, GREEN[q & 1])); }
  }
  objs.sort((a, b) => a[0] - b[0]);
  for (const [, draw] of objs) draw();
  ctx.putImageData(img, 0, 0);
  return { canvas, x: x0, y: y0 };
}
