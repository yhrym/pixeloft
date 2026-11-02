import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/token";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { button, ErrorLine, Field } from "../../components";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!r || r.usedAt || r.expiresAt <= new Date()) return <main><p>{t(locale, "link.invalid")}</p></main>;
  return (
    <main>
      <h1 className="text-xl">{t(locale, "app.name")}</h1>
      <h2 className="mt-2">{t(locale, "reset.title")}</h2>
      <ErrorLine locale={locale} code={(await searchParams).e} />
      <form method="post" action={`/api/reset/${encodeURIComponent(token)}`}>
        <Field locale={locale} label="common.newPassword" name="password" type="password" hint="common.passwordHint" />
        <button className={`${button} mt-4`}>{t(locale, "reset.submit")}</button>
      </form>
    </main>
  );
}
