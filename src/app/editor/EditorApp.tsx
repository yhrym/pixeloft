"use client";

import "@fontsource/dotgothic16/400.css";
import type { Locale } from "@/i18n";
import { EditorClient } from "./EditorClient";
import { apiStore } from "./store";

/** /editor。サーバーのページが管理者を確かめたあと、API版の保存先で動かす */
export function EditorApp({ locale }: { locale: Locale }) {
  return <EditorClient store={apiStore} locale={locale} backHref="/" thumbsBase="/" />;
}
