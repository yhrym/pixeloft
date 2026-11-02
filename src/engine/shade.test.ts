import assert from "node:assert/strict";
import test from "node:test";
import * as shadeMod from "./shade.js";
import * as spritesMod from "./sprites.js";
const shade = shadeMod as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sp = spritesMod as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const L = (hex: string) => shade.lightness(hex);

test("#rrggbbの判定は小文字6桁だけ", () => {
  assert.equal(shade.isHex("#a1b2c3"), true);
  for (const v of ["#A1B2C3", "#abc", "a1b2c3", "#a1b2c3d", "black", 5, null]) assert.equal(shade.isHex(v), false, String(v));
});

test("影・ハイライトの明るさの差は、選択肢の色どうしの差(中央値)に合っている", () => {
  const diffs = (list: any[][], from: string, to: string) => list.map((o) => L(sp.PAL[o[1][to]]) - L(sp.PAL[o[1][from]])).sort((a, b) => a - b); // eslint-disable-line @typescript-eslint/no-explicit-any
  const median = (a: number[]) => a[Math.floor(a.length / 2)];
  assert.ok(Math.abs(median(diffs(sp.HAIR_COLS, "H", "h")) - shade.SHADE_DL) < 0.03);
  assert.ok(Math.abs(median(diffs(sp.HAIR_COLS, "H", "j")) - shade.LIGHT_DL) < 0.03);
  assert.ok(Math.abs(median(diffs(sp.CLOTHES, "C", "c")) - shade.SHADE_DL) < 0.03);
  assert.ok(Math.abs(median(diffs(sp.PANTS, "P", "p")) - shade.SHADE_DL) < 0.03);
});

test("選択肢の色を作り直しても、影の明るさは元の選択肢から0.08以内", () => {
  for (const [, m, hex] of sp.HAIR_COLS) {
    const s = shade.shadeHair(hex);
    assert.ok(Math.abs(L(s.h) - L(sp.PAL[m.h])) < 0.08, `hair ${hex} h`);
    assert.ok(Math.abs(L(s.j) - L(sp.PAL[m.j])) < 0.12, `hair ${hex} j`);
  }
  for (const [, m, hex] of sp.CLOTHES) assert.ok(Math.abs(L(shade.shadeCloth(hex).c) - L(sp.PAL[m.c])) < 0.08, `cloth ${hex}`);
  for (const [, m, hex] of sp.PANTS) assert.ok(Math.abs(L(shade.shadePants(hex).p) - L(sp.PAL[m.p])) < 0.08, `pants ${hex}`);
});

test("端の色でも範囲に収まり、明るい服は柄の2色目が紺になる", () => {
  assert.equal(shade.shadeHair("#000000").h, "#000000");
  assert.equal(shade.shadeHair("#ffffff").j, "#ffffff");
  assert.equal(shade.shadeCloth("#ffffff").o, "N");
  assert.equal(shade.shadeCloth("#202020").o, undefined);
  assert.ok(shade.isHex(shade.shadeCloth("#123456").c));
});

test("mkMapは好きな色を128番以降に割り当て、同じ色は使い回す", () => {
  const a = sp.mkMap({ hc: "#336699", sk: "l", cl: "#336699", pt: "navy" });
  assert.ok(a.H.charCodeAt(0) >= 128 && a.C === a.H, "同じ色は同じ記号");
  assert.equal(sp.PAL[a.H], "#336699");
  assert.notEqual(a.h, a.H);
  assert.equal(a.P, "N"); // 選択肢の色はそのまま
  const before = sp.palState.n;
  sp.mkMap({ hc: "#336699", sk: "l", cl: "#336699", pt: "navy" });
  assert.equal(sp.palState.n, before);
  assert.equal(sp.mkMap({ hc: "#336699", sk: "l", cl: "teal", pt: "navy" }).C, "T");
});
