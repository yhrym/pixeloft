import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getLocale } from "@/lib/locale";
import { t, type Locale } from "@/i18n";
import { AuthCard, button, ErrorLine, Field } from "../components";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ e?: string; m?: string }> }) {
  if ((await prisma.user.count()) > 0) redirect("/login");
  const locale = await getLocale();
  return (
    <AuthCard locale={locale} title="setup.title">
      <SetupError locale={locale} searchParams={searchParams} />
      <form method="post" action="/api/setup" encType="multipart/form-data">
        <Field locale={locale} label="common.loginId" name="loginId" hint="common.loginIdHint" />
        <Field locale={locale} label="common.name" name="name" />
        <Field locale={locale} label="common.password" name="password" type="password" hint="common.passwordHint" />
        <fieldset style={{ border: 0, padding: 0, margin: "14px 0 0", minWidth: 0 }}>
          <legend className="pg-label">{t(locale, "setup.map")}</legend>
          <label className="pg-radio"><input type="radio" name="mapSource" value="sample" defaultChecked /> {t(locale, "setup.mapSample")}</label>
          <label className="pg-radio"><input type="radio" name="mapSource" value="file" /> {t(locale, "setup.mapFile")}</label>
          <input className="pg-hint" style={{ marginLeft: 24, width: "calc(100% - 24px)" }} name="map" type="file" accept="application/json,.json" aria-label={t(locale, "setup.mapFile")} />
          <label className="pg-radio"><input type="radio" name="mapSource" value="empty" /> {t(locale, "setup.mapEmpty")}</label>
          <span className="pg-hint">{t(locale, "setup.mapHint")}</span>
        </fieldset>
        <button className={button}>{t(locale, "setup.submit")}</button>
      </form>
    </AuthCard>
  );
}

async function SetupError({ locale, searchParams }: { locale: Locale; searchParams: Promise<{ e?: string; m?: string }> }) {
  const { e, m } = await searchParams;
  return (
    <>
      <ErrorLine locale={locale} code={e} />
      {e === "map" && m && <p className="pg-error">{m}</p>}
    </>
  );
}
