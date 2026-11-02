import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { getVapid } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { buildState } from "@/lib/virtual-office/state";
import { getMapIndex } from "@/lib/virtual-office/map";
import { fetchWeather, weatherKey, weatherKind } from "@/lib/weather";
import type { OfficeWeather } from "@/engine/office.js";
import { LOCALES, t } from "@/i18n";
import { OfficeClient, type OfficeMenuItem } from "./office/OfficeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect((await prisma.user.count()) === 0 ? "/setup" : "/login");
  const locale = await getLocale();
  const settings = await getSettings();
  const [initial, idx, w, vapid] = await Promise.all([
    buildState(user, locale),
    getMapIndex(),
    fetchWeather(settings.weather),
    // 鍵が作れなくてもオフィスは開く(通知のボタンを出さないだけ)
    getVapid().catch(() => null),
  ]);
  const weather: OfficeWeather | null = w ? { kind: weatherKind(w.currentCode), label: t(locale, weatherKey(w.currentCode)), temp: w.currentTemp } : null;
  const msgs = {
    connect: t(locale, "office.connectFailed"),
    error: t(locale, "vo.err.server"),
    pushDenied: t(locale, "push.denied"),
    pushSaveFailed: t(locale, "push.saveFailed"),
  };
  const menu: OfficeMenuItem[] = [
    { label: t(locale, "parts.menu"), href: "/parts" },
    ...(user.role === "admin"
      ? [
          { label: t(locale, "home.members"), href: "/admin/members" },
          { label: t(locale, "admin.settings"), href: "/admin/settings" },
          { label: t(locale, "home.editor"), href: "/editor" },
        ]
      : []),
    ...LOCALES.filter((l) => l !== locale).map((l) => ({
      label: `${t(locale, "common.language")}: ${l === "ja" ? "日本語" : "English"}`,
      post: { path: "/api/locale", form: { locale: l }, then: "/" },
    })),
    { label: t(locale, "home.logout"), post: { path: "/api/logout", then: "/login" } },
  ];
  return (
    <div className="vo-page">
      <OfficeClient initial={initial} weather={weather} timeZone={settings.timeZone} workEndHour={settings.workEndHour} map={idx.map ?? { version: 1, name: "", backdrop: "city", floors: [] }} appName={t(locale, "app.name")} menu={menu} vapidPublicKey={vapid?.publicKey ?? null} msgs={msgs} locale={locale} />
    </div>
  );
}
