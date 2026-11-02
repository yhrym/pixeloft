import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { button, ErrorLine, Field } from "../components";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const locale = await getLocale();
  return (
    <main>
      <h1 className="text-xl">{t(locale, "app.name")}</h1>
      <h2 className="mt-2">{t(locale, "login.title")}</h2>
      <ErrorLine locale={locale} code={(await searchParams).e} />
      <form method="post" action="/api/login">
        <Field locale={locale} label="common.loginId" name="loginId" />
        <label className="mt-3 block">
          {t(locale, "common.password")}
          <input className="mt-1 w-full rounded border border-neutral-400 p-2" name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className={`${button} mt-4`}>{t(locale, "login.submit")}</button>
      </form>
    </main>
  );
}
