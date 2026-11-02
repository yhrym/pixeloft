import { prisma } from "@/lib/db";
import { newToken, hashToken } from "@/lib/auth/token";
import { adminUser, csrfGuard, publicOrigin } from "@/lib/auth/route";
import { linkPage } from "@/lib/link-page";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const f = await req.formData();
  const days = Math.min(Math.max(Math.floor(Number(f.get("days"))) || 7, 1), 365);
  const maxUses = Math.min(Math.max(Math.floor(Number(f.get("maxUses"))) || 1, 1), 1000);
  const role = f.get("role") === "admin" ? "admin" : "member";
  const token = newToken();
  await prisma.invite.create({
    data: {
      tokenHash: hashToken(token),
      role,
      maxUses,
      expiresAt: new Date(Date.now() + days * 86400_000),
      createdById: admin.id,
    },
  });
  return linkPage("admin.inviteCreated", `${publicOrigin(req)}/invite/${token}`);
}
