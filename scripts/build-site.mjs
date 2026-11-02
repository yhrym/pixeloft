// ドキュメント・紹介サイトをdist-site/に作る。パスはすべて相対(GitHub Pagesのサブパス配信用)
//   node scripts/build-site.mjs [--with-editor]   --with-editorは手元確認用に dist-pages/ を dist-site/editor/ へ写す
import { build } from "esbuild";
import { Marked } from "marked";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const out = "dist-site";
const LANGS = ["ja", "en"];
const GITHUB = "https://github.com/yhrym/pixeloft";
const SITE = "https://yhrym.github.io/pixeloft/"; // og:imageだけ絶対URLが要る
const withEditor = process.argv.includes("--with-editor");

await rm(out, { recursive: true, force: true });
await mkdir(`${out}/assets/img`, { recursive: true });

// ---- クライアントJSとCSSのバンドル ----
await build({
  entryPoints: { site: "site/src/site.js", hero: "site/src/hero.js", fonts: "site/src/fonts.css" },
  outdir: `${out}/assets`,
  bundle: true, format: "esm", minify: true, target: "es2022", logLevel: "warning",
  loader: { ".woff2": "file", ".woff": "empty" }, assetNames: "[name]-[hash]",
});
await cp("site/assets/site.css", `${out}/assets/site.css`);
await cp("src/app/icon.svg", `${out}/assets/icon.svg`);
await cp("public/catalog-thumbs.png", `${out}/assets/img/catalog-thumbs.png`);
for (const f of await readdir("docs/images")) await cp(`docs/images/${f}`, `${out}/assets/img/${f}`);
for (const f of await readdir("site/assets/img").catch(() => [])) await cp(`site/assets/img/${f}`, `${out}/assets/img/${f}`);
for (const l of LANGS) await cp(`maps/sample.${l}.json`, `${out}/assets/sample.${l}.json`);
await writeFile(`${out}/.nojekyll`, "");

// ---- UIの文言 ----
const UI = {
  ja: {
    name: "日本語", other: "en", otherName: "English", docs: "ドキュメント", editor: "エディタ", search: "検索", searchPh: "ドキュメントを検索", noHit: "見つかりませんでした",
    theme: "テーマを切り替え", menu: "ページ一覧", toc: "このページの内容", prev: "前へ", next: "次へ", copy: "コピー", copied: "コピーしました", lang: "言語",
    siteDesc: "席に座るタイプの、ドット絵のバーチャルオフィス。セルフホストできるOSSで、間取りはブラウザで作れます。", skip: "本文へ移動", status: "pixeloft docs", license: "AGPL-3.0-only",
    editorOpen: "ブラウザでマップを作る →", docker: "Dockerで動かす", github: "GitHub ↗",
  },
  en: {
    name: "English", other: "ja", otherName: "日本語", docs: "Docs", editor: "Editor", search: "Search", searchPh: "Search the docs", noHit: "No results",
    theme: "Toggle theme", menu: "Pages", toc: "On this page", prev: "Previous", next: "Next", copy: "Copy", copied: "Copied", lang: "Language",
    siteDesc: "A seat-based virtual office in pixel art. Self-hosted, open source, with a floor-plan editor that runs in your browser.", skip: "Skip to content", status: "pixeloft docs", license: "AGPL-3.0-only",
    editorOpen: "Build your map in the browser →", docker: "Run it with Docker", github: "GitHub ↗",
  },
};

// ---- Markdown ----
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");

function front(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: m ? src.slice(m[0].length) : src };
}

// shortcut: 色付けは#コメントと行頭の$だけ。本物のハイライタは入れない
function codeHtml(text, lang) {
  const lines = esc(text).split("\n").map((l) => {
    if (/^\s*#/.test(l) && lang !== "md") return `<span class="c">${l}</span>`;
    if (/^\$ /.test(l)) return `<span class="p">$ </span>${l.slice(2).replace(/(\s#\s.*)$/, '<span class="c">$1</span>')}`;
    return l.replace(/(\s#\s.*)$/, '<span class="c">$1</span>');
  });
  return lines.join("\n");
}

function render(body) {
  const heads = [], used = new Set();
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens), raw = tokens.map((t) => t.raw ?? t.text ?? "").join("");
        let id = slugify(raw) || "section", n = 2;
        for (const base = id; used.has(id);) id = `${base}-${n++}`;
        used.add(id);
        if (depth === 2 || depth === 3) heads.push({ depth, id, text: raw.replace(/[`*]/g, "") });
        return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="#">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang || "").split(/\s/)[0];
        return `<div class="code"><div class="code-bar"><span>${esc(l || "text")}</span><button type="button" class="copy" data-copy>COPY</button></div><pre><code>${codeHtml(text, l)}</code></pre></div>\n`;
      },
      table(token) {
        const cell = (c, tag) => `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("");
        return `<div class="table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  const html = md.parse(body);
  // 検索用の本文: 見出しごとに区切る
  const sections = [];
  let cur = { h: "", a: "", x: [] };
  for (const tok of md.lexer(body)) {
    if (tok.type === "heading" && (tok.depth === 2 || tok.depth === 3)) {
      sections.push(cur);
      cur = { h: tok.text.replace(/[`*]/g, ""), a: "", x: [] };
    } else if (tok.type !== "heading" && tok.raw) cur.x.push(tok.raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, "").replace(/[`*|]|^#+\s/gm, " ").replace(/\s+/g, " ").trim());
  }
  sections.push(cur);
  // 見出しidを順に割り当てる(sections[0]は導入文)
  sections.slice(1).forEach((s, i) => { s.a = heads[i].id; });
  return { html, heads, sections: sections.map((s) => ({ h: s.h, a: s.a, x: s.x.join(" ") })) };
}

// ---- ページの枠 ----
const themeScript = `try{var t=localStorage.getItem("pixeloft-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function shell({ lang, base, path, title, desc, body, home = false, js = "" }) {
  const u = UI[lang];
  const altPath = path.replace(`${lang}/`, `${u.other}/`);
  return `<!doctype html>
<html lang="${lang}" data-base="${base}" data-lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}assets/img/office-hud.png">
<meta property="og:site_name" content="Pixeloft">
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" href="${base}assets/icon.svg">
<link rel="alternate" hreflang="${u.other}" href="${base}${altPath}">
<link rel="stylesheet" href="${base}assets/fonts.css">
<link rel="stylesheet" href="${base}assets/site.css">
${home ? `<link rel="stylesheet" href="${base}assets/hero.css">` : ""}
<script>${themeScript}</script>
</head>
<body class="${home ? "home" : "docs"}">
<a class="skip" href="#main">${u.skip}</a>
${nav({ lang, base, altPath, home })}
${body}
<script type="module" src="${base}assets/site.js"></script>
${js}
</body>
</html>
`;
}

function nav({ lang, base, altPath, home }) {
  const u = UI[lang];
  return `<header class="nav${home ? " on-hero" : ""}">
<div class="nav-in">
<a class="brand" href="${base}${lang}/"><img src="${base}assets/icon.svg" alt="" width="24" height="24"><span>Pixeloft</span></a>
<nav class="nav-links" aria-label="main">
<a href="${base}${lang}/getting-started/">${u.docs}</a>
<a href="${base}editor/">${u.editor}</a>
<a href="${GITHUB}" rel="noopener">${u.github}</a>
</nav>
<div class="nav-tools">
<button type="button" class="tool" data-search-open aria-label="${u.search}"><span class="ico">⌕</span><span class="lbl">${u.search}</span><kbd>/</kbd></button>
<a class="tool" href="${base}${altPath}" hreflang="${u.other}" aria-label="${u.lang}">${UI[u.other].name === "English" ? "EN" : "JA"}</a>
<button type="button" class="tool" data-theme-toggle aria-label="${u.theme}"><span class="ico theme-ico" aria-hidden="true"></span></button>
</div>
</div>
</header>
<dialog class="search" data-search><form method="dialog" class="search-box"><input type="search" placeholder="${u.searchPh}" aria-label="${u.search}" autocomplete="off" data-search-input><ul class="results" data-search-results role="listbox"></ul><p class="search-empty" data-search-empty hidden>${u.noHit}</p><template data-search-i18n data-nohit="${u.noHit}"></template></form></dialog>`;
}

// ---- ドキュメント ----
const pages = {};
for (const lang of LANGS) {
  const files = (await readdir(`site/content/${lang}`)).filter((f) => f.endsWith(".md"));
  pages[lang] = [];
  for (const f of files) {
    const { meta, body } = front(await readFile(`site/content/${lang}/${f}`, "utf8"));
    pages[lang].push({ slug: f.replace(/\.md$/, ""), title: meta.title, desc: meta.description || "", order: Number(meta.order ?? 99), ...render(body) });
  }
  pages[lang].sort((a, b) => a.order - b.order);
}

const index = {};
for (const lang of LANGS) {
  const u = UI[lang], list = pages[lang];
  index[lang] = [];
  for (const [i, p] of list.entries()) {
    const path = `${lang}/${p.slug}/`, base = "../../";
    const side = list.map((q) => `<a href="${base}${lang}/${q.slug}/"${q.slug === p.slug ? ' aria-current="page"' : ""}>${esc(q.title)}</a>`).join("\n");
    const toc = p.heads.map((h) => `<a class="d${h.depth}" href="#${h.id}">${esc(h.text)}</a>`).join("\n");
    const pv = list[i - 1], nx = list[i + 1];
    const body = `<div class="doc-wrap">
<aside class="side" aria-label="${u.docs}"><button type="button" class="side-toggle" data-side-toggle aria-expanded="false"><span>${u.menu}</span><span class="cur">${esc(p.title)}</span></button><nav class="side-list">${side}</nav></aside>
<main id="main" class="doc"><article>
<h1>${esc(p.title)}</h1>
${p.html}
</article>
<nav class="pager" aria-label="pager">${pv ? `<a class="prev" href="${base}${lang}/${pv.slug}/"><small>${u.prev}</small><span>${esc(pv.title)}</span></a>` : "<span></span>"}${nx ? `<a class="next" href="${base}${lang}/${nx.slug}/"><small>${u.next}</small><span>${esc(nx.title)}</span></a>` : "<span></span>"}</nav>
</main>
<aside class="toc" aria-label="${u.toc}"><p>${u.toc}</p>${toc}</aside>
</div>
<footer class="statusbar"><span>~ ${u.status} · /${lang}/${p.slug}</span><span class="r">${u.license} · <a href="${GITHUB}" rel="noopener">GitHub ↗</a></span></footer>`;
    const dir = `${out}/${lang}/${p.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, shell({ lang, base, path, title: `${p.title} | Pixeloft`, desc: p.desc, body }));
    for (const s of p.sections) if (s.x || s.h) index[lang].push({ p: p.title, u: `${lang}/${p.slug}/${s.a ? "#" + s.a : ""}`, h: s.h, x: s.x });
  }
  await writeFile(`${out}/assets/search-${lang}.json`, JSON.stringify(index[lang]));
}

// ---- ホーム ----
const HOME = {
  ja: {
    eyebrow: "セルフホストできるOSS · ドット絵 · 席に座る",
    h1a: "席に座れば、", h1b: "そこがオフィス。",
    lead: "歩き回らないバーチャルオフィスです。席を選んで座るだけで、誰がどの部屋にいるかが一目で分かります。docker compose up 1回で立ち上がり、間取りはブラウザで描けます。",
    caption: "動いているのは本物の描画エンジンです。人はみんな架空です。",
    s1: { k: "仕組み", h: "歩かない。だから、ちらっと見るだけで足りる。", paras: [
      ["席に座る。", "席を選んだら、そこにいるだけです。キャラクターが歩くのは席を移るときだけ。操作するものがないので、画面は横目で見られます。"],
      ["ポーリングで動く。", "表示中は4秒ごとに状態を取りに行き、隠れている間は60秒ごとのハートビートだけを送ります。WebSocketを使わないので、どんなリバースプロキシの後ろでも設定なしで動きます。"],
      ["監視はしない。", "見えるのは、誰がどの部屋にいるかと、作業中・集中・休憩・会議中のステータスだけ。席に何分座っているかも、最後に何かした時刻も出しません。この先も出しません。"],
    ], alt: "サンプルのオフィスの画面。左上にアプリ名、右上にメニュー、左下に自分のカード" },
    s2: { k: "マップエディタ", h: "Dockerを立てる前に、間取りだけ先に作れる。", p: "上から見た2Dの図面で部屋・壁・扉・置き物を配置すると、本番と同じエンジンで描いたアイソメのプレビューがその場で更新されます。下書きはブラウザの中だけに保存され、サーバーには何も送りません。", p2: "できあがったらJSONで書き出して、自分のインスタンスのエディタで読み込み、公開します。", cta: "ブラウザでマップを作る →", alt: "マップエディタの画面" },
    s3: { k: "着せ替えとパーツ", h: "髪も服も、色は自由。形は自分で描ける。", p: "髪・服・ズボンの色は自由に選べます。さらにドット絵のエディタで、髪型・服・小物を自分で描いて追加できます。描いたパーツは全員に共有され、着せ替えのパネルから誰でも使えます。", p2: "机にも飾りを置けるので、同じ席でも人によって雰囲気が変わります。", link: "着せ替えとパーツの使い方", alt: "席についているキャラクターの拡大" },
    s4: { k: "はじめかた", h: "3つのコマンドで、自分のオフィス。", steps: [
      ["クローンする", "git clone https://github.com/yhrym/pixeloft.git\ncd pixeloft"],
      ["起動する", "docker compose up -d"],
      ["開いて、サンプルで始める", "# ブラウザで開く\nhttp://localhost:3000/setup"],
    ], note: "/setupで最初の管理者を作り、マップは「サンプルを使う」を選べばすぐ試せます。", more: "くわしい手順" },
    footerNote: "席に座るタイプのバーチャルオフィス。AGPL-3.0-onlyのOSSです。",
  },
  en: {
    eyebrow: "self-hosted · open source · pixel art",
    h1a: "Pick a seat.", h1b: "You're in the office.",
    lead: "A virtual office where nobody walks around. Choose a desk, sit down, and everyone can see at a glance who is in which room. One docker compose up starts it, and you draw the floor plan in your browser.",
    caption: "This is the real rendering engine. Every person here is fictional.",
    s1: { k: "How it works", h: "No walking, so a glance is all it takes.", paras: [
      ["Seats, not avatars on a stroll.", "You pick a seat and stay there. Characters only walk when someone moves to another seat. There is nothing to steer, so the screen is fine in the corner of your eye."],
      ["Polling, not WebSocket.", "The page polls every 4 seconds while it is visible and sends a heartbeat every 60 seconds while hidden. It works behind any reverse proxy with no special configuration."],
      ["Presence without surveillance.", "You see who is in which room and their status: working, focus, break, in a meeting. You do not see how long someone has been at their desk or when they last did anything, and you never will."],
    ], alt: "The sample office: app name at the top left, menu at the top right, your own card at the bottom left" },
    s2: { k: "Map editor", h: "Draw the floor plan before you run anything.", p: "Lay out rooms, walls, doors and furniture on a top-down 2D plan, and an isometric preview drawn by the same engine as the app updates as you go. Your draft lives in the browser only. Nothing is sent to a server.", p2: "When it looks right, export the JSON, import it in your own instance's editor and publish.", cta: "Build your map in the browser →", alt: "The map editor" },
    s3: { k: "Wardrobe and parts", h: "Any color you like, and shapes you draw yourself.", p: "Pick free colors for hair, clothes and trousers. Then open the pixel editor and draw your own hairstyles, outfits and accessories. Parts you draw are shared with everyone and show up in the dress-up panel.", p2: "Desks get decorations too, so two people at the same kind of seat still look different.", link: "How wardrobe and parts work", alt: "Close-up of seated characters" },
    s4: { k: "Quick start", h: "Three commands to your own office.", steps: [
      ["Clone", "git clone https://github.com/yhrym/pixeloft.git\ncd pixeloft"],
      ["Start", "docker compose up -d"],
      ["Open it and start from the sample", "# open in your browser\nhttp://localhost:3000/setup"],
    ], note: "Create the first admin on /setup and pick \"Use the sample\" for the map to try it right away.", more: "Full instructions" },
    footerNote: "A seat-based virtual office. Open source under AGPL-3.0-only.",
  },
};

const code = (t) => `<div class="code term"><div class="code-bar"><span>terminal</span><button type="button" class="copy" data-copy>COPY</button></div><pre><code>${codeHtml(t, "sh")}</code></pre></div>`;

for (const lang of LANGS) {
  const u = UI[lang], h = HOME[lang], base = "../", path = `${lang}/`;
  const gs = `${base}${lang}/getting-started/`;
  const body = `<section class="hero" id="top">
<div class="hero-office vo-page" id="hero-office" data-map="${base}assets/sample.${lang}.json" aria-hidden="true"></div>
<div class="hero-dim" aria-hidden="true"></div>
<div class="hero-copy">
<p class="eyebrow">${h.eyebrow}</p>
<h1><span>${h.h1a}</span><span class="acc">${h.h1b}</span></h1>
<p class="lead">${h.lead}</p>
<div class="cta-row"><a class="cta" href="${base}editor/">${u.editorOpen}</a><a class="quiet" href="${gs}">${u.docker}</a><a class="quiet" href="${GITHUB}" rel="noopener">${u.github}</a></div>
</div>
<p class="hero-cap" aria-hidden="true">${h.caption}</p>
</section>
<main id="main">
<section class="band" id="what">
<div class="band-in split">
<div class="txt"><p class="kicker">${h.s1.k}</p><h2>${h.s1.h}</h2>
${h.s1.paras.map(([a, b]) => `<div class="para"><h3>${a}</h3><p>${b}</p></div>`).join("")}
</div>
<figure class="vis sticky"><img src="${base}assets/img/office-hud.png" width="1200" height="760" alt="${h.s1.alt}" loading="lazy"></figure>
</div>
</section>
<section class="band alt" id="editor">
<div class="band-in wide">
<div class="txt center"><p class="kicker">${h.s2.k}</p><h2>${h.s2.h}</h2><p>${h.s2.p}</p><p>${h.s2.p2}</p><p><a class="cta" href="${base}editor/">${h.s2.cta}</a></p></div>
<figure class="vis shot"><img src="${base}assets/img/editor-${lang}.png" width="1440" height="900" alt="${h.s2.alt}" loading="lazy"></figure>
<div class="thumbs" aria-hidden="true"></div>
</div>
</section>
<section class="band" id="wardrobe">
<div class="band-in split rev">
<figure class="vis crop"><div class="crop-img" role="img" aria-label="${h.s3.alt}"></div></figure>
<div class="txt"><p class="kicker">${h.s3.k}</p><h2>${h.s3.h}</h2><p>${h.s3.p}</p><p>${h.s3.p2}</p><p><a class="more" href="${base}${lang}/wardrobe/">${h.s3.link} →</a></p></div>
</div>
</section>
<section class="band alt" id="start">
<div class="band-in">
<div class="txt center"><p class="kicker">${h.s4.k}</p><h2>${h.s4.h}</h2></div>
<ol class="steps">
${h.s4.steps.map(([t, c], i) => `<li><div class="num" aria-hidden="true">${i + 1}</div><div class="step-body"><h3>${t}</h3>${code(c)}</div></li>`).join("\n")}
</ol>
<p class="steps-note">${h.s4.note} <a class="more" href="${gs}">${h.s4.more} →</a></p>
</div>
</section>
</main>
<footer class="foot">
<div class="foot-in">
<div><a class="brand" href="${base}${lang}/"><img src="${base}assets/icon.svg" alt="" width="24" height="24"><span>Pixeloft</span></a><p>${h.footerNote}</p></div>
<nav aria-label="footer"><a href="${gs}">${u.docs}</a><a href="${base}editor/">${u.editor}</a><a href="${GITHUB}" rel="noopener">GitHub ↗</a><span>${u.license}</span></nav>
<nav aria-label="${u.lang}"><a href="${base}ja/" ${lang === "ja" ? 'aria-current="true"' : ""} hreflang="ja">日本語</a><a href="${base}en/" ${lang === "en" ? 'aria-current="true"' : ""} hreflang="en">English</a></nav>
</div>
</footer>`;
  await mkdir(`${out}/${lang}`, { recursive: true });
  await writeFile(`${out}/${lang}/index.html`, shell({
    lang, base, path, title: lang === "ja" ? "Pixeloft | 席に座るバーチャルオフィス" : "Pixeloft | A seat-based virtual office", desc: u.siteDesc, body, home: true,
    js: `<script type="module" src="${base}assets/hero.js"></script>`,
  }));
}

// ---- ルート: 言語で振り分け(JSなしはリンク) ----
await writeFile(`${out}/index.html`, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pixeloft</title>
<meta name="description" content="${esc(UI.en.siteDesc)}">
<meta property="og:title" content="Pixeloft">
<meta property="og:description" content="${esc(UI.en.siteDesc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}assets/img/office-hud.png">
<link rel="icon" type="image/svg+xml" href="assets/icon.svg">
<link rel="alternate" hreflang="ja" href="ja/">
<link rel="alternate" hreflang="en" href="en/">
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:12px;background:#0c1226;color:#fbf9f3;font:16px system-ui,sans-serif;text-align:center}a{color:#f4c651;font-size:20px}</style>
<script>location.replace((navigator.language||"").toLowerCase().indexOf("ja")===0?"ja/":"en/")</script>
</head>
<body>
<p>Pixeloft</p>
<p><a href="ja/">日本語</a> · <a href="en/">English</a></p>
</body>
</html>
`);

if (withEditor) await cp("dist-pages", `${out}/editor`, { recursive: true });
console.log(`site: ${LANGS.map((l) => `${l}=${pages[l].length} pages`).join(", ")}${withEditor ? ", editor copied" : ""}`);
