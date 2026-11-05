import { t } from "../i18n/index.ts";
import { getLocale } from "./locale.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 通常のページと同じ見た目にする(エディタの色)。ここはCSSファイルを読まない素のHTMLなので、styleを中に持つ
const CSS = `*{box-sizing:border-box}body{margin:0;padding:16px;min-height:100vh;background:#f4f6fa;color:#1e2433;font:14px/1.55 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:720px;margin:0 auto}.wm{display:inline-flex;align-items:center;gap:8px;font-size:22px;color:#34446b;margin-bottom:16px;font-family:"DotGothic16",system-ui,sans-serif}.wm img{width:24px;height:24px;image-rendering:pixelated}
.card{background:#fff;border:1px solid #e2e6ef;border-radius:12px;box-shadow:0 1px 2px rgba(30,36,51,.06),0 6px 18px rgba(30,36,51,.09);padding:16px}
h1{font-size:18px;margin:0 0 8px}p{margin:0 0 14px;color:#566077}.row{display:flex;gap:8px}
input{flex:1;min-width:0;height:40px;padding:0 12px;border:1px solid #c9d2e8;border-radius:8px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
input:focus,.btn:focus-visible{outline:2px solid #34446b;outline-offset:0}
.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 16px;border-radius:8px;border:1px solid #e2e6ef;background:#fff;color:#1e2433;font-weight:600;font-size:14px;font-family:inherit;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{background:#e9edf7;border-color:#c9d2e8}.pri{background:#34446b;border-color:#34446b;color:#fff}.pri:hover{background:#26335a;border-color:#26335a}
.back{margin-top:16px}`;

/** 発行したリンクを1度だけ見せる簡易ページ（トークンはDBにハッシュでしか残らない） */
export async function linkPage(titleKey: string, url: string): Promise<Response> {
  const locale = await getLocale();
  const body = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t(locale, "app.name"))}</title><style>${CSS}</style></head>
<body><main><div class="wm"><img src="/icon.svg" alt="">Pixeloft</div><div class="card">
<h1>${esc(t(locale, titleKey))}</h1><p>${esc(t(locale, "admin.shownOnce"))}</p>
<div class="row"><input id="u" readonly value="${esc(url)}" onfocus="this.select()"><button class="btn pri" id="c" type="button" data-done="${esc(t(locale, "admin.copied"))}">${esc(t(locale, "admin.copy"))}</button></div></div>
<a class="btn back" href="/admin/members">${esc(t(locale, "common.back"))}</a></main>
<script>var b=document.getElementById("c"),l=b.textContent;b.onclick=function(){navigator.clipboard.writeText(document.getElementById("u").value).then(function(){b.textContent=b.dataset.done;setTimeout(function(){b.textContent=l},1500)})}</script></body></html>`;
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
