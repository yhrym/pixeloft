import assert from "node:assert/strict";
import test from "node:test";
import { LOOK_OPTIONS, parseAction, toLook } from "./presence.ts";
import * as spritesMod from "../../engine/sprites.js";
// エンジンはJSなので型は見ない
const sprites = spritesMod as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test("きせかえの選択肢はサーバーとクライアントで同じ記号", () => {
  const client: Record<string, [string, ...unknown[]][]> = {
    hair: sprites.HAIRS, hc: sprites.HAIR_COLS, sk: sprites.SKINS, cl: sprites.CLOTHES, pt: sprites.PANTS, ot: sprites.OUTFITS, ac: sprites.ACCS,
  };
  for (const [k, list] of Object.entries(LOOK_OPTIONS)) assert.deepEqual(client[k].map(([v]) => v).sort(), [...list].sort(), k);
  // 既定値(服の種類・小物を補うときの値)は一覧の先頭
  assert.equal(sprites.OUTFITS[0][0], "tee");
  assert.equal(sprites.ACCS[0][0], "none");
});

test("サーバーは全ての髪型・服・小物のIDを受け入れる", () => {
  const base = { hair: "short", hc: "black", sk: "pl", cl: "teal", pt: "navy", ot: "tee", ac: "none" };
  for (const [key, values] of Object.entries(LOOK_OPTIONS)) for (const value of values) {
    const look = toLook({ ...base, [key]: value });
    assert.equal(look?.[key as keyof typeof base], value, `${key}: ${value}`);
    assert.equal(parseAction({ type: "profile", look }).type, "profile", `${key}: ${value} profile action`);
  }
});

const base = { hair: "short", hc: "black", sk: "pl", cl: "teal", pt: "navy", ot: "tee", ac: "none" };

test("髪・服・ズボンは#rrggbbも受け付け(小文字にそろえる)、肌は選択肢だけ", () => {
  assert.deepEqual(toLook({ ...base, hc: "#A1B2C3", cl: "#00ff00", pt: "#000000" }), { ...base, hc: "#a1b2c3", cl: "#00ff00", pt: "#000000" });
  for (const bad of ["#abc", "#12345g", "crimson", "#1234567", "# 12345", "#12345"]) assert.equal(toLook({ ...base, hc: bad }), null, bad);
  assert.equal(toLook({ ...base, sk: "#ffffff" }), null);
});

test("u:<id>は、その種類の(消されていない)パーツがあるときだけ受け付け、なければその項目だけ既定に戻す", () => {
  const has = (kind: string, id: string) => (kind === "hair" && id === "abc123") || (kind === "ac" && id === "acc1");
  assert.equal(toLook({ ...base, hair: "u:abc123" }, has)?.hair, "u:abc123");
  assert.equal(toLook({ ...base, ac: "u:acc1" }, has)?.ac, "u:acc1");
  // 消された・種類が違う・知らないid
  assert.equal(toLook({ ...base, hair: "u:gone" }, has)?.hair, "short");
  assert.equal(toLook({ ...base, ot: "u:abc123" }, has)?.ot, "tee");
  assert.equal(toLook({ ...base, ac: "u:abc123" }, has)?.ac, "none");
  // 判定を渡さなければ、パーツは無いものとして扱う。ほかの項目は残る
  assert.deepEqual(toLook({ ...base, hair: "u:abc123", hc: "#112233" }), { ...base, hc: "#112233" });
  // 形の合わない参照は不正(既定に戻すのは、形が正しいu:だけ)
  assert.equal(toLook({ ...base, hair: "u:../x" }, () => true), null);
  assert.equal(toLook({ ...base, hair: "u:" }, () => true), null);
});

test("profileの操作は、パーツ判定を渡して検査する", () => {
  const a = parseAction({ type: "profile", look: { ...base, hair: "u:abc123", cl: "#ff0000" } }, () => true);
  assert.equal(a.type === "profile" && a.look?.hair, "u:abc123");
  const b = parseAction({ type: "profile", look: { ...base, hair: "u:abc123" } });
  assert.equal(b.type === "profile" && b.look?.hair, "short");
});
