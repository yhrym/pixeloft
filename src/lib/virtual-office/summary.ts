/**
 * ハートビート・退出・自動退出(stateから呼ぶ)。
 * 在室の時刻の更新は1人60秒に1回。終業後の自動退出もハートビートのたびにここで流す(流すのは30秒に1回)
 */
import { prisma } from "../db.ts";
import type { Settings } from "../settings.ts";
import { dateKey } from "../time.ts";
import { autoLeaveAt, autoLeaveFrom } from "./presence.ts";

const SEEN_WRITE_EVERY_MS = 60 * 1000;
// shortcut: 1人60秒に1回だけ書く(stateのたびの書き込みを減らす・判定は15分・1時間なので足りる)。プロセス内のMapなので複数プロセスなら各自で書く
const lastWritten = new Map<string, number>();

/**
 * ハートビート: 今日入室していて退出していなければlastSeenAtを今にする(1人60秒に1回だけ書く。15分で離席中・2時間で押し忘れに見せる時計を戻す)。
 * idle(最後に触ってからの秒数)があれば最後に触った時刻もそこまで進める(戻さない)。そのあと終業後の自動退出を流す。
 * 入室していなければ何もしない(自動で入室させない)。自分で押した離席(away)は触らない
 */
export async function heartbeat(userId: string, now: Date, settings: Pick<Settings, "timeZone" | "workEndHour">, idle?: number): Promise<void> {
  const date = dateKey(now, settings.timeZone);
  const key = `${userId}:${date}`;
  const t = now.getTime();
  const prev = lastWritten.get(key);
  if (prev === undefined || t < prev || t - prev >= SEEN_WRITE_EVERY_MS) {
    // 日付のキーで増え続けないよう、今日でないキーを捨てる
    for (const k of lastWritten.keys()) if (!k.endsWith(`:${date}`)) lastWritten.delete(k);
    lastWritten.set(key, t);
    try {
      await writeSeen(userId, date, now, idle);
    } catch (e) {
      // 次の呼び出しで書き直せるよう戻す
      if (prev === undefined) lastWritten.delete(key);
      else lastWritten.set(key, prev);
      throw e;
    }
  }
  // 自分の時刻を進めてから(いま触った人を退出させない)
  await autoLeave(now, settings);
}

async function writeSeen(userId: string, date: string, now: Date, idle?: number): Promise<void> {
  // updateManyはPrismaが1回ずつBEGIN〜COMMITで包むので1本のUPDATEにする。
  // 列はタイムゾーンなしのUTCなので、DBのTimeZone設定によらないようUTCに直して入れる。GREATESTはNULL(idleなし)を無視する
  const seen = now.toISOString();
  const active = idle === undefined ? null : new Date(now.getTime() - idle * 1000).toISOString();
  await prisma.$executeRaw`UPDATE "VoPresence" SET "lastSeenAt" = (${seen}::timestamptz AT TIME ZONE 'UTC'), "lastActiveAt" = GREATEST("lastActiveAt", (${active}::timestamptz AT TIME ZONE 'UTC')) WHERE "userId" = ${userId} AND "date" = ${date} AND "leftAt" IS NULL`;
}

/** 退出: 在室中なら退出にして(同時に来ても1回だけ)、その日のひとことを消す。手で押した退出と終業後の自動退出(auto)で同じ */
export async function leaveOffice(userId: string, date: string, now: Date, auto = false): Promise<void> {
  const { count } = await prisma.voPresence.updateMany({ where: { userId, date, leftAt: null }, data: { leftAt: now, away: false, autoLeft: auto } });
  if (count > 0) await prisma.voProfile.updateMany({ where: { userId }, data: { memo: "", memoDate: null } });
}

const AUTO_LEAVE_EVERY_MS = 30 * 1000;
// shortcut: 30秒に1回だけ流す(stateのたびに全員を読んでいた)。プロセス内の時刻なので複数プロセスなら各自で流す
let lastAutoLeaveAt = 0;

/** 終業後の自動退出: 今日の在室で、最後に触ってからの期限(presence.tsのautoLeaveAt)を過ぎた人を退出させる */
export async function autoLeave(now: Date, settings: Pick<Settings, "timeZone" | "workEndHour">): Promise<void> {
  const date = dateKey(now, settings.timeZone);
  if (now < autoLeaveFrom(date, settings.timeZone, settings.workEndHour)) return; // 終業時刻より前に期限の来る人はいない
  const t = now.getTime();
  if (t >= lastAutoLeaveAt && t - lastAutoLeaveAt < AUTO_LEAVE_EVERY_MS) return;
  lastAutoLeaveAt = t;
  const rows = await prisma.voPresence.findMany({ where: { date, leftAt: null }, select: { userId: true, lastActiveAt: true } });
  for (const r of rows) if (autoLeaveAt(r.lastActiveAt, settings.timeZone, settings.workEndHour) <= now) await leaveOffice(r.userId, date, now, true);
}
