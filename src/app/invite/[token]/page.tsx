import { prisma } from "@/lib/db";
import { inviteUsable } from "@/lib/auth/invite";
import { hashToken } from "@/lib/auth/token";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { AuthCard, button, ErrorLine, Field } from "../../components";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || !inviteUsable(invite)) return <AuthCard locale={locale} title="link.invalid" />;
  return (
    <AuthCard locale={locale} title="invite.title">
      <ErrorLine locale={locale} code={(await searchParams).e} />
      <form method="post" action={`/api/invite/${encodeURIComponent(token)}`}>
        <Field locale={locale} label="common.loginId" name="loginId" hint="common.loginIdHint" />
        <Field locale={locale} label="common.name" name="name" />
        <Field locale={locale} label="common.password" name="password" type="password" hint="common.passwordHint" />
        <button className={button}>{t(locale, "invite.submit")}</button>
      </form>
    </AuthCard>
  );
}
