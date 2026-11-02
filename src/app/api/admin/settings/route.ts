import { adminUser, csrfGuard, redirectTo } from "@/lib/auth/route";
import { parseSettingsForm, saveSettings } from "@/lib/settings";
import { getMapIndex } from "@/lib/virtual-office/map";
import { invalidateShared } from "@/lib/virtual-office/state";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const admin = await adminUser();
  if (!admin) return new Response("Forbidden", { status: 403 });
  const f = await req.formData();
  const idx = await getMapIndex();
  const r = parseSettingsForm((name) => {
    const v = f.get(name);
    return typeof v === "string" ? v : null;
  }, idx.rooms.map((x) => x.id));
  if (!r.ok) return redirectTo(`/admin/settings?e=${r.error}`);
  await saveSettings(r.value);
  invalidateShared(); // 設定の1秒キャッシュも捨てる
  return redirectTo("/admin/settings?saved=1");
}
