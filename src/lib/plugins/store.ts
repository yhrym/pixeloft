/** プラグインの保存場所(PluginData)。最初に使ったとき全部の行をメモリに読み、読むのはメモリだけ、書き込みはDBとメモリの両方 */
import { Prisma } from "@prisma/client";
import type { PluginStore } from "../../plugins/types.ts";
import { prisma } from "../db.ts";

export const KEY_MAX = 200;
export const VALUE_MAX_BYTES = 1024 * 1024;

export type PluginDb = {
  load: (plugin: string) => Promise<[string, unknown][]>;
  save: (plugin: string, key: string, value: unknown) => Promise<void>;
  remove: (plugin: string, key: string) => Promise<void>;
};

const prismaDb: PluginDb = {
  load: async (plugin) => (await prisma.pluginData.findMany({ where: { plugin } })).map((r) => [r.key, r.value]),
  save: async (plugin, key, value) => {
    const v = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
    await prisma.pluginData.upsert({ where: { plugin_key: { plugin, key } }, create: { plugin, key, value: v }, update: { value: v } });
  },
  remove: async (plugin, key) => {
    await prisma.pluginData.deleteMany({ where: { plugin, key } });
  },
};

const checkKey = (key: unknown) => {
  if (typeof key !== "string" || key.length === 0 || key.length > KEY_MAX) throw new Error(`plugin store: keyは1〜${KEY_MAX}字の文字列`);
};
/** JSONにして1MBまで。戻すのは保存する形(JSONを通した複製) */
const toJson = (value: unknown) => {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("plugin store: valueはJSONにできる値");
  if (Buffer.byteLength(text) > VALUE_MAX_BYTES) throw new Error("plugin store: valueはJSONで1MBまで");
  return JSON.parse(text) as unknown;
};

export function makeStore(plugin: string, db: PluginDb = prismaDb): PluginStore {
  let loaded: Promise<Map<string, unknown>> | null = null;
  const mem = () => {
    loaded ??= db.load(plugin).then((rows) => new Map(rows));
    loaded.catch(() => { loaded = null; }); // 読めなかったら次の呼び出しで読み直す
    return loaded;
  };
  // update用。(plugin, key)ごとに前の処理が終わってから次を始める
  const tails = new Map<string, Promise<unknown>>();
  const set = async (key: string, value: unknown) => {
    checkKey(key);
    const v = toJson(value);
    const m = await mem();
    await db.save(plugin, key, v);
    m.set(key, v);
  };
  return {
    get: async (key) => {
      checkKey(key);
      const v = (await mem()).get(key);
      return v === undefined ? undefined : structuredClone(v);
    },
    set,
    update: (key, fn) => {
      checkKey(key);
      const run = (tails.get(key) ?? Promise.resolve()).then(async () => {
        const m = await mem();
        const cur = m.get(key);
        const next = await fn(cur === undefined ? undefined : structuredClone(cur));
        await set(key, next);
        return structuredClone(m.get(key)); // メモリの値そのものを渡すと、書き換えでDBとずれる
      });
      const tail = run.catch(() => {});
      tails.set(key, tail);
      void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
      return run;
    },
    delete: async (key) => {
      checkKey(key);
      const m = await mem();
      await db.remove(plugin, key);
      m.delete(key);
    },
    keys: async (prefix = "") => [...(await mem()).keys()].filter((k) => k.startsWith(prefix)),
  };
}

// devのホットリロードや別バンドルでも同じメモリを見るようglobalThisに置く
const g = globalThis as unknown as { voPluginStores?: Map<string, PluginStore> };
export const storeOf = (plugin: string): PluginStore => {
  const all = (g.voPluginStores ??= new Map());
  let s = all.get(plugin);
  if (!s) all.set(plugin, (s = makeStore(plugin)));
  return s;
};
