import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locale } from "@/i18n";

/** 同梱のサンプルマップ。ファイル名は固定(入力からパスを作らない)。Dockerイメージにはmaps/をコピーしてある */
const FILES: Record<Locale, string> = { ja: "sample.ja.json", en: "sample.en.json" };
export async function readSample(locale: Locale): Promise<unknown> {
  return JSON.parse(await readFile(join(/*turbopackIgnore: true*/ process.cwd(), "maps", FILES[locale] ?? FILES.en), "utf8"));
}
