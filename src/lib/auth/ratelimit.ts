// shortcut: プロセス内のMap。アプリは1プロセスで動かす前提。複数にするならDBかRedisへ
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

const MAX_ENTRIES = 10000;
export const failuresSize = () => failures.size;

// 失敗の記録が増え続けないよう、上限を超えたら期限切れを消し、それでも多ければ古い順に消す
function purge(now: number): void {
  if (failures.size <= MAX_ENTRIES) return;
  for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
  for (const k of failures.keys()) { if (failures.size <= MAX_ENTRIES) break; failures.delete(k); }
}

export function loginBlocked(key: string, now = Date.now()): boolean {
  const v = failures.get(key);
  return !!v && v.resetAt > now && v.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const cur = failures.get(key);
  if (cur && cur.resetAt > now) cur.count++;
  else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  purge(now);
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}

// scryptは重いので、同時に回す数を絞る。待たせず断る(待ち行列にすると、遅い応答が溜まる)
const MAX_HASHING = 8;
let hashing = 0;

/** 空きがあれば解放用の関数、満杯ならnull */
export function acquireHashSlot(): (() => void) | null {
  if (hashing >= MAX_HASHING) return null;
  hashing++;
  let done = false;
  return () => { if (!done) { done = true; hashing--; } };
}
