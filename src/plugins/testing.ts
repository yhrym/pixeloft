/** プラグインのテスト用のctx。storeは本物(makeStore)にメモリのDBを渡したもので、順番と複製の動きが本番と同じ。failは本物と同じVoErrorを投げる */
import { makeStore, type PluginDb } from "../lib/plugins/store.ts";
import { VoError } from "../lib/virtual-office/presence.ts";
import type { PluginCtx } from "./types.ts";

export const memoryDb = (): PluginDb => {
  const rows = new Map<string, unknown>();
  return { load: async () => [...rows], save: async (_p, k, v) => { rows.set(k, v); }, remove: async (_p, k) => { rows.delete(k); } };
};

export function makeTestCtx(overrides: Partial<PluginCtx> = {}): PluginCtx {
  const now = overrides.now ?? new Date();
  return {
    user: { id: "u1", name: "U1", isAdmin: false },
    locale: "ja",
    now,
    date: now.toISOString().slice(0, 10),
    t: (key) => key,
    store: makeStore("test", memoryDb()),
    people: async () => [],
    rooms: async () => [],
    items: async () => [],
    fail: (status, key, vars) => { throw new VoError(status, key, vars); },
    ...overrides,
  };
}
