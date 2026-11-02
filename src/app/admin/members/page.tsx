import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { button, ErrorLine } from "../../components";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const locale = await getLocale();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const field = "ml-1 w-20 rounded border border-neutral-400 p-1";
  return (
    <main>
      <h1 className="text-xl">{t(locale, "admin.title")}</h1>
      <p className="mt-2"><Link className="underline" href="/">{t(locale, "common.back")}</Link></p>
      <ErrorLine locale={locale} code={(await searchParams).e} />

      <h2 className="mt-4">{t(locale, "admin.invite")}</h2>
      <form method="post" action="/api/admin/invites" className="mt-2 flex flex-wrap items-end gap-3">
        <label>{t(locale, "admin.inviteDays")}<input className={field} name="days" type="number" min="1" max="365" defaultValue="7" /></label>
        <label>{t(locale, "admin.inviteMaxUses")}<input className={field} name="maxUses" type="number" min="1" max="1000" defaultValue="1" /></label>
        <label>
          {t(locale, "admin.inviteRole")}
          <select className={field} name="role">
            <option value="member">{t(locale, "admin.role.member")}</option>
            <option value="admin">{t(locale, "admin.role.admin")}</option>
          </select>
        </label>
        <button className={button}>{t(locale, "admin.invite")}</button>
      </form>

      <h2 className="mt-6">{t(locale, "admin.members")}</h2>
      <ul className="mt-2 space-y-3">
        {users.map((u) => (
          <li key={u.id} className="rounded border border-neutral-300 p-2">
            <div>
              {u.name} ({u.loginId}) / {t(locale, `admin.role.${u.role}`)} / {t(locale, u.disabledAt ? "admin.status.disabled" : "admin.status.active")}
            </div>
            <form method="post" action={`/api/admin/users/${u.id}`} className="mt-1 flex flex-wrap gap-2">
              <button className="underline" name="action" value={u.disabledAt ? "enable" : "disable"}>{t(locale, u.disabledAt ? "admin.enable" : "admin.disable")}</button>
              <button className="underline" name="action" value={u.role === "admin" ? "demote" : "promote"}>{t(locale, u.role === "admin" ? "admin.demote" : "admin.promote")}</button>
              <button className="underline" name="action" value="reset">{t(locale, "admin.resetLink")}</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
