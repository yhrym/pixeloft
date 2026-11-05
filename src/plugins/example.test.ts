import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// examples/hello/ と、ページのコードブロックがずれないようにする。コメントは言語ごとに違うので外して比べる
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const norm = (s: string) => s.split("\n").map((l) => l.replace(/\s*\/\/.*$/, "").trimEnd()).filter(Boolean).join("\n").replace(/test\("[^"]*"/g, "test(\"");
const blocks = (page: string, heading: string) => {
  const sec = read(page).split(`## ${heading}`)[1].split("\n## ")[0];
  return [...sec.matchAll(/```\w+\n([\s\S]*?)```/g)].map((m) => m[1]);
};
const files = ["catalog.js", "draw.js", "server.ts", "client.ts", "ja.json", "en.json"];

for (const [page, whole, tests] of [["ja", "通しの例", "テストを書く"], ["en", "Full example", "Writing tests"]]) {
  test(`${page}のページのhelloの例が examples/hello と同じ`, () => {
    const b = blocks(`../../site/content/${page}/plugins.md`, whole);
    assert.equal(b.length, files.length);
    files.forEach((f, i) => assert.equal(norm(b[i]), norm(read(`../../examples/hello/${f}`)), f));
    assert.equal(norm(blocks(`../../site/content/${page}/plugins.md`, tests)[0]), norm(read("../../examples/hello/server.test.ts")), "server.test.ts");
  });
}
