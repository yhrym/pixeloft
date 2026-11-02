import { adminUser, csrfGuard } from "@/lib/auth/route";
import { loadEditorMap, readJson, saveDraft } from "@/lib/map/store";
import { looksLikeMap } from "@/lib/map/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await adminUser())) return new Response("Forbidden", { status: 403 });
  return Response.json(await loadEditorMap());
}

/** 下書きを保存する。検証エラーが残っていてもよい(形だけ確かめる) */
export async function PUT(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const body = await readJson(req);
  if (!looksLikeMap(body)) return Response.json({ error: "badMap" }, { status: 400 });
  await saveDraft(body, admin.id);
  return Response.json({ ok: true });
}
