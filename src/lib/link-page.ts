import { t } from "../i18n/index.ts";
import { getLocale } from "./locale.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 発行したリンクを1度だけ見せる簡易ページ（トークンはDBにハッシュでしか残らない） */
export async function linkPage(titleKey: string, url: string): Promise<Response> {
  const locale = await getLocale();
  const body = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t(locale, "app.name"))}</title></head>
<body style="font-family:sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>${esc(t(locale, titleKey))}</h1><p>${esc(t(locale, "admin.shownOnce"))}</p>
<p><input readonly value="${esc(url)}" style="width:100%;padding:.5rem" onfocus="this.select()"></p>
<p><a href="/admin/members">${esc(t(locale, "common.back"))}</a></p></body></html>`;
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
