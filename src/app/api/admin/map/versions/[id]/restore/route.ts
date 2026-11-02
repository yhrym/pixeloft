import { prisma } from "@/lib/db";
import { adminUser, csrfGuard } from "@/lib/auth/route";
import { publishMap } from "@/lib/map/store";
import { hasErrors, validateMap } from "@/lib/map/validate";
import type { OfficeMap } from "@/engine/map.js";

/** 古い版をもう一度公開する(新しい行として足す。席の扱いは公開と同じ)。{id, map}を返す */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const id = Number((await params).id);
  const row = Number.isSafeInteger(id) ? await prisma.mapVersion.findUnique({ where: { id }, select: { json: true } }) : null;
  if (!row) return new Response("Not Found", { status: 404 });
  const issues = validateMap(row.json);
  // 古い版が今の検証(エンジンの種類の一覧が変わったなど)に通らないときは公開しない
  if (hasErrors(issues)) return Response.json({ issues }, { status: 400 });
  return Response.json({ id: await publishMap(row.json as unknown as OfficeMap, admin.id), map: row.json, issues });
}
