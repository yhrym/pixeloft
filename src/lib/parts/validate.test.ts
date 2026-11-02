import assert from "node:assert/strict";
import test from "node:test";
import { copyName, validatePart } from "./validate.ts";

const row = (w: number, ch = ".") => ch.repeat(w);
const hair = (over: Record<string, unknown> = {}) => ({ kind: "hair", name: "テスト", data: { pad: 1, y: -2, f: [row(16, "H"), row(16)], b: [row(16, "h")], ...over } });
const outfit = (over: Record<string, unknown> = {}) => ({ kind: "ot", name: "服", data: { f: Array(6).fill(row(16, "C")), b: Array(6).fill(row(16, "c")), ...over } });
const acc = (over: Record<string, unknown> = {}) => ({ kind: "ac", name: "帽子", data: { x: -1, y: -2, hat: true, f: [row(16, "R")], ...over } });
const err = (v: unknown) => { const r = validatePart(v); return r.ok ? "ok" : r.error.key; };

test("正しい髪・服・小物は通り、小物のbは無くてよい", () => {
  assert.equal(err(hair()), "ok");
  assert.equal(err(outfit()), "ok");
  assert.equal(err(acc()), "ok");
  const r = validatePart(acc());
  assert.ok(r.ok && r.part.kind === "ac" && (r.part.data as { b: unknown }).b === null);
});

test("名前は1〜20文字(前後の空白は落とす)", () => {
  assert.equal(err({ ...hair(), name: "" }), "parts.err.name");
  assert.equal(err({ ...hair(), name: "   " }), "parts.err.name");
  assert.equal(err({ ...hair(), name: "あ".repeat(20) }), "ok");
  assert.equal(err({ ...hair(), name: "あ".repeat(21) }), "parts.err.name");
  assert.equal(err({ ...hair(), name: 5 }), "parts.err.name");
  const r = validatePart({ ...hair(), name: "  ab  " });
  assert.ok(r.ok && r.part.name === "ab");
});

test("髪: 幅は14+2*pad、padは0〜4、行は20まで", () => {
  assert.equal(err(hair({ pad: 0, f: [row(14, "H")], b: [row(14, "H")] })), "ok");
  assert.equal(err(hair({ pad: 4, f: [row(22, "H")], b: [row(22, "H")] })), "ok");
  assert.equal(err(hair({ pad: 5, f: [row(24, "H")], b: [row(24, "H")] })), "parts.err.range");
  assert.equal(err(hair({ pad: 1.5 })), "parts.err.range");
  assert.equal(err(hair({ f: [row(15, "H")] })), "parts.err.shape");
  assert.equal(err(hair({ f: Array(20).fill(row(16, "H")) })), "ok");
  assert.equal(err(hair({ f: Array(21).fill(row(16, "H")) })), "parts.err.shape");
  assert.equal(err(hair({ f: [] })), "parts.err.shape");
  assert.equal(err(hair({ y: 1 })), "parts.err.range");
  assert.equal(err(hair({ y: -7 })), "parts.err.range");
});

test("服: 幅16・6行ちょうど", () => {
  assert.equal(err(outfit({ f: Array(5).fill(row(16, "C")) })), "parts.err.shape");
  assert.equal(err(outfit({ f: Array(6).fill(row(15, "C")) })), "parts.err.shape");
  assert.equal(err(outfit({ b: Array(7).fill(row(16, "C")) })), "parts.err.shape");
});

test("小物: xは-4〜0で幅は14-2x、hatは真偽値", () => {
  assert.equal(err(acc({ x: 0, f: [row(14, "R")] })), "ok");
  assert.equal(err(acc({ x: 1, f: [row(12, "R")] })), "parts.err.range");
  assert.equal(err(acc({ x: -5, f: [row(24, "R")] })), "parts.err.range");
  assert.equal(err(acc({ hat: "yes" })), "parts.err.range");
  assert.equal(err(acc({ y: 25 })), "parts.err.range");
  assert.equal(err(acc({ b: [row(14, "R")] })), "parts.err.shape");
  assert.equal(err(acc({ b: [row(16, "R")] })), "ok");
});

test("使える文字: 役の文字・SsK・固定パレット。役の文字は種類ごと", () => {
  assert.equal(err(hair({ f: [row(16, "j")] })), "ok");
  assert.equal(err(hair({ f: [row(16, "K")] })), "ok");
  assert.equal(err(hair({ f: [row(16, "R")] })), "ok"); // 固定パレット
  assert.equal(err(hair({ f: [row(16, "C")] })), "parts.err.char"); // 服の役は髪では使えない
  assert.equal(err(outfit({ f: Array(6).fill(row(16, "H")) })), "parts.err.char");
  assert.equal(err(outfit({ f: Array(6).fill(row(16, "P")) })), "ok");
  assert.equal(err(hair({ f: [row(16, "!")] })), "parts.err.char");
  assert.equal(err(hair({ f: [row(16, "あ")] })), "parts.err.char");
  assert.equal(err(hair({ f: [row(16, "\u0080")] })), "parts.err.char"); // 好きな色の文字は絵に使えない
  assert.equal(err(hair({ f: [row(16, "0")] })), "parts.err.char"); // office.jsが足す床の色
});

test("何も描かれていないものと、不正な形は通らない", () => {
  assert.equal(err(hair({ f: [row(16)], b: [row(16)] })), "parts.err.empty");
  assert.equal(err(null), "parts.err.shape");
  assert.equal(err([]), "parts.err.shape");
  assert.equal(err({ kind: "x", name: "a", data: {} }), "parts.err.kind");
  assert.equal(err({ kind: "hair", name: "a" }), "parts.err.shape");
  assert.equal(err({ kind: "hair", name: "a", data: { pad: 0, y: 0, f: "HHHH", b: [] } }), "parts.err.shape");
});

test("__proto__などは読まず、余計な項目は捨てる", () => {
  const evil = JSON.parse('{"kind":"hair","name":"a","__proto__":{"kind":"ot"},"data":{"pad":0,"y":0,"f":["HHHHHHHHHHHHHH"],"b":["HHHHHHHHHHHHHH"],"__proto__":{"pad":9},"extra":1}}');
  const r = validatePart(evil);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.part.data).sort(), ["b", "f", "pad", "y"]);
  assert.equal(({} as Record<string, unknown>).pad, undefined);
  assert.equal(err(JSON.parse('{"__proto__":{"kind":"hair"},"name":"a","data":{}}')), "parts.err.kind");
});

test("コピーの名前は20文字に収める(元の名前を切り、絵文字などは1文字と数える)", () => {
  assert.equal(copyName("{name}のコピー", "帽子"), "帽子のコピー");
  assert.equal(copyName("Copy of {name}", "Cap"), "Copy of Cap");
  assert.equal(copyName("{name}のコピー", "あ".repeat(20)), "あ".repeat(16) + "のコピー");
  assert.equal(copyName("Copy of {name}", "x".repeat(20)), "Copy of " + "x".repeat(12));
  assert.equal(copyName("{name}のコピー", "😀".repeat(20)), "😀".repeat(16) + "のコピー");
});
