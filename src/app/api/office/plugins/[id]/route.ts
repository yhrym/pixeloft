import { getMapIndex } from "@/lib/virtual-office/map";
import { sharedState } from "@/lib/virtual-office/state";
import { VoError } from "@/lib/virtual-office/presence";
import { runVo } from "@/lib/virtual-office/request";
import { makeCtx, runState } from "@/lib/plugins";
import { getSettings } from "@/lib/settings";
import { dateKey } from "@/lib/time";
import { servers } from "@/plugins/generated/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function ctxFor(id: string, user: Parameters<typeof makeCtx>[1]["user"], locale: Parameters<typeof makeCtx>[1]["locale"]) {
  const now = new Date();
  const [settings, idx] = await Promise.all([getSettings(now), getMapIndex()]);
  const date = dateKey(now, settings.timeZone);
  return makeCtx(id, { user, locale, now, date, idx, users: async () => (await sharedState(date, now)).users });
}

const plugin = (id: string) => (Object.hasOwn(servers, id) ? servers[id] : null);

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return runVo(request, false, async (user, locale) => {
    // SameSite=Laxのcookieは他サイトからのリンク遷移でも付くので、ヘッダーがあるときは自分のサイトからだけ通す
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin" && site !== "none") throw new VoError(403, "error.forbidden");
    const s = plugin(id);
    if (!s) throw new VoError(404, "vo.err.noPlugin");
    const get = s.get;
    if (!get) throw new VoError(404, "vo.err.noGet");
    return (await get(await ctxFor(id, user, locale), Object.fromEntries(new URL(request.url).searchParams))) ?? null;
  }, false);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return runVo(request, true, async (user, locale, body) => {
    const s = plugin(id);
    if (!s) throw new VoError(404, "vo.err.noPlugin");
    const { action, payload } = (body ?? {}) as { action?: unknown; payload?: unknown };
    const fn = typeof action === "string" && s.actions && Object.hasOwn(s.actions, action) ? s.actions[action] : null;
    if (!fn) throw new VoError(400, "vo.err.badRequest");
    const ctx = await ctxFor(id, user, locale);
    const result = (await fn(ctx, payload)) ?? null;
    // 操作のあとのstate(このプラグインの分だけ)。操作は保存済みなので、投げた・遅いときはstateを入れずに返す(500にしない)。undefinedのときは入れない(ポーリングと同じ)
    const out: { result: unknown; state?: unknown } = { result };
    if (s.state) {
      try {
        const st = await runState(s, ctx);
        if (st !== undefined) out.state = st;
      } catch (e) {
        console.error(`plugin ${id}: state:`, e);
      }
    }
    return out;
  }, false);
}
