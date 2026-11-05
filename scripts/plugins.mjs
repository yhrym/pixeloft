// plugins/<id>/ を見て、取り込み用のファイルを src/plugins/generated/ に作る(プラグインが0個でも空のものを作る)
// 使い方: node scripts/plugins.mjs [入力のディレクトリ] [出力のディレクトリ]。だめなときは理由を出して終了コード1(出力は前のまま残す)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const find = (dir, name, exts) => exts.map(e => join(dir, name + e)).find(existsSync);
const body = {
  "catalog.js": "const defs = {};\nexport default defs;\n",
  "draw.js": "const defs = {};\nexport default defs;\n",
  "server.ts": 'import type { PluginServer } from "../types.ts";\nexport const servers: Record<string, PluginServer> = {};\n',
  "client.ts": 'import type { PluginClientSetup } from "../types.ts";\nexport const clients: { id: string; setup: PluginClientSetup }[] = [];\n',
  "i18n.json": '{ "ja": {}, "en": {} }\n',
  "thumbs.json": "{}\n",
};
const MAX_THUMB = 64 * 1024;

/**
 * 入力を全部調べてから出力を書く。だめなら理由の配列を持つErrorを投げ、出力には触らない
 * @param {string} [inDir]
 * @param {string} [outDir]
 */
export async function generate(inDir = join(root, "plugins"), outDir = join(root, "src/plugins/generated")) {
  const ids = existsSync(inDir) ? readdirSync(inDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : [];
  const errs = [], imp = { "catalog.js": [], "draw.js": [], "server.ts": [], "client.ts": [] }, text = { ja: {}, en: {} }, thumbs = {};
  const rel = p => relative(outDir, p).split("\\").join("/");
  for (const id of ids) {
    const dir = join(inDir, id), bad = m => errs.push(`plugins/${id}: ${m}`);
    if (!ID_RE.test(id)) { bad(`the folder name must match ${ID_RE}`); continue; }
    let catalogKeys = [];
    for (const name of ["catalog", "draw"]) {
      const f = find(dir, name, [".js"]);
      if (!f) continue;
      let defs;
      try { defs = (await import(pathToFileURL(f).href)).default; } catch (e) { errs.push(`${relative(root, f)}: cannot load (${e.message})`); continue; }
      if (typeof defs !== "object" || defs === null) { bad(`${name}.js must export default an object`); continue; }
      if (name === "catalog") catalogKeys = Object.keys(defs);
      for (const k of Object.keys(defs)) {
        if (!k.startsWith(id + ":")) bad(`key "${k}" in ${name}.js must start with "${id}:"`);
      }
      imp[name + ".js"].push([id, rel(f)]);
    }
    // サムネイル: thumbs/<名前>.png が <id>:<名前> の画像になる(npm run build:thumbs が作る)
    const td = join(dir, "thumbs");
    if (existsSync(td)) for (const f of readdirSync(td).filter(n => n.endsWith(".png")).sort()) {
      const key = `${id}:${f.slice(0, -4)}`, png = readFileSync(join(td, f));
      if (!catalogKeys.includes(key)) bad(`thumbs/${f} has no matching key "${key}" in catalog.js`);
      else if (png.length > MAX_THUMB) bad(`thumbs/${f} is ${png.length} bytes; the limit is ${MAX_THUMB}`);
      else thumbs[key] = "data:image/png;base64," + png.toString("base64");
    }
    const s = find(dir, "server", [".ts", ".js"]), c = find(dir, "client", [".ts", ".tsx", ".js"]);
    if (s) imp["server.ts"].push([id, rel(s)]);
    if (c) imp["client.ts"].push([id, rel(c)]);
    const keys = {}, have = ["ja", "en"].filter(l => existsSync(join(dir, l + ".json")));
    // 文言を持つなら両方(片方だけでは、その言語の画面でキーの文字列がそのまま出る)
    for (const lang of ["ja", "en"]) if (have.length === 1 && !have.includes(lang)) bad(`${lang}.json is missing (a plugin with text needs both ja.json and en.json)`);
    for (const lang of have) {
      const f = join(dir, lang + ".json");
      let j;
      try { j = JSON.parse(readFileSync(f, "utf8")); } catch (e) { bad(`cannot read ${lang}.json (${e.message})`); continue; }
      keys[lang] = Object.keys(j);
      for (const k of keys[lang]) if (!k.startsWith(`plugin.${id}.`) && !k.startsWith(`catalog.${id}:`)) bad(`key "${k}" in ${lang}.json must start with "plugin.${id}." or "catalog.${id}:"`);
      Object.assign(text[lang], j);
    }
    if (keys.ja && keys.en) {
      const only = (a, b) => a.filter(k => !b.includes(k));
      for (const [lang, other] of [["ja", "en"], ["en", "ja"]]) {
        const d = only(keys[lang], keys[other]);
        if (d.length) bad(`keys only in ${lang}.json (add them to ${other}.json): ${d.join(", ")}`);
      }
    }
  }
  if (errs.length) throw Object.assign(new Error(errs.join("\n")), { errors: errs });
  const v = i => "p" + i;
  const outs = { ...body };
  const w = (f, s) => { outs[f] = s; };
  const jsList = f => imp[f].map(([, p], i) => `import ${v(i)} from "${p}";`).join("\n");
  const spread = f => (imp[f].length ? `const defs = { ${imp[f].map((_, i) => "..." + v(i)).join(", ")} };\nexport default defs;\n` : body[f]);
  for (const f of ["catalog.js", "draw.js"]) if (imp[f].length) w(f, jsList(f) + "\n" + spread(f));
  if (imp["server.ts"].length) w("server.ts", `import type { PluginServer } from "../types.ts";\n${jsList("server.ts")}\nexport const servers: Record<string, PluginServer> = { ${imp["server.ts"].map(([id], i) => `${JSON.stringify(id)}: ${v(i)}`).join(", ")} };\n`);
  if (imp["client.ts"].length) w("client.ts", `import type { PluginClientSetup } from "../types.ts";\n${jsList("client.ts")}\nexport const clients: { id: string; setup: PluginClientSetup }[] = [${imp["client.ts"].map(([id], i) => `{ id: ${JSON.stringify(id)}, setup: ${v(i)} }`).join(", ")}];\n`);
  w("i18n.json", JSON.stringify(text, null, 2) + "\n");
  w("thumbs.json", JSON.stringify(thumbs, null, 2) + "\n");
  mkdirSync(outDir, { recursive: true });
  // 同じ中身なら書かない(next dev が無駄に再ビルドしない)
  for (const [f, s] of Object.entries(outs)) if (!existsSync(join(outDir, f)) || readFileSync(join(outDir, f), "utf8") !== s) writeFileSync(join(outDir, f), s);
  return ids;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const ids = await generate(process.argv[2] && resolve(process.argv[2]), process.argv[3] && resolve(process.argv[3]));
    console.log(`plugins: ${ids.length ? ids.join(", ") : "none"}`);
  } catch (e) {
    console.error(`plugins: ${e.message}`);
    process.exit(1);
  }
}
