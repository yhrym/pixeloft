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
for (const f of await readdir("docs/images")) await cp(`docs/images/${f}`, `${out}/assets/img/${f}`);
for (const f of await readdir("site/assets/img").catch(() => [])) await cp(`site/assets/img/${f}`, `${out}/assets/img/${f}`);
for (const l of LANGS) await cp(`maps/sample.${l}.json`, `${out}/assets/sample.${l}.json`);
await writeFile(`${out}/.nojekyll`, "");

// ---- UIの文言 ----
const UI = {
  ja: {
    name: "日本語", other: "en", otherName: "English", docs: "ドキュメント", editor: "エディタ", search: "検索", searchPh: "ドキュメントを検索", noHit: "見つかりませんでした",
    theme: "テーマを切り替え", menu: "ページ一覧", toc: "このページの内容", prev: "前へ", next: "次へ", copy: "コピー", copied: "コピーしました", lang: "言語",
    siteDesc: "席に座るとチームの居場所とステータスが見えて、「ちょっといい？」やチャットで声をかけられる、セルフホストのバーチャルオフィスです。", skip: "本文へ移動", status: "pixeloft docs", license: "AGPL-3.0-only",
    editorOpen: "ブラウザでオフィスの間取りを作る →", docker: "Dockerで動かす", github: "GitHub ↗",
  },
  en: {
    name: "English", other: "ja", otherName: "日本語", docs: "Docs", editor: "Editor", search: "Search", searchPh: "Search the docs", noHit: "No results",
    theme: "Toggle theme", menu: "Pages", toc: "On this page", prev: "Previous", next: "Next", copy: "Copy", copied: "Copied", lang: "Language",
    siteDesc: "A self-hosted virtual office where you can see where teammates are and what they're up to, and reach them with \"Got a minute?\" or room chat.", skip: "Skip to content", status: "pixeloft docs", license: "AGPL-3.0-only",
    editorOpen: "Plan your office layout in the browser →", docker: "Run it with Docker", github: "GitHub ↗",
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
    eyebrow: "OSS・セルフホストのバーチャルオフィス",
    h1a: "自分でつくる", h1b: "バーチャルオフィス",
    lead: "あなたの会社をバーチャルオフィスにしましょう。席に座ると、誰がどの部屋にいて、いま話しかけていいかがわかります。",
    ctaNote: "登録なしで、サンプルの間取りをそのまま編集できます（パソコン向け）。着席やチャットは、Dockerで起動したオフィスで試せます。",
    caption: "この画面はアプリと同じ描画エンジンで動いています。人物はすべて架空です。",
    legend: ["作業中", "集中", "休憩", "会議中"],
    s1: { k: "オフィスでできること", h: "席を見て、呼んで、そのまま話す", paras: [
      ["名札の色で、話しかけていいかわかる", "名札の四角の色が、作業中・集中・休憩・会議中を表します。会議室にいる間は会議中、休憩の部屋にいる間は休憩になり、それ以外は自分で切り替えます。"],
      ["「ちょっといい？」で呼ぶと、席に来てくれる", "相手の画面に呼び出しが出ます。「いま行きます」と返した人は、あなたの部屋の空いている席に移ってきます。"],
      ["チャットと通話は部屋ごと", "部屋のチャットで話せます。通話は部屋に設定した会議のリンクを開くので、MeetやZoomなど今使っているツールをそのまま使えます。"],
      ["座っている時間は表示しない", "座っている時間や、最後に操作した時刻は表示しません。オフィスのタブを15分間操作しないと、離席の表示に変わるだけです。"],
    ], alt: "島の机に座っている同僚の名札。名前の左の四角の色がステータス" },
    s2: { k: "マップエディタ", h: "間取りは、ブラウザでドラッグして作る", p: "サンプルの机を動かすと、右の立体プレビューにも反映されます。下書きはこのブラウザだけに保存されます。「JSON書き出し」で保存したマップは、自分で起動したPixeloftの/setupか/editorで読み込めます。", use: "作ったマップをオフィスで使う", useAnchor: "ブラウザ版とインスタンスの間でjsonを渡す", steps: "左で置き物を選ぶ → 図面に置く → 右で仕上がりを見る", cta: "ブラウザでマップを作る →", alt: "マップエディタの画面" },
    s3: { k: "着せ替えとパーツ", h: "髪型も服も、ドット絵で描ける", p: "髪・服・ズボンの色は自由に選べます。髪型や服、小物はドット絵のエディタで描いて追加できます。描いたパーツはオフィスの全員で共有され、誰でも着替えに使えます。", p2: "机にも飾りを置けるので、同じ形の席でも人によって見た目が変わります。", link: "着せ替えとパーツの使い方", alt: "席についているキャラクターの拡大", alt2: "ドット絵のパーツエディタ" },
    s4: { k: "はじめかた", h: "サンプルのオフィスを起動する", need: "用意するもの：Git、Docker（Compose付き）、ブラウザ", steps: [
      ["クローンする", "git clone https://github.com/yhrym/pixeloft.git\ncd pixeloft"],
      ["起動する", "docker compose up -d"],
      ["/setupを開く", "", "http://localhost:3000/setup", "サーバーで起動した場合は、そのサーバーのURLに/setupを付けて開きます。"],
      ["管理者を作って入室する", "", "", "", "マップは「サンプルを使う」を選ぶ → 作った管理者でログインして「入室する」 → 空いている席を選ぶか「おまかせで座る」"],
    ], facts: ["利用料はかかりません（AGPL-3.0-only）。サーバーを借りる場合は、その費用だけかかります。", "アプリとPostgreSQLの2つのコンテナで動き、データは自分のサーバーのDockerボリュームに保存されます。", "メンバーは招待リンクで追加し、IDとパスワードでログインします。メールアドレスは要りません。退職した人のアカウントは管理者が止められます。", "オフィスにはスマホのブラウザからも入れます。"], more: "くわしい手順" },
    footerNote: "席に座るタイプのバーチャルオフィス。AGPL-3.0-onlyのオープンソースで、利用料はかかりません。",
  },
  en: {
    eyebrow: "Self-hosted virtual office · OSS",
    h1a: "Build your own", h1b: "virtual office",
    lead: "Turn your company into a virtual office. Take a seat, and everyone can see who is in which room and whether now is a good time to talk.",
    ctaNote: "No sign-up: edit the sample floor plan right away (best on a computer). To sit down and chat, run the office with Docker.",
    caption: "This is the real rendering engine. Every person here is fictional.",
    legend: ["Working", "Focus", "Break", "In a meeting"],
    s1: { k: "Inside the office", h: "See who's free, call them over, and talk.", paras: [
      ["Name tags show if now is a good time", "The colored square on each name tag shows working, focus, break or in a meeting. It switches to in a meeting while you're in a meeting room and to break while you're in a break room. Otherwise you set it yourself."],
      ["Send \"Got a minute?\" and they come to you", "A request pops up on their screen. If they reply \"On my way\", they move to a free seat in your room."],
      ["Chat and calls belong to each room", "Chat with everyone in the room. Calls open the meeting link set for the room, so you keep using Meet, Zoom or whatever you already have."],
      ["Time at your seat is never shown", "The office never shows how long you've been at your seat or when you last interacted. If you don't touch the office tab for 15 minutes, you're simply shown as away."],
    ], alt: "Name tags of teammates at an island desk; the square left of each name is their status" },
    s2: { k: "Map editor", h: "Lay out the office in your browser.", p: "Move a desk in the sample and the isometric preview on the right follows. Your draft is saved only in this browser. A map saved with \"Export JSON\" can be loaded on /setup or /editor of your own Pixeloft.", use: "Use your map in the office", useAnchor: "moving-json-between-the-browser-version-and-your-instance", steps: "Pick furniture on the left → place it on the plan → check the result on the right", cta: "Build your map in the browser →", alt: "The map editor" },
    s3: { k: "Wardrobe and parts", h: "Draw your own hair and outfits in pixel art.", p: "Choose any color for hair, clothes and trousers. Then open the pixel editor and draw your own hairstyles, outfits and accessories. Parts you draw are shared with everyone and show up in the dress-up panel.", p2: "Desks get decorations too, so two people at the same kind of seat still look different.", link: "How wardrobe and parts work", alt: "Close-up of seated characters", alt2: "The pixel-art parts editor" },
    s4: { k: "Quick start", h: "Start the sample office", need: "You need: Git, Docker (with Compose) and a browser", steps: [
      ["Clone", "git clone https://github.com/yhrym/pixeloft.git\ncd pixeloft"],
      ["Start", "docker compose up -d"],
      ["Open /setup", "", "http://localhost:3000/setup", "If you started it on a server, open that server's URL followed by /setup."],
      ["Create the admin and enter", "", "", "", "Pick \"Use the sample\" for the map → log in as that admin and press \"Enter\" → choose a free seat or press \"Seat me anywhere\""],
    ], facts: ["No usage fee (AGPL-3.0-only). If you rent a server, that is the only cost.", "Runs as two containers, the app and PostgreSQL; data stays in a Docker volume on your own server.", "Add members with invite links; they log in with an ID and password. No email addresses needed. Admins can disable the account of someone who leaves.", "Members can also enter the office from a phone browser."], more: "Full instructions" },
    footerNote: "A seat-based virtual office. Open source under AGPL-3.0-only, with no usage fee.",
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
<div class="cta-row"><a class="cta" href="${base}editor/">${u.editorOpen}</a><a class="cta ghost" href="#start">${u.docker}</a></div>
<p class="cta-note">${h.ctaNote}</p>
</div>
<p class="hero-cap" aria-hidden="true">${h.caption}</p>
</section>
<main id="main">
<section class="band" id="what">
<div class="band-in split">
<div class="txt"><p class="kicker">${h.s1.k}</p><h2>${h.s1.h}</h2>
${h.s1.paras.map(([a, b]) => `<div class="para"><h3>${a}</h3><p>${b}</p></div>`).join("")}
</div>
<figure class="vis sticky"><img src="${base}assets/img/office-close-${lang}.png" width="600" height="380" alt="${h.s1.alt}" loading="lazy">
<ul class="legend">${h.legend.map((t, i) => `<li><i class="sq ${["work", "focus", "break", "meet"][i]}"></i>${t}</li>`).join("")}</ul></figure>
</div>
</section>
<section class="band alt" id="editor">
<div class="band-in wide">
<div class="txt center"><p class="kicker">${h.s2.k}</p><h2>${h.s2.h}</h2><p>${h.s2.p}</p><div class="cta-row"><a class="cta" href="${base}editor/">${h.s2.cta}</a><a class="more" href="${base}${lang}/map-editor/#${h.s2.useAnchor}">${h.s2.use} →</a></div></div>
<figure class="vis shot"><img src="${base}assets/img/editor-${lang}.png" width="1440" height="900" alt="${h.s2.alt}" loading="lazy"><figcaption>${h.s2.steps}</figcaption></figure>
</div>
</section>
<section class="band" id="wardrobe">
<div class="band-in split rev">
<figure class="vis crop"><div class="crop-img" role="img" aria-label="${h.s3.alt}"></div><img class="parts-img" src="${base}assets/img/parts-editor-${lang}.png" width="1200" height="760" alt="${h.s3.alt2}" loading="lazy"></figure>
<div class="txt"><p class="kicker">${h.s3.k}</p><h2>${h.s3.h}</h2><p>${h.s3.p}</p><p>${h.s3.p2}</p><p><a class="more" href="${base}${lang}/wardrobe/">${h.s3.link} →</a></p></div>
</div>
</section>
<section class="band alt" id="start">
<div class="band-in">
<div class="txt center"><p class="kicker">${h.s4.k}</p><h2>${h.s4.h}</h2><p class="need">${h.s4.need}</p></div>
<ol class="steps">
${h.s4.steps.map(([t, c, link, sub, flow], i) => `<li><div class="num" aria-hidden="true">${i + 1}</div><div class="step-body"><h3>${t}</h3>${c ? code(c) : ""}${link ? `<p class="step-link"><a href="${link}">${link}</a></p>` : ""}${sub ? `<p class="step-sub">${sub}</p>` : ""}${flow ? `<p class="step-flow">${flow}</p>` : ""}</div></li>`).join("\n")}
</ol>
<div class="start-facts"><ul>${h.s4.facts.map((f) => `<li>${f}</li>`).join("")}</ul>
<p><a class="more" href="${gs}">${h.s4.more} →</a></p></div>
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
    lang, base, path, title: lang === "ja" ? "Pixeloft | 誰がいるか見えるバーチャルオフィス" : "Pixeloft | See who's around in a virtual office", desc: u.siteDesc, body, home: true,
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
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:12px;background:#0c1226;color:#f4f6fb;font:16px system-ui,sans-serif;text-align:center}a{color:#f4c651;font-size:20px}</style>
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
