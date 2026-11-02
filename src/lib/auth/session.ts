import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "../db.ts";
import { hashToken, newToken } from "./token.ts";

export const SESSION_COOKIE = "vo_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export async function startSession(userId: string, secure: boolean): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** ログイン中の有効なユーザー。期限切れのセッション・無効化されたユーザーはnull */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt <= new Date() || s.user.disabledAt) return null;
  return s.user;
});
