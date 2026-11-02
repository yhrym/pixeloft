// devのホットリロードと、routeごとに別のバンドルになる場合でも同じMapを見るためglobalThisに置く(Prismaクライアントと同じ)
const g = globalThis as unknown as { voShortCache?: Map<string, { at: number; ttl: number; value: Promise<unknown> }> };
const cache = (g.voShortCache ??= new Map());

// shortcut: プロセス内で1秒だけ使い回す(30人が同じ物を読み直していた)。appを複数プロセスにしたら各プロセスが自分で読むだけ
export function shortCache<T>(key: string, now: Date, load: () => Promise<T>, ttlMs = 1000): Promise<T> {
  const t = now.getTime();
  const hit = cache.get(key);
  if (hit && t >= hit.at && t - hit.at < hit.ttl) return hit.value as Promise<T>;
  // 日付や部屋のキーが増え続けて古い結果を抱えないよう、入れ替えのたびに期限切れを捨てる
  for (const [k, e] of cache) if (t - e.at >= e.ttl) cache.delete(k);
  const value = load();
  const entry = { at: t, ttl: ttlMs, value };
  cache.set(key, entry);
  value.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return value;
}

export function clearShortCache(prefix?: string): void {
  if (prefix === undefined) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
