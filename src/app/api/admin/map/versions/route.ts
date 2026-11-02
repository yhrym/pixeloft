import { prisma } from "@/lib/db";
import { adminUser } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** 新しい順に50件。[{id, createdAt, createdBy(名前。消えたユーザーはnull)}] */
export async function GET() {
  if (!(await adminUser())) return new Response("Forbidden", { status: 403 });
  const rows = await prisma.mapVersion.findMany({ orderBy: { id: "desc" }, take: 50, select: { id: true, createdAt: true, createdById: true } });
  const ids = [...new Set(rows.flatMap((r) => (r.createdById ? [r.createdById] : [])))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return Response.json(rows.map((r) => ({ id: r.id, createdAt: r.createdAt, createdBy: (r.createdById && names.get(r.createdById)) || null })));
}
