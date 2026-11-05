import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { getSettings } from "@/lib/settings";
import { getMapIndex } from "@/lib/virtual-office/map";
import { VO_EVENT_DECORS } from "@/lib/virtual-office/events";
import { t } from "@/i18n";
import { AdminShell, button } from "../../components";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const locale = await getLocale();
  const [s, idx, q] = await Promise.all([getSettings(), getMapIndex(), searchParams]);
  const zones = [...Intl.supportedValuesOf("timeZone"), "UTC"];
  const input = "pg-input";
  return (
    <AdminShell title={t(locale, "admin.settings")} back={t(locale, "common.back")}>
      {q.e && <p className="pg-error" role="alert">{t(locale, `settings.error.${q.e}`)}</p>}
      {q.saved && <p className="pg-ok">{t(locale, "settings.saved")}</p>}
      <form method="post" action="/api/admin/settings">
        <section className="pg-card">
          <label className="pg-field">
            <span className="pg-label">{t(locale, "settings.timeZone")}</span>
            <input className={input} name="timeZone" list="zones" defaultValue={s.timeZone} required />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </label>
          <label className="pg-field">
            <span className="pg-label">{t(locale, "settings.workEndHour")}</span>
            <input className={input} name="workEndHour" type="number" min="0" max="23" step="1" defaultValue={s.workEndHour} required />
            <span className="pg-hint">{t(locale, "settings.workEndHint")}</span>
          </label>
        </section>
        <fieldset className="pg-card">
          <legend className="pg-card-title">{t(locale, "settings.weather")}</legend>
          <span className="pg-hint" style={{ marginTop: -6, marginBottom: 10 }}>{t(locale, "settings.weatherHint")}</span>
          <div className="pg-row">
            <label className="pg-field"><span className="pg-label">{t(locale, "settings.lat")}</span><input className={input} name="lat" inputMode="decimal" defaultValue={s.weather?.lat ?? ""} /></label>
            <label className="pg-field"><span className="pg-label">{t(locale, "settings.lon")}</span><input className={input} name="lon" inputMode="decimal" defaultValue={s.weather?.lon ?? ""} /></label>
          </div>
        </fieldset>
        <section className="pg-card">
          <label className="pg-field">
            <span className="pg-card-title" style={{ display: "block", marginBottom: 0 }}>{t(locale, "settings.season")}</span>
            <select className={input} name="seasonMode" defaultValue={s.seasonMode}>
              <option value="auto">{t(locale, "settings.season.auto")}</option>
              <option value="none">{t(locale, "settings.season.none")}</option>
              {VO_EVENT_DECORS.map((e) => <option key={e.id} value={e.id}>{t(locale, `season.${e.id}`)}</option>)}
            </select>
          </label>
        </section>
        <fieldset className="pg-card">
          <legend className="pg-card-title">{t(locale, "settings.callUrls")}</legend>
          <span className="pg-hint" style={{ marginTop: -6, marginBottom: 10 }}>{t(locale, "settings.callUrlsHint")}</span>
          {idx.rooms.length === 0 && <p className="pg-muted" style={{ margin: 0 }}>{t(locale, "settings.noRooms")}</p>}
          {idx.rooms.map((r) => (
            <label key={r.id} className="pg-field">
              <span className="pg-label">{r.name}</span>
              <input className={input} name={`call.${r.id}`} type="url" maxLength={300} defaultValue={s.callUrls[r.id] ?? ""} placeholder="https://" />
            </label>
          ))}
        </fieldset>
        <button className={button}>{t(locale, "common.save")}</button>
      </form>
    </AdminShell>
  );
}
