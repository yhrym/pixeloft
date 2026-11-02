import { prisma } from "@/lib/db";
import { newToken, hashToken } from "@/lib/auth/token";
import { adminUser, csrfGuard, publicOrigin, redirectTo } from "@/lib/auth/route";
import { linkPage } from "@/lib/link-page";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const action = String((await req.formData()).get("action"));

  if (action === "reset") {
    if (!(await prisma.user.findUnique({ where: { id } }))) return redirectTo("/admin/members");
    const token = newToken();
    await prisma.passwordReset.create({
      data: { tokenHash: hashToken(token), userId: id, expiresAt: new Date(Date.now() + 24 * 3600_000) },
    });
    return linkPage("admin.resetCreated", `${publicOrigin(req)}/reset/${token}`);
  }

  if (!["disable", "enable", "promote", "demote"].includes(action)) return redirectTo("/admin/members");
  const ok = await prisma.$transaction(async (tx) => {
    // 最後の管理者の判定が同時操作ですり抜けないようにロックする
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7002)`;
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) return true;
    if ((action === "disable" || action === "demote") && target.role === "admin" && !target.disabledAt) {
      const others = await tx.user.count({ where: { role: "admin", disabledAt: null, id: { not: id } } });
      if (others === 0) return false;
    }
    if (action === "disable") {
      await tx.user.update({ where: { id }, data: { disabledAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: id } });
    } else if (action === "enable") {
      await tx.user.update({ where: { id }, data: { disabledAt: null } });
    } else {
      await tx.user.update({ where: { id }, data: { role: action === "promote" ? "admin" : "member" } });
    }
    return true;
  });
  return redirectTo(ok ? "/admin/members" : "/admin/members?e=lastAdmin");
}
