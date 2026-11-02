import type { OfficeMap } from "@/engine/map.js";
import type { Issue } from "@/lib/map/validate";

export type Version = { id: number; createdAt: string; createdBy: string | null };

/** エディタの保存先。アプリ版はサーバーのAPI、Pages版はlocalStorage。publish・versions・restoreがなければ、その画面は出さない */
export type EditorStore = {
  load(): Promise<{ map: OfficeMap; source: string }>;
  saveDraft(map: OfficeMap): Promise<boolean>;
  publish?(map: OfficeMap): Promise<{ ok: true; id: number } | { ok: false; issues?: Issue[] }>;
  versions?(): Promise<Version[]>;
  restore?(id: number): Promise<{ ok: true; id: number; map: OfficeMap } | { ok: false }>;
};

const call = async (path: string, method: string, body?: unknown) => {
  const res = await fetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

/** /editor用。管理者のAPI(下書き・公開・版の一覧と復元) */
export const apiStore: EditorStore = {
  async load() {
    const r = await call("/api/admin/map/draft", "GET");
    if (!r.ok) throw new Error("load");
    return r.data as unknown as { map: OfficeMap; source: string };
  },
  async saveDraft(map) { return (await call("/api/admin/map/draft", "PUT", map).catch(() => null))?.ok === true; },
  async publish(map) {
    const r = await call("/api/admin/map/publish", "POST", map).catch(() => null);
    if (r?.ok) return { ok: true, id: Number(r.data.id) };
    return { ok: false, issues: Array.isArray(r?.data.issues) ? (r.data.issues as Issue[]) : undefined };
  },
  async versions() {
    const r = await call("/api/admin/map/versions", "GET").catch(() => null);
    return r?.ok ? (r.data as unknown as Version[]) : [];
  },
  async restore(id) {
    const r = await call(`/api/admin/map/versions/${id}/restore`, "POST").catch(() => null);
    return r?.ok ? { ok: true, id: Number(r.data.id), map: r.data.map as OfficeMap } : { ok: false };
  },
};
