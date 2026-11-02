import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { validateNewUser } from "@/lib/auth/validate";
import { startSession } from "@/lib/auth/session";
import { csrfGuard, redirectTo, secureCookie } from "@/lib/auth/route";
import { MAP_MAX_BYTES, validateMap } from "@/lib/map/validate";
import { readSample } from "@/lib/map/sample";
import { invalidateMapIndex } from "@/lib/virtual-office/map";
import { resolveLocale, t } from "@/i18n";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const f = await req.formData();
  const loginId = String(f.get("loginId") ?? "");
  const name = String(f.get("name") ?? "").trim();
  const password = String(f.get("password") ?? "");
  const bad = validateNewUser(loginId, name, password);
  if (bad) return redirectTo(`/setup?e=${bad}`);

  // 最初のマップ: サンプル(既定)・JSONの読み込み・空。検証に通らなければユーザーも作らない
  const source = String(f.get("mapSource") ?? "sample");
  const locale = resolveLocale(null, (await headers()).get("accept-language"));
  let map: unknown;
  if (source === "sample") {
    try { map = await readSample(locale); } catch { return redirectTo("/setup?e=map"); }
  }
  else if (source === "file") {
    const file = f.get("map");
    if (!(file instanceof File) || file.size === 0 || file.size > MAP_MAX_BYTES + 4096) return redirectTo("/setup?e=map");
    try { map = JSON.parse(await file.text()); } catch { return redirectTo("/setup?e=map"); }
  }
  if (map !== undefined) {
    const first = validateMap(map).find((i) => i.level === "error");
    if (first) return redirectTo(`/setup?e=map&m=${encodeURIComponent(t(locale, first.key, { id: first.id ?? "", ...first.vars }).slice(0, 200))}`);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    // 同時に2つ来ても1つだけ通すためのロック。ロック後にもう一度人数を数える
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
    if ((await tx.user.count()) > 0) return null;
    const u = await tx.user.create({ data: { loginId, name, passwordHash, role: "admin" } });
    if (map !== undefined) await tx.mapVersion.create({ data: { json: map as Prisma.InputJsonValue, createdById: u.id } });
    return u;
  });
  if (map !== undefined) invalidateMapIndex();
  if (!user) return redirectTo("/login");
  await startSession(user.id, secureCookie(req));
  return redirectTo("/");
}
