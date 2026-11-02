// GitHub Pages版のエディタをdist-pages/に作る。パスはすべて相対(サブパス配信用)
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const out = "dist-pages";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: { main: "src/pages-editor/main.tsx", preview: "src/pages-editor/preview.tsx" },
  outdir: out,
  bundle: true,
  format: "esm",
  minify: true,
  jsx: "automatic",
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
  // フォントはdist-pages直下にコピー(CSSからの相対参照)
  loader: { ".woff2": "file", ".woff": "empty" }, // woff2だけ配る(古い形式は使わない)
  assetNames: "[name]-[hash]",
  logLevel: "warning",
});

// esbuildが出したmain.cssはエンジンとフォントのCSS。Tailwindは別に作って後ろに足す
const src = "src/pages-editor/app.css";
const tw = await postcss([tailwind()]).process(await readFile(src, "utf8"), { from: src });
await writeFile(`${out}/app.css`, tw.css);
for (const n of ["index", "preview"]) {
  const html = (await readFile(`src/pages-editor/${n}.html`, "utf8")).replace(/(<link rel="stylesheet" href="[^"]+">)/, '<link rel="stylesheet" href="app.css">\n$1');
  await writeFile(`${out}/${n}.html`, html);
}
await cp("src/app/icon.svg", `${out}/icon.svg`); // アプリのアイコンをそのまま使う
await cp("src/pages-editor/.nojekyll", `${out}/.nojekyll`).catch(() => writeFile(`${out}/.nojekyll`, ""));
for (const f of ["catalog-thumbs.png", "catalog-thumbs.json"]) await cp(`public/${f}`, `${out}/${f}`); // エディタのサムネイル(npm run build:thumbsで作る)
