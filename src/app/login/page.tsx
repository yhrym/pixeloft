import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { AuthCard, button, ErrorLine, Field } from "../components";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const locale = await getLocale();
  return (
    <AuthCard locale={locale} title="login.title">
      <ErrorLine locale={locale} code={(await searchParams).e} />
      <form method="post" action="/api/login">
        <Field locale={locale} label="common.loginId" name="loginId" />
        <label className="pg-field">
          <span className="pg-label">{t(locale, "common.password")}</span>
          <input className="pg-input" name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className={button}>{t(locale, "login.submit")}</button>
      </form>
    </AuthCard>
  );
}
