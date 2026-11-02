// shortcut: プロセス内のMap。アプリは1プロセスで動かす前提。複数にするならDBかRedisへ
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

export function loginBlocked(key: string, now = Date.now()): boolean {
  for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
  return (failures.get(key)?.count ?? 0) >= MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const cur = failures.get(key);
  if (cur && cur.resetAt > now) cur.count++;
  else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
