/** サーバー側のプラグイン: ctx の組み立てと、state・actions・get の呼び出し */
import type { User } from "@prisma/client";
import { CATALOG } from "../../engine/catalog.js";
import { servers } from "../../plugins/generated/server.ts";
import type { PluginCtx, PluginDir, PluginPerson, PluginServer } from "../../plugins/types.ts";
import { t, type Locale } from "../../i18n/index.ts";
import { VoError, isStale, presenceView } from "../virtual-office/presence.ts";
import type { MapIndex } from "../virtual-office/map.ts";
import type { PresenceRow } from "../virtual-office/presence.ts";
import { storeOf } from "./store.ts";

export type CtxBase = {
  user: Pick<User, "id" | "name" | "role">;
  locale: Locale;
  now: Date;
  date: string;
  idx: MapIndex;
  /** 今日の在室の行を持つユーザー(sharedStateのusers) */
  users: () => Promise<{ id: string; name: string; voPresences: PresenceRow[] }[]>;
};

export function makeCtx(id: string, b: CtxBase): PluginCtx {
  return {
    user: { id: b.user.id, name: b.user.name, isAdmin: b.user.role === "admin" },
    locale: b.locale,
    now: b.now,
    date: b.date,
    t: (key, vars) => t(b.locale, key, vars),
    store: storeOf(id),
    people: async () => {
      const out: PluginPerson[] = [];
      for (const u of await b.users()) {
        const p = u.voPresences[0];
        if (!p || isStale(p.lastSeenAt, b.now)) continue; // 地図に出さない人(退出の押し忘れ)は入れない
        const v = presenceView(p, b.now, b.idx);
        out.push({ id: u.id, name: u.name, room: v.room, seatId: v.seatId, away: v.away });
      }
      return out;
    },
    rooms: async () => b.idx.rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind, floor: r.floor })),
    items: async () =>
      (b.idx.map?.floors ?? []).flatMap((f) =>
        f.items
          .filter((i) => i.type.startsWith(id + ":"))
          .map((i) => ({ id: i.id, type: i.type, floor: f.id, x: i.x, y: i.y, dir: i.dir as PluginDir, props: { ...(CATALOG as Record<string, { props?: object }>)[i.type]?.props, ...i.props } })),
      ),
    fail: (status, key, vars) => {
      throw new VoError(status, key, vars);
    },
  };
}

export const STATE_TIMEOUT_MS = 1000;

/** プラグインの state(ctx) を呼ぶ。timeoutMs を過ぎたら投げる(関数そのものは止まらず走り続ける) */
export async function runState(s: PluginServer, ctx: PluginCtx, timeoutMs = STATE_TIMEOUT_MS): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const slow = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${timeoutMs}ms以内に返りませんでした`)), timeoutMs); });
    return await Promise.race([s.state!(ctx), slow]);
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/office/state の plugins。人ごとに呼ぶ。投げた・遅いプラグインの分だけ抜いてログに出す(遅い1つで本体の状態を待たせない) */
export async function pluginStates(b: CtxBase, list: Record<string, PluginServer> = servers, timeoutMs = STATE_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(list).map(async ([id, s]) => {
      if (!s.state) return;
      try {
        const v = await runState(s, makeCtx(id, b), timeoutMs);
        if (v !== undefined) out[id] = v;
      } catch (e) {
        console.error(`plugin ${id}: state:`, e);
      }
    }),
  );
  return out;
}
