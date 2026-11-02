import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/auth/ratelimit";
import { clientIp, csrfGuard, redirectTo, secureCookie } from "@/lib/auth/route";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const f = await req.formData();
  const loginId = String(f.get("loginId") ?? "");
  const password = String(f.get("password") ?? "");
  const key = `${loginId}|${clientIp(req)}`;
  if (loginBlocked(key)) return new Response("Too Many Requests", { status: 429 });

  const user = await prisma.user.findUnique({ where: { loginId } });
  // ユーザーがいなくてもscryptを1回回して、応答時間でIDの有無が分からないようにする
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  if (!user || !ok || user.disabledAt) {
    recordLoginFailure(key);
    return redirectTo("/login?e=credentials");
  }
  clearLoginFailures(key);
  await startSession(user.id, secureCookie(req));
  return redirectTo("/");
}
