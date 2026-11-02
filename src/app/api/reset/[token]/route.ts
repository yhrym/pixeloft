import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/token";
import { validatePassword } from "@/lib/auth/validate";
import { csrfGuard, redirectTo } from "@/lib/auth/route";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const { token } = await params;
  const back = `/reset/${encodeURIComponent(token)}`;
  const password = String((await req.formData()).get("password") ?? "");
  const bad = validatePassword(password);
  if (bad) return redirectTo(`${back}?e=${bad}`);

  const passwordHash = await hashPassword(password);
  const ok = await prisma.$transaction(async (tx) => {
    // usedAtがnullで期限内のものだけを使用済みにする。同時に2回来ても1回だけ通る
    const used = await tx.passwordReset.updateMany({
      where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) return false;
    const r = await tx.passwordReset.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    await tx.user.update({ where: { id: r.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: r.userId } });
    return true;
  });
  return redirectTo(ok ? "/login" : `${back}?e=reset`);
}
