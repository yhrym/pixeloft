import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { getSettings } from "@/lib/settings";
import { getMapIndex } from "@/lib/virtual-office/map";
import { VO_EVENT_DECORS } from "@/lib/virtual-office/events";
import { t } from "@/i18n";
import { button } from "../../components";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const locale = await getLocale();
  const [s, idx, q] = await Promise.all([getSettings(), getMapIndex(), searchParams]);
  const zones = [...Intl.supportedValuesOf("timeZone"), "UTC"];
  const input = "mt-1 w-full rounded border border-neutral-400 p-2";
  return (
    <main>
      <h1 className="text-xl">{t(locale, "admin.settings")}</h1>
      <p className="mt-2"><Link className="underline" href="/">{t(locale, "common.back")}</Link></p>
      {q.e && <p className="mt-3 text-red-700">{t(locale, `settings.error.${q.e}`)}</p>}
      {q.saved && <p className="mt-3 text-green-800">{t(locale, "settings.saved")}</p>}
      <form method="post" action="/api/admin/settings" className="mt-4">
        <label className="mt-3 block">
          {t(locale, "settings.timeZone")}
          <input className={input} name="timeZone" list="zones" defaultValue={s.timeZone} required />
          <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
        </label>
        <label className="mt-3 block">
          {t(locale, "settings.workEndHour")}
          <input className={input} name="workEndHour" type="number" min="0" max="23" step="1" defaultValue={s.workEndHour} required />
          <span className="text-sm text-neutral-500">{t(locale, "settings.workEndHint")}</span>
        </label>
        <fieldset className="mt-3">
          <legend>{t(locale, "settings.weather")}</legend>
          <span className="text-sm text-neutral-500">{t(locale, "settings.weatherHint")}</span>
          <div className="flex gap-2">
            <label className="flex-1">{t(locale, "settings.lat")}<input className={input} name="lat" inputMode="decimal" defaultValue={s.weather?.lat ?? ""} /></label>
            <label className="flex-1">{t(locale, "settings.lon")}<input className={input} name="lon" inputMode="decimal" defaultValue={s.weather?.lon ?? ""} /></label>
          </div>
        </fieldset>
        <label className="mt-3 block">
          {t(locale, "settings.season")}
          <select className={input} name="seasonMode" defaultValue={s.seasonMode}>
            <option value="auto">{t(locale, "settings.season.auto")}</option>
            <option value="none">{t(locale, "settings.season.none")}</option>
            {VO_EVENT_DECORS.map((e) => <option key={e.id} value={e.id}>{t(locale, `season.${e.id}`)}</option>)}
          </select>
        </label>
        <fieldset className="mt-3">
          <legend>{t(locale, "settings.callUrls")}</legend>
          <span className="text-sm text-neutral-500">{t(locale, "settings.callUrlsHint")}</span>
          {idx.rooms.length === 0 && <p className="text-neutral-500">{t(locale, "settings.noRooms")}</p>}
          {idx.rooms.map((r) => (
            <label key={r.id} className="mt-2 block">
              {r.name}
              <input className={input} name={`call.${r.id}`} type="url" maxLength={300} defaultValue={s.callUrls[r.id] ?? ""} placeholder="https://" />
            </label>
          ))}
        </fieldset>
        <button className={`${button} mt-4`}>{t(locale, "common.save")}</button>
      </form>
    </main>
  );
}
