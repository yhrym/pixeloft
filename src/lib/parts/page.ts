/** /parts のサーバー側ページの共通部分(ログイン確認・自分の見た目・文言) */
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session.ts";
import { getLocale } from "../locale.ts";
import { prisma } from "../db.ts";
import { t } from "../../i18n/index.ts";
import { defaultLook, toLook } from "../virtual-office/presence.ts";
import { hasPart, partsIndex } from "./store.ts";
import { listParts } from "./service.ts";

export async function partsPageData(keys: readonly string[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const [profile, idx, parts] = await Promise.all([prisma.voProfile.findUnique({ where: { userId: user.id }, select: { look: true } }), partsIndex(), listParts()]);
  const look = toLook(profile?.look, hasPart(idx)) ?? defaultLook(user.id);
  const m = Object.fromEntries(keys.map((k) => [k, t(locale, k)]));
  return { user, locale, look, parts, m };
}
