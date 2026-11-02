// サイト共通のクライアントJS: テーマ・検索・目次のスクロール連動・コードのコピー・モバイルのメニュー
const root = document.documentElement;
const base = root.dataset.base || "./", lang = root.dataset.lang || "en";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
};

// ---- テーマ(保存値があればそれ、なければOSの設定) ----
const dark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
const paint = () => $$("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(dark())));
$$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
  const next = dark() ? "light" : "dark";
  root.dataset.theme = next; store.set("pixeloft-theme", next); paint();
}));
paint();

// ---- コードのコピー ----
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const text = b.closest(".code").querySelector("code").innerText.replace(/^\$ /gm, "");
  try { await navigator.clipboard.writeText(text); b.textContent = "COPIED"; } catch { b.textContent = "ERROR"; }
  setTimeout(() => { b.textContent = "COPY"; }, 1500);
});

// ---- モバイルのページ一覧 ----
const st = $("[data-side-toggle]");
if (st) st.addEventListener("click", () => {
  const open = st.getAttribute("aria-expanded") !== "true";
  st.setAttribute("aria-expanded", String(open)); st.parentElement.classList.toggle("open", open);
});

// ---- 目次: 画面の上のほうにある見出しを強調 ----
const links = $$(".toc a");
if (links.length) {
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)))).filter(Boolean);
  let raf = 0;
  const spy = () => {
    raf = 0;
    let cur = 0;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 120) cur = i; });
    if (innerHeight + scrollY >= document.body.scrollHeight - 4) cur = heads.length - 1;
    links.forEach((a, i) => a.classList.toggle("on", i === cur));
  };
  addEventListener("scroll", () => { raf = raf || requestAnimationFrame(spy); }, { passive: true });
  spy();
}

// ---- 検索(ビルド時のJSONを読んで部分一致) ----
const dlg = $("[data-search]");
if (dlg) {
  const input = $("[data-search-input]", dlg), list = $("[data-search-results]", dlg), empty = $("[data-search-empty]", dlg);
  let index = null, sel = 0;
  const load = () => index || (index = fetch(`${base}assets/search-${lang}.json`).then((r) => r.json()).catch(() => []));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mark = (s, ws) => ws.reduce((t, w) => t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `\u0001${m}\u0002`), esc(s)).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
  const snippet = (x, ws) => {
    const i = Math.min(...ws.map((w) => x.toLowerCase().indexOf(w)).filter((n) => n >= 0), x.length);
    const from = Math.max(0, i - 24), t = x.slice(from, i + 90);
    return (from > 0 && /^[\w]/.test(t) ? t.replace(/^\S*\s/, "…") : t) + (i + 90 < x.length ? "…" : ""); // 語の途中から始まらないように
  };
  async function run() {
    const ws = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    list.innerHTML = ""; sel = 0;
    if (!ws.length) { empty.hidden = true; return; }
    const hits = (await load()).map((e) => {
      const h = e.h.toLowerCase(), p = e.p.toLowerCase(), x = e.x.toLowerCase();
      if (!ws.every((w) => h.includes(w) || p.includes(w) || x.includes(w))) return null;
      return { e, score: ws.reduce((n, w) => n + (h.includes(w) ? 10 : 0) + (p.includes(w) ? 3 : 0) + (x.includes(w) ? 1 : 0), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);
    empty.hidden = hits.length > 0;
    list.innerHTML = hits.map(({ e }, i) => `<li role="option"${i === 0 ? ' aria-selected="true"' : ""}><a href="${base}${e.u}"><span class="rt">${mark(e.p + (e.h ? " › " + e.h : ""), ws)}</span><span class="rx">${mark(snippet(e.x, ws), ws)}</span></a></li>`).join("");
  }
  const move = (d) => {
    const items = $$("li", list); if (!items.length) return;
    items[sel].removeAttribute("aria-selected"); sel = (sel + d + items.length) % items.length;
    items[sel].setAttribute("aria-selected", "true"); items[sel].scrollIntoView({ block: "nearest" });
  };
  const open = () => { dlg.showModal(); input.select(); load(); };
  $$("[data-search-open]").forEach((b) => b.addEventListener("click", open));
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); } else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { const a = $$("li a", list)[sel]; if (a) { e.preventDefault(); location.href = a.href; } }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); if (!dlg.open) open(); }
  });
}

// ホームのナビはヒーローの上に重ね、スクロールしたら帯にする
const heroNav = $(".nav.on-hero");
if (heroNav) {
  const f = () => heroNav.classList.toggle("scrolled", scrollY > 24);
  addEventListener("scroll", f, { passive: true }); f();
}
