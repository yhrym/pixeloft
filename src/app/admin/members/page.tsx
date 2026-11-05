import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { t } from "@/i18n";
import { AdminShell, button, ErrorLine } from "../../components";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const locale = await getLocale();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const sm = "pg-btn pg-btn-sm";
  return (
    <AdminShell title={t(locale, "admin.title")} back={t(locale, "common.back")}>
      <ErrorLine locale={locale} code={(await searchParams).e} />

      <section className="pg-card">
        <h2>{t(locale, "admin.invite")}</h2>
        <form method="post" action="/api/admin/invites">
          <div className="pg-row">
            <label className="pg-field"><span className="pg-label">{t(locale, "admin.inviteDays")}</span><input className="pg-input" name="days" type="number" min="1" max="365" defaultValue="7" /></label>
            <label className="pg-field"><span className="pg-label">{t(locale, "admin.inviteMaxUses")}</span><input className="pg-input" name="maxUses" type="number" min="1" max="1000" defaultValue="1" /></label>
            <label className="pg-field">
              <span className="pg-label">{t(locale, "admin.inviteRole")}</span>
              <select className="pg-input" name="role">
                <option value="member">{t(locale, "admin.role.member")}</option>
                <option value="admin">{t(locale, "admin.role.admin")}</option>
              </select>
            </label>
          </div>
          <button className={button} style={{ marginTop: 16 }}>{t(locale, "admin.invite")}</button>
        </form>
      </section>

      <section className="pg-card">
        <h2>{t(locale, "admin.members")}</h2>
        <ul className="pg-list">
          {users.map((u) => (
            <li key={u.id}>
              <div className="pg-member-head">
                <b>{u.name}</b>
                <span className="pg-mono">{u.loginId}</span>
                <span className="pg-badge">{t(locale, `admin.role.${u.role}`)}</span>
                <span className={`pg-badge ${u.disabledAt ? "pg-badge-off" : "pg-badge-ok"}`}>{t(locale, u.disabledAt ? "admin.status.disabled" : "admin.status.active")}</span>
              </div>
              <form method="post" action={`/api/admin/users/${u.id}`} className="pg-actions">
                <button className={u.disabledAt ? sm : `${sm} pg-btn-danger`} name="action" value={u.disabledAt ? "enable" : "disable"}>{t(locale, u.disabledAt ? "admin.enable" : "admin.disable")}</button>
                <button className={sm} name="action" value={u.role === "admin" ? "demote" : "promote"}>{t(locale, u.role === "admin" ? "admin.demote" : "admin.promote")}</button>
                <button className={sm} name="action" value="reset">{t(locale, "admin.resetLink")}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
