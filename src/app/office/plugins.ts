import { CATALOG } from "@/engine/catalog.js";
import { clients } from "@/plugins/generated/client";
import type { MapItem } from "@/engine/map.js";
import type { PluginApi, PluginMapItem } from "@/plugins/types";
import { t as tr, type Locale } from "@/i18n";
import type { VoState } from "@/lib/virtual-office/types";

export type PluginEnv = {
  locale: Locale;
  state: () => VoState;
  send: (id: string, action: string, payload?: unknown) => Promise<unknown>;
  get: (id: string, params?: Record<string, string>) => Promise<unknown>;
};

/** 生成した client.ts のプラグインごとに setup(api) を呼ぶ。エンジンを作る前に呼び、menu・ボタン・dock をエンジンの設定に渡す */
export function setupPlugins(env: PluginEnv) {
  const menu: { label: string; onClick: () => void }[] = [];
  const itemButtons: Record<string, string> = {};
  const clicks = new Map<string, (item: PluginMapItem) => void>();
  const listeners = new Map<string, Set<(state: unknown) => void>>();
  const cleanups: (() => void)[] = [];
  const dock = document.createElement("div");
  for (const { id, setup } of clients) {
    const mine = document.createElement("div");
    dock.append(mine);
    const set = new Set<(state: unknown) => void>();
    listeners.set(id, set);
    const api: PluginApi = {
      id,
      locale: env.locale,
      t: (key, vars) => tr(env.locale, key, vars),
      send: (action, payload) => env.send(id, action, payload),
      get: (params) => env.get(id, params),
      state: () => env.state().plugins?.[id],
      onState: (cb) => {
        set.add(cb);
        return () => set.delete(cb);
      },
      me: () => {
        const s = env.state(), p = s.people.find((x) => x.id === s.meId);
        return { id: s.meId, name: p?.name ?? "", isAdmin: s.isAdmin, room: p?.presence?.room ?? null, seatId: p?.presence?.seatId ?? null };
      },
      menu: (label, onClick) => { menu.push({ label, onClick }); },
      onItemClick: (type, label, cb) => { itemButtons[type] = label; clicks.set(type, cb); },
      dock: mine,
      dialog: (title) => {
        const d = document.createElement("dialog"), h = document.createElement("h3"), x = document.createElement("button"), body = document.createElement("div");
        d.className = "win";
        x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", tr(env.locale, "engine.close"));
        h.append(document.createElement("span"), x);
        h.firstElementChild!.textContent = title;
        d.append(h, body);
        // 見た目のCSSは .vo-page の下にあるので、その中に置く
        (dock.closest(".vo-page") ?? document.body).append(d);
        const close = () => d.close();
        x.addEventListener("click", close);
        d.addEventListener("close", () => d.remove());
        d.showModal();
        return { body, close };
      },
    };
    try {
      const cleanup = setup(api);
      if (typeof cleanup === "function") cleanups.push(cleanup);
    } catch (e) {
      console.error(`plugin ${id}: setup:`, e);
    }
  }
  return {
    menu,
    itemButtons: Object.keys(itemButtons).length ? itemButtons : undefined,
    // props はカタログの初期値を混ぜる(ctx.items() と同じ)
    onItemClick: (item: MapItem & { floor: string }) => clicks.get(item.type)?.({ ...item, props: { ...(CATALOG as Record<string, { props?: object }>)[item.type]?.props, ...item.props } }),
    dock: clients.length ? dock : undefined,
    /** 新しい状態を、プラグインの onState に流す */
    emit: (state: VoState) => {
      for (const [id, set] of listeners) for (const cb of set) { try { cb(state.plugins?.[id]); } catch (e) { console.error(`plugin ${id}: onState:`, e); } }
    },
    dispose: () => {
      listeners.clear();
      for (const f of cleanups) { try { f(); } catch (e) { console.error("plugin cleanup:", e); } }
    },
  };
}
