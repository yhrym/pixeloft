import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getLocale } from "@/lib/locale";
import { t, type Locale } from "@/i18n";
import { button, ErrorLine, Field } from "../components";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ e?: string; m?: string }> }) {
  if ((await prisma.user.count()) > 0) redirect("/login");
  const locale = await getLocale();
  return (
    <main>
      <h1 className="text-xl">{t(locale, "app.name")}</h1>
      <h2 className="mt-2">{t(locale, "setup.title")}</h2>
      <SetupError locale={locale} searchParams={searchParams} />
      <form method="post" action="/api/setup" encType="multipart/form-data">
        <Field locale={locale} label="common.loginId" name="loginId" hint="common.loginIdHint" />
        <Field locale={locale} label="common.name" name="name" />
        <Field locale={locale} label="common.password" name="password" type="password" hint="common.passwordHint" />
        <fieldset className="mt-3">
          <legend>{t(locale, "setup.map")}</legend>
          <label className="block"><input type="radio" name="mapSource" value="sample" defaultChecked /> {t(locale, "setup.mapSample")}</label>
          <label className="block"><input type="radio" name="mapSource" value="file" /> {t(locale, "setup.mapFile")}</label>
          <input className="ml-6 w-[calc(100%-1.5rem)]" name="map" type="file" accept="application/json,.json" aria-label={t(locale, "setup.mapFile")} />
          <label className="block"><input type="radio" name="mapSource" value="empty" /> {t(locale, "setup.mapEmpty")}</label>
          <span className="text-sm text-neutral-500">{t(locale, "setup.mapHint")}</span>
        </fieldset>
        <button className={`${button} mt-4`}>{t(locale, "setup.submit")}</button>
      </form>
    </main>
  );
}

async function SetupError({ locale, searchParams }: { locale: Locale; searchParams: Promise<{ e?: string; m?: string }> }) {
  const { e, m } = await searchParams;
  return (
    <>
      <ErrorLine locale={locale} code={e} />
      {e === "map" && m && <p className="text-red-700">{m}</p>}
    </>
  );
}
