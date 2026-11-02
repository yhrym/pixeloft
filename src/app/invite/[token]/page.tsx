import { prisma } from "@/lib/db";
import { inviteUsable } from "@/lib/auth/invite";
import { hashToken } from "@/lib/auth/token";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { button, ErrorLine, Field } from "../../components";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || !inviteUsable(invite)) return <main><p>{t(locale, "link.invalid")}</p></main>;
  return (
    <main>
      <h1 className="text-xl">{t(locale, "app.name")}</h1>
      <h2 className="mt-2">{t(locale, "invite.title")}</h2>
      <ErrorLine locale={locale} code={(await searchParams).e} />
      <form method="post" action={`/api/invite/${encodeURIComponent(token)}`}>
        <Field locale={locale} label="common.loginId" name="loginId" hint="common.loginIdHint" />
        <Field locale={locale} label="common.name" name="name" />
        <Field locale={locale} label="common.password" name="password" type="password" hint="common.passwordHint" />
        <button className={`${button} mt-4`}>{t(locale, "invite.submit")}</button>
      </form>
    </main>
  );
}
