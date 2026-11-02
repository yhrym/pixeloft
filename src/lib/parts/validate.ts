/**
 * みんなのパーツ(髪型・服・小物のドット絵)の検査。純粋関数だけ。サーバー(API)とクライアント(エディタ)が同じものを使う。
 * 入力は信用しない: 欲しい項目だけを読んで新しいオブジェクトを作り、それ以外(__proto__ など)は捨てる。
 */
import { PAL } from "../../engine/sprites.js";

export type PartKind = "hair" | "ot" | "ac";
export const PART_KINDS: readonly PartKind[] = ["hair", "ot", "ac"];
/** 髪: 幅は14+2*pad。y=頭の上端からの位置(0以下=頭より上にはみ出す) */
export type HairData = { pad: number; y: number; f: string[]; b: string[] };
/** 服: 幅16・6行 */
export type OutfitData = { f: string[]; b: string[] };
/** 小物: 幅は14+2*(-x)。bは無くてもよい(後ろから見えない物) */
export type AccData = { x: number; y: number; hat: boolean; f: string[]; b: string[] | null };
export type PartData = HairData | OutfitData | AccData;
export type PartInput = { kind: PartKind; name: string; data: PartData };

export const NAME_MAX = 20;
/** コピーの名前。tmplの{name}に元の名前を入れる。NAME_MAX文字(コードポイント)に収まるよう、元の名前のほうを切る */
export const copyName = (tmpl: string, name: string) => tmpl.replace("{name}", [...name].slice(0, Math.max(0, NAME_MAX - [...tmpl.replace("{name}", "")].length)).join(""));
export const ROWS_MAX = 20;
export const HAIR_PAD_MAX = 4;
export const HAIR_Y_MIN = -6;
export const ACC_X_MIN = -4;
export const ACC_Y_MIN = -8;
export const ACC_Y_MAX = 24;
export const OUTFIT_W = 16;
export const OUTFIT_ROWS = 6;
/** 1人が持てる(消していない)パーツの数 */
export const PARTS_PER_USER = 50;

/** 役の文字(着ている人の色で塗られる) */
export const ROLE_CHARS: Record<PartKind, string> = { hair: "Hhj", ot: "CcoPp", ac: "HhjCcoPp" };
const ANYWHERE = "SsK";
// エンジンのoffice.jsがPALに足す床・物の色。ブラウザではそれが先に入っていることがあるので、どちらでも同じになるよう外す
const OFFICE_EXTRA = "09-;,:|\"`?_/";
const ALL_ROLES = "HhjCcoPpSsF";
/** 固定パレットの文字(役の文字は役の色になるので除く)。好きな色の文字(コード128以上)は含めない */
const FIXED = new Set(Object.keys(PAL).filter((k) => k.charCodeAt(0) < 128 && !ALL_ROLES.includes(k) && !OFFICE_EXTRA.includes(k)));
/** そのkindで使える文字('.'を除く) */
export const allowedChars = (kind: PartKind): Set<string> => new Set([...ROLE_CHARS[kind], ...ANYWHERE, ...FIXED]);

export type PartError = { key: string; vars?: Record<string, string | number> };
export type PartResult = { ok: true; part: PartInput } | { ok: false; error: PartError };
const bad = (key: string, vars?: PartError["vars"]): PartResult => ({ ok: false, error: { key, vars } });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** 絵(行の配列)を検査する。rows=[min,max]の行数、width=1行の幅 */
function rowsOk(v: unknown, rows: [number, number], width: number, chars: Set<string>): string[] | "shape" | "char" {
  if (!Array.isArray(v) || v.length < rows[0] || v.length > rows[1]) return "shape";
  const out: string[] = [];
  for (const r of v) {
    if (typeof r !== "string" || r.length !== width) return "shape";
    for (const ch of r) if (ch !== "." && !chars.has(ch)) return "char";
    out.push(r);
  }
  return out;
}

export function validatePart(input: unknown): PartResult {
  if (!isObj(input)) return bad("parts.err.shape");
  const kind = own(input, "kind");
  if (kind !== "hair" && kind !== "ot" && kind !== "ac") return bad("parts.err.kind");
  const nameRaw = own(input, "name");
  const name = typeof nameRaw === "string" ? nameRaw.replace(/\s+/g, " ").trim() : "";
  if ([...name].length < 1 || [...name].length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) return bad("parts.err.name", { max: NAME_MAX });
  const d = own(input, "data");
  if (!isObj(d)) return bad("parts.err.shape");
  const chars = allowedChars(kind);
  const fail = (r: "shape" | "char") => bad(`parts.err.${r}`);
  const hasPixel = (rows: string[]) => rows.some((r) => /[^.]/.test(r));

  if (kind === "ot") {
    const f = rowsOk(own(d, "f"), [OUTFIT_ROWS, OUTFIT_ROWS], OUTFIT_W, chars);
    if (typeof f === "string") return fail(f);
    const b = rowsOk(own(d, "b"), [OUTFIT_ROWS, OUTFIT_ROWS], OUTFIT_W, chars);
    if (typeof b === "string") return fail(b);
    if (!hasPixel(f) && !hasPixel(b)) return bad("parts.err.empty");
    return { ok: true, part: { kind, name, data: { f, b } } };
  }
  if (kind === "hair") {
    const pad = own(d, "pad"), y = own(d, "y");
    if (!isInt(pad, 0, HAIR_PAD_MAX) || !isInt(y, HAIR_Y_MIN, 0)) return bad("parts.err.range");
    const f = rowsOk(own(d, "f"), [1, ROWS_MAX], 14 + 2 * pad, chars);
    if (typeof f === "string") return fail(f);
    const b = rowsOk(own(d, "b"), [1, ROWS_MAX], 14 + 2 * pad, chars);
    if (typeof b === "string") return fail(b);
    if (!hasPixel(f) && !hasPixel(b)) return bad("parts.err.empty");
    return { ok: true, part: { kind, name, data: { pad, y, f, b } } };
  }
  const x = own(d, "x"), y = own(d, "y"), hat = own(d, "hat");
  if (!isInt(x, ACC_X_MIN, 0) || !isInt(y, ACC_Y_MIN, ACC_Y_MAX) || typeof hat !== "boolean") return bad("parts.err.range");
  const f = rowsOk(own(d, "f"), [1, ROWS_MAX], 14 - 2 * x, chars);
  if (typeof f === "string") return fail(f);
  const bRaw = own(d, "b");
  let b: string[] | null = null;
  if (bRaw !== undefined && bRaw !== null) {
    const r = rowsOk(bRaw, [1, ROWS_MAX], 14 - 2 * x, chars);
    if (typeof r === "string") return fail(r);
    b = r;
  }
  if (!hasPixel(f) && !(b && hasPixel(b))) return bad("parts.err.empty");
  return { ok: true, part: { kind, name, data: { x, y, hat, f, b } } };
}
