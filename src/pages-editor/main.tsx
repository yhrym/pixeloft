// GitHub Pages版のエディタ。保存先はブラウザのlocalStorageだけ(サーバーには何も送らない)
import { createRoot } from "react-dom/client";
import "@fontsource/dotgothic16/400.css";
import "@/engine/office.css";
import type { Locale } from "@/i18n";
import type { OfficeMap } from "@/engine/map.js";
import { EditorClient } from "../app/editor/EditorClient";
import type { EditorStore } from "../app/editor/store";
import { looksLikeMap } from "@/lib/map/validate";
import sampleJa from "../../maps/sample.ja.json";
import sampleEn from "../../maps/sample.en.json";

const KEY = "pixeloft.draft";

const locale: Locale = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
const sample = (locale === "ja" ? sampleJa : sampleEn) as OfficeMap;

const localStore: EditorStore = {
  async load() {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (looksLikeMap(v)) return { map: v, source: "local" };
    } catch { /* 読めなければサンプル(プライベートウィンドウなど) */ }
    // 初回は空でなくサンプルを見せる。ここでは保存しない(編集して初めて下書きになる)
    return { map: structuredClone(sample), source: "sample" };
  },
  async saveDraft(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); return true; } catch { return false; }
  },
};

document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(<EditorClient store={localStore} locale={locale} backHref={`../${locale}/`} docsHref={`../${locale}/map-editor/`} previewSrc="preview.html" thumbsBase="" autosave sample={sample} />);
