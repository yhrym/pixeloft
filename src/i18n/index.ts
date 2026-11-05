import ja from "./ja.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
// プラグインの文言(scripts/plugins.mjsが作る)
import plugins from "../plugins/generated/i18n.json" with { type: "json" };

export type Locale = "ja" | "en";
export const LOCALES: Locale[] = ["ja", "en"];

const dict: Record<Locale, Record<string, string>> = { ja: { ...ja, ...plugins.ja }, en: { ...en, ...plugins.en } };

/** ja → キーそのものの順にフォールバックして、{name}を差し込む */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const s = dict[locale][key] ?? dict.ja[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** ユーザーの設定 → Accept-Language（q値の高い順でja/enの最初） → ja */
export function resolveLocale(userLocale: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (userLocale === "ja" || userLocale === "en") return userLocale;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim().match(/^q=([\d.]+)$/)?.[1]).find(Boolean);
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return (ranked.find((x) => x.lang === "ja" || x.lang === "en")?.lang as Locale | undefined) ?? "ja";
}
