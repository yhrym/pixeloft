/** /parts の画面で使う共通部品(絵の置き場所・キャンバスへの描画・文言のキー) */
import { bodyStamps, mkMap, paintSprite, personStamps, shiftStamps } from "@/engine/sprites.js";
import type { PartKind } from "@/lib/parts/validate";

export type PartView = { id: string; kind: PartKind; name: string; data: unknown; createdById: string; createdByName: string };
export type Look = Record<"hair" | "hc" | "sk" | "cl" | "pt" | "ot" | "ac", string>;

/** 画面の文言のキー(サーバーのページがt()で作って渡す) */
export const PARTS_MSG_KEYS = [
  "parts.title", "parts.sub", "parts.kind.hair", "parts.kind.ot", "parts.kind.ac", "parts.new", "parts.by", "parts.edit", "parts.delete", "parts.deleteConfirm",
  "parts.empty", "parts.toOffice", "parts.toList", "parts.editor.new", "parts.editor.edit", "parts.name", "parts.front", "parts.back", "parts.tool.pencil",
  "parts.tool.eraser", "parts.tool.pick", "parts.clear", "parts.copy", "parts.roleColors", "parts.fixedColors", "parts.pad", "parts.y", "parts.hat",
  "parts.hasBack", "parts.preview", "parts.save", "parts.saving", "parts.network", "parts.hint",
  "parts.err.shape", "parts.err.kind", "parts.err.name", "parts.err.char", "parts.err.range", "parts.err.empty", "parts.err.limit", "parts.err.notFound", "parts.err.forbidden",
] as const;
export type Msgs = Record<string, string>;

/** エディタの描画範囲(世界の座標。体の左上が(0,0))と1マスの大きさ */
export const X0 = -4, W = 24, Y0 = -8, H = 36, S = 14;
export const ROWS_EDIT = 20;

/** パーツの絵の左上が世界のどこか、幅、行数 */
export function layout(kind: PartKind, o: { pad: number; x: number; y: number }) {
  if (kind === "hair") return { ox: 1 - o.pad, oy: o.y, w: 14 + 2 * o.pad, rows: ROWS_EDIT };
  if (kind === "ot") return { ox: 0, oy: 12, w: 16, rows: 6 };
  return { ox: 1 + o.x, oy: o.y, w: 14 - 2 * o.x, rows: ROWS_EDIT };
}

/** 座った人(前か後ろ)を、世界の座標(X0,Y0)を左上にして描く */
export function drawSitting(canvas: HTMLCanvasElement, look: Look, back: boolean, scale: number, bg?: string) {
  const map = mkMap(look);
  paintSprite(canvas, W, H, shiftStamps(personStamps({ ...look, map }, back, false), -X0, -Y0), bg, scale);
}

/** 一覧のサムネイル(全身。前か後ろ) */
export function drawBody(canvas: HTMLCanvasElement, look: Look, back: boolean, scale: number) {
  paintSprite(canvas, 24, 32, bodyStamps({ ...look, map: mkMap(look) }, back), "#ccd8e2", scale);
}
