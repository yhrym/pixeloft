// 好きな色(#rrggbb)から、影・ハイライトの色を作る(純粋関数。DOMにも触らない)。
// 差は今の選択肢の色どうしを測って決めた: 影は明るさ(HSL の L)が中央値で-0.14、ハイライトは+0.14。色相と彩度は変えない
// (測った値は test/shade.test.ts が選択肢の全色と比べる)
export const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);
export const SHADE_DL = -0.14, LIGHT_DL = 0.14;
export function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0;
  if (d) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
export function fromHsl([h, s, l]) {
  const a = s * Math.min(l, 1 - l), f = k => { const q = (k + h / 30) % 12; return l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}
export const shiftL = (hex, dl) => { const [h, s, l] = toHsl(hex); return fromHsl([h, s, Math.max(0, Math.min(1, l + dl))]); };
export const lightness = hex => toHsl(hex)[2];
// 髪: 本体H・影h・つやj
export const shadeHair = hex => ({ H: hex, h: shiftL(hex, SHADE_DL), j: shiftL(hex, LIGHT_DL) });
// 服: 本体C・影c。明るい色は柄の2色目oを紺(N)にする(選択肢の黄・白・ベージュと同じ)。値は #hex か パレットの記号
export const shadeCloth = hex => ({ C: hex, c: shiftL(hex, SHADE_DL), ...(lightness(hex) > 0.62 ? { o: 'N' } : null) });
export const shadePants = hex => ({ P: hex, p: shiftL(hex, SHADE_DL) });
