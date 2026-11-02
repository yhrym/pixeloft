import { headers } from "next/headers";
import { resolveLocale } from "../i18n/index.ts";
import { getCurrentUser } from "./auth/session.ts";

export async function getLocale() {
  return resolveLocale((await getCurrentUser())?.locale, (await headers()).get("accept-language"));
}
