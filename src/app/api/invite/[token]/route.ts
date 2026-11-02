import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/token";
import { validateNewUser } from "@/lib/auth/validate";
import { startSession } from "@/lib/auth/session";
import { csrfGuard, redirectTo, secureCookie } from "@/lib/auth/route";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const { token } = await params;
  const back = `/invite/${encodeURIComponent(token)}`;
  const f = await req.formData();
  const loginId = String(f.get("loginId") ?? "");
  const name = String(f.get("name") ?? "").trim();
  const password = String(f.get("password") ?? "");
  const bad = validateNewUser(loginId, name, password);
  if (bad) return redirectTo(`${back}?e=${bad}`);

  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!invite) return null;
      // 条件つきの更新で、同時に使われても使える回数を超えない
      const claimed = await tx.$executeRaw`UPDATE "Invite" SET "uses" = "uses" + 1 WHERE "id" = ${invite.id} AND "uses" < "maxUses" AND "expiresAt" > ${now}`;
      if (claimed === 0) return null;
      return tx.user.create({ data: { loginId, name, passwordHash, role: invite.role } });
    });
    if (!user) return redirectTo(`${back}?e=invite`);
    await startSession(user.id, secureCookie(req));
    return redirectTo("/");
  } catch (e) {
    // loginIdの重複。トランザクションごと巻き戻るのでusesも増えない
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return redirectTo(`${back}?e=taken`);
    throw e;
  }
}
