import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { MAX_LOGIN_ID_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/auth/validate";
import { acquireHashSlot, clearLoginFailures, loginBlocked, recordLoginFailure } from "@/lib/auth/ratelimit";
import { clientIp, csrfGuard, redirectTo, secureCookie } from "@/lib/auth/route";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const f = await req.formData();
  const loginId = String(f.get("loginId") ?? "");
  const password = String(f.get("password") ?? "");
  // scryptやDB検索に巨大な入力を渡さない
  if (loginId.length > MAX_LOGIN_ID_LENGTH || password.length > MAX_PASSWORD_LENGTH) return redirectTo("/login?e=credentials");
  const key = `${loginId}|${clientIp(req)}`;
  if (loginBlocked(key)) return new Response("Too Many Requests", { status: 429 });

  const user = await prisma.user.findUnique({ where: { loginId } });
  const release = acquireHashSlot();
  if (!release) return redirectTo("/login?e=rate"); // scrypt待ちを溜めない
  let ok: boolean;
  try {
    // ユーザーがいなくてもscryptを1回回して、応答時間でIDの有無が分からないようにする
    ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  } finally { release(); }
  if (!user || !ok || user.disabledAt) {
    recordLoginFailure(key);
    return redirectTo("/login?e=credentials");
  }
  clearLoginFailures(key);
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }); // 期限切れの掃除はログインのついでに
  await startSession(user.id, secureCookie(req));
  return redirectTo("/");
}
