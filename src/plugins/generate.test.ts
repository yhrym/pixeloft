import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generate } from "../../scripts/plugins.mjs";

/** 仮のプラグインのディレクトリを作る。files: "<id>/<ファイル名>" → 中身 */
function setup(files: Record<string, string | Buffer>) {
  const dir = mkdtempSync(join(tmpdir(), "plug-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(dir, "in", p.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(join(dir, "in", p), body);
  }
  mkdirSync(join(dir, "in"), { recursive: true });
  return { inDir: join(dir, "in"), outDir: join(dir, "out") };
}
const def = (key: string) => `export default { "${key}": { dirs: ["x+"], props: {} } };`;
const tx = (id: string) => JSON.stringify({ [`plugin.${id}.name`]: "n", [`catalog.${id}:a`]: "a" });
const fails = async (files: Record<string, string | Buffer>, re: RegExp) => {
  const { inDir, outDir } = setup(files);
  await assert.rejects(generate(inDir, outDir), re);
};

test("正しいプラグイン: 取り込み用のファイルができる", async () => {
  const { inDir, outDir } = setup({ "demo/catalog.js": def("demo:a"), "demo/ja.json": tx("demo"), "demo/en.json": tx("demo"), "demo/server.ts": "export default {};" });
  assert.deepEqual(await generate(inDir, outDir), ["demo"]);
  assert.match(readFileSync(join(outDir, "catalog.js"), "utf8"), /plugins\/demo\/catalog\.js|demo\/catalog\.js/);
  assert.match(readFileSync(join(outDir, "server.ts"), "utf8"), /"demo"/);
  assert.equal(JSON.parse(readFileSync(join(outDir, "i18n.json"), "utf8")).ja["plugin.demo.name"], "n");
});

test("プラグインが0個でも空のものを作る", async () => {
  const { inDir, outDir } = setup({});
  assert.deepEqual(await generate(inDir, outDir), []);
  for (const f of ["catalog.js", "draw.js", "server.ts", "client.ts", "i18n.json", "thumbs.json"]) assert.ok(readFileSync(join(outDir, f), "utf8").length > 0, f);
});

test("idの形が違う", () => fails({ "Bad_Id/catalog.js": def("Bad_Id:a") }, /Bad_Id.*folder name must match/));
test("catalog.jsのキーの頭が違う", () => fails({ "demo/catalog.js": def("other:a") }, /key "other:a" in catalog\.js must start with "demo:"/));
test("文言のキーの頭が違う", () => fails({ "demo/ja.json": JSON.stringify({ "app.name": "x" }), "demo/en.json": JSON.stringify({ "app.name": "x" }) }, /key "app\.name" in ja\.json must start with "plugin\.demo\." or "catalog\.demo:"/));
test("jaとenのキーが違う", () => fails({ "demo/ja.json": tx("demo"), "demo/en.json": JSON.stringify({ "plugin.demo.name": "n" }) }, /keys only in ja\.json.*catalog\.demo:a/));
test("enのほうにだけあるキーも出す", () => fails({ "demo/ja.json": JSON.stringify({ "plugin.demo.name": "n" }), "demo/en.json": tx("demo") }, /keys only in en\.json.*catalog\.demo:a/));
test("ja.jsonかen.jsonの片方しかない", () => fails({ "demo/ja.json": tx("demo") }, /en\.json is missing/));
test("catalog.jsの構文エラーはファイル名つき", () => fails({ "demo/catalog.js": "export default {" }, /demo\/catalog\.js: cannot load/));

test("thumbs/<名前>.png がデータURLとして入る", async () => {
  const { inDir, outDir } = setup({ "demo/catalog.js": def("demo:a"), "demo/thumbs/a.png": Buffer.from("png!") });
  await generate(inDir, outDir);
  assert.deepEqual(JSON.parse(readFileSync(join(outDir, "thumbs.json"), "utf8")), { "demo:a": "data:image/png;base64," + Buffer.from("png!").toString("base64") });
});
test("thumbsの名前がcatalog.jsのキーに無い", () => fails({ "demo/catalog.js": def("demo:a"), "demo/thumbs/b.png": Buffer.from("x") }, /thumbs\/b\.png has no matching key "demo:b"/));
test("thumbsが大きすぎる", () => fails({ "demo/catalog.js": def("demo:a"), "demo/thumbs/a.png": Buffer.alloc(64 * 1024 + 1) }, /thumbs\/a\.png is 65537 bytes/));
test("失敗したときは前の出力を残す", async () => {
  const ok = setup({ "demo/catalog.js": def("demo:a") });
  await generate(ok.inDir, ok.outDir);
  const before = readFileSync(join(ok.outDir, "catalog.js"), "utf8");
  mkdirSync(join(ok.inDir, "oth"));
  writeFileSync(join(ok.inDir, "oth/catalog.js"), "export default {"); // 同じファイルの再importはキャッシュされるので別のプラグインで壊す
  await assert.rejects(generate(ok.inDir, ok.outDir), /cannot load/);
  assert.equal(readFileSync(join(ok.outDir, "catalog.js"), "utf8"), before);
});
test("失敗したときは出力のディレクトリを作らない", async () => {
  const { inDir, outDir } = setup({ "Bad_Id/catalog.js": def("Bad_Id:a") });
  await assert.rejects(generate(inDir, outDir));
  assert.equal(existsSync(outDir), false);
});

test("examples/ の例が取り込める", async () => {
  const outDir = join(mkdtempSync(join(tmpdir(), "plug-")), "out");
  assert.deepEqual(await generate(new URL("../../examples", import.meta.url).pathname, outDir), ["hello"]);
});
