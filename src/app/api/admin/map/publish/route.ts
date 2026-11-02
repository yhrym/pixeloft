import { adminUser, csrfGuard } from "@/lib/auth/route";
import { publishMap, readJson } from "@/lib/map/store";
import { hasErrors, validateMap } from "@/lib/map/validate";
import type { OfficeMap } from "@/engine/map.js";

/** 本文はマップのJSON。サーバーで検証し、エラーがあれば400で{issues}を返す。通れば{id, issues(警告)} */
export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const body = await readJson(req);
  const issues = validateMap(body);
  if (body === null || hasErrors(issues)) return Response.json({ issues }, { status: 400 });
  return Response.json({ id: await publishMap(body as OfficeMap, admin.id), issues });
}
