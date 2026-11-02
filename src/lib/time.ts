/** IANAタイムゾーンでの日付・時刻。Intlのフォーマッタはゾーンごとに使い回す */

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmts.set(tz, f);
  }
  return f;
}

function parts(d: Date, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** tzでのYYYY-MM-DD */
export function dateKey(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** tzでの時(0〜23) */
export function hourOf(d: Date, tz: string): number {
  return parts(d, tz).hour;
}

/** UTCとの差(ms)。tzの壁時計 - UTC */
function offsetMs(d: Date, tz: string): number {
  const p = parts(d, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** tzのその日(YYYY-MM-DD)のhour:00の瞬間。DSTの切り替えをまたぐ日は、存在しない時刻なら直後の時刻になる */
export function zonedInstant(date: string, hour: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const t1 = guess - offsetMs(new Date(guess), tz);
  // 切り替えの前後で差が変わるので、求めた時刻の差でもう一度合わせる。合わなければ(存在しない時刻)最初の値
  const t2 = guess - offsetMs(new Date(t1), tz);
  return new Date(offsetMs(new Date(t2), tz) === guess - t2 ? t2 : t1);
}
