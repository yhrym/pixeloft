/** バーチャルオフィスの状態の組み立て(GET /api/office/state と、ページの初期状態) */
import type { User } from "@prisma/client";
import { t, type Locale } from "../../i18n/index.ts";
import { prisma } from "../db.ts";
import { hasPart, partsIndex } from "../parts/store.ts";
import { getSettings } from "../settings.ts";
import { dateKey } from "../time.ts";
import { recentEmotes } from "./emotes.ts";
import { activeEvent } from "./events.ts";
import { getMapIndex } from "./map.ts";
import { reseatIfLost } from "./seating.ts";
import { clearShortCache, shortCache } from "./short-cache.ts";
import { heartbeat } from "./summary.ts";
import { defaultLook, KEYBOARDS, memoOf, presenceView, TALKING_ROOM_MS, toLook, withoutAnswered } from "./presence.ts";
import type { VoDeco, VoEvent, VoKeyboard, VoMessage, VoPc, VoPerson, VoState } from "./types.ts";
import { VO_REACTIONS } from "./types.ts";

/** sinceなし(ページを開いたとき)に返す出来事の範囲。プッシュを押して開いた声かけに返事できるように */
const RECENT_EVENTS_MS = 15 * 60 * 1000;
const MESSAGES_MAX = 50;
/** この秒数のうちにチャットを書いた人を「話している」として返す */
const TALKING_MS = 8 * 1000;

const userSelect = {
  id: true,
  name: true,
  createdAt: true,
  voProfile: { select: { look: true, deco: true, pc: true, mon: true, keyboard: true, memo: true, memoDate: true } },
} as const;
const presenceSelect = (date: string) => ({ where: { date, leftAt: null }, take: 1 }) as const;

async function loadShared(date: string, now: Date) {
  const [users, talking, talkingRooms] = await Promise.all([
    prisma.user.findMany({
      // 無効化されていない全員(不在でもきせかえを出す)と、今日入室している人
      where: { OR: [{ disabledAt: null }, { voPresences: { some: { date, leftAt: null } } }] },
      select: { ...userSelect, voPresences: presenceSelect(date) },
      orderBy: { createdAt: "asc" },
    }),
    // 話している人(中身と部屋は返さない。自分を除くのはbuildStateで)
    prisma.voMessage.findMany({
      where: { date, createdAt: { gte: new Date(now.getTime() - TALKING_MS) }, deletedAt: null },
      select: { userId: true },
      distinct: ["userId"],
    }),
    // 直近5分に発言があった部屋(全部屋。中身は返さない)
    prisma.voMessage.findMany({
      where: { date, createdAt: { gte: new Date(now.getTime() - TALKING_ROOM_MS) }, deletedAt: null },
      select: { room: true },
      distinct: ["room"],
    }),
  ]);
  return { users, talking, talkingRooms };
}
type Shared = Awaited<ReturnType<typeof loadShared>>;

/** 書き込んだ直後のstateに古い物を返さないよう、操作のたびに捨てる */
export function invalidateShared(): void {
  clearShortCache();
}

/** 全員同じ読み込み。1秒以内・同じキーなら読み込み中の物も含めて同じPromiseを返す。失敗は持ち続けない */
export function sharedState(date: string, now: Date, load = loadShared): Promise<Shared> {
  return shortCache(`shared:${date}`, now, () => load(date, now));
}

/**
 * 自分あての出来事と次のsince。sinceなしなら、それまでの最大idを先に読んでから直近の分を取る
 * (順に読むので、読んでいる間に来た出来事も返すか次のsinceより後に残るかのどちらかになる)
 */
async function eventsSince(userId: string, date: string, now: Date, since?: number) {
  const before =
    since ?? (await prisma.voEvent.findFirst({ where: { toUserId: userId }, orderBy: { id: "desc" }, select: { id: true } }))?.id ?? 0;
  const rows = await prisma.voEvent.findMany({
    where: {
      toUserId: userId,
      date,
      ...(since === undefined ? { createdAt: { gte: new Date(now.getTime() - RECENT_EVENTS_MS) } } : { id: { gt: since } }),
    },
    orderBy: { id: "asc" },
  });
  // 開き直したとき、もう返事した声かけをまた出さない
  const callIds = since === undefined ? rows.filter((e) => e.kind === "call").map((e) => e.id) : [];
  const answered =
    callIds.length === 0
      ? []
      : await prisma.voEvent.findMany({
          where: { fromUserId: userId, kind: "answer", callId: { in: callIds } },
          select: { callId: true },
        });
  return {
    rows: withoutAnswered(rows, answered.map((a) => a.callId!)),
    lastId: Math.max(before, ...rows.map((e) => e.id)),
  };
}

/**
 * 今の状態。呼ぶたびに自分の今日の在室のlastSeenAtを更新する(ハートビートを兼ねる。終業後の自動退出もここで流れる)。
 * sinceは最後に受け取った出来事のid。無ければ直近15分の出来事を返す。idleは最後に触ってからの秒数(無ければ最後に触った時刻を進めない)。
 * localeはお知らせ・名前の無い人の表示に使う、受け取る人の言語
 */
export async function buildState(user: User, locale: Locale, since?: number, idle?: number): Promise<VoState> {
  const now = new Date();
  const [settings, idx, parts] = await Promise.all([getSettings(now), getMapIndex(), partsIndex(now)]);
  const date = dateKey(now, settings.timeZone);
  await heartbeat(user.id, now, settings, idle);

  const [first, events] = await Promise.all([sharedState(date, now), eventsSince(user.id, date, now, since)]);
  let sh: Shared = first;
  let myPresence = sh.users.find((u) => u.id === user.id)?.voPresences[0];
  let notice: string | undefined;
  // 席が消えた人だけ戻す(毎回DBで探さず、使い回している在室から分かる)
  if (myPresence?.seatLost) {
    notice = await reseatIfLost(user, idx, locale, date, now);
    if (notice) {
      invalidateShared();
      sh = await sharedState(date, now);
      myPresence = sh.users.find((u) => u.id === user.id)?.voPresences[0];
    }
  }
  // 公開で席がなくなった人に1回だけ知らせる(席は公開のときに外してある)
  if (!notice && myPresence?.seatGone) {
    notice = t(locale, "vo.notice.seatGone");
    await prisma.voPresence.update({ where: { id: myPresence.id }, data: { seatGone: false } });
    invalidateShared();
  }
  // 在室中は退出も自動退出もしていないので読まない
  const mine = myPresence
    ? { leftAt: null, autoLeft: false }
    : await prisma.voPresence.findUnique({ where: { userId_date: { userId: user.id, date } }, select: { leftAt: true, autoLeft: true } });
  const talking = sh.talking.filter((m) => m.userId !== user.id);
  let users = sh.users;
  if (!users.some((u) => u.id === user.id)) {
    // 無効化されていて在室でもない本人だけ読み足して、createdAtの昇順の位置に入れる
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { ...userSelect, voPresences: presenceSelect(date) } });
    if (me) {
      const i = users.findIndex((u) => u.createdAt > me.createdAt);
      users = i < 0 ? [...users, me] : [...users.slice(0, i), me, ...users.slice(i)];
    }
  }

  const has = hasPart(parts);
  const people: VoPerson[] = users.map((u) => {
    const profile = u.voProfile;
    const presence = u.voPresences[0];
    const mon = profile?.mon;
    return {
      id: u.id,
      name: u.name,
      look: toLook(profile?.look, has) ?? defaultLook(u.id),
      deco: (profile?.deco as VoDeco | null) ?? null,
      pc: (profile?.pc as VoPc) ?? "mac",
      mon: mon === 1 || mon === 2 ? mon : 0,
      keyboard: KEYBOARDS.includes(profile?.keyboard as VoKeyboard) ? profile!.keyboard as VoKeyboard : "none",
      memo: memoOf(profile, date),
      presence: presence ? presenceView(presence, now, idx) : null,
    };
  });

  const room = people.find((p) => p.id === user.id)?.presence?.room;
  // 返すのは今いる部屋の発言だけ(ほかの部屋の中身は返さない)
  const messages: VoMessage[] = room
    ? await shortCache(`msg:${date}:${room}`, now, async () =>
        (
          await prisma.voMessage.findMany({
            where: { date, room },
            orderBy: { createdAt: "desc" },
            take: MESSAGES_MAX,
            select: {
              id: true, room: true, userId: true, text: true, mentions: true, deletedAt: true, createdAt: true,
              user: { select: { name: true } },
              reactions: { select: { kind: true, userId: true }, orderBy: { id: "asc" } },
            },
          })
        )
          .reverse()
          .map((m) => {
            const deleted = m.deletedAt !== null;
            return {
              id: m.id, room: m.room, userId: m.userId, name: m.user.name, createdAt: m.createdAt.toISOString(), deleted,
              // 取り消した発言は、残っている列があっても中身を返さない
              text: deleted ? "" : m.text,
              mentions: deleted ? [] : m.mentions,
              reactions: deleted ? [] : VO_REACTIONS
                .map((kind) => ({ kind, userIds: m.reactions.filter((r) => r.kind === kind).map((r) => r.userId) }))
                .filter((r) => r.userIds.length > 0),
            };
          }),
      )
    : [];

  const names = new Map(people.map((p) => [p.id, p.name]));
  const unknown = [...new Set(events.rows.map((e) => e.fromUserId))].filter((id) => !names.has(id));
  if (unknown.length > 0) {
    for (const u of await prisma.user.findMany({ where: { id: { in: unknown } }, select: { id: true, name: true } })) {
      names.set(u.id, u.name);
    }
  }

  return {
    serverTime: now.toISOString(),
    date,
    meId: user.id,
    people,
    messages,
    events: events.rows.map(
      (e): VoEvent => ({
        id: e.id,
        kind: e.kind as VoEvent["kind"],
        fromUserId: e.fromUserId,
        fromName: names.get(e.fromUserId) ?? t(locale, "vo.formerMember"),
        callId: e.callId,
        answer: (e.answer as VoEvent["answer"]) ?? null,
        createdAt: e.createdAt.toISOString(),
      }),
    ),
    lastEventId: events.lastId,
    talkingUserIds: talking.map((m) => m.userId).filter((id) => people.some((p) => p.id === id && p.presence)),
    talkingRooms: sh.talkingRooms.map((m) => m.room),
    emotes: recentEmotes(now).filter((e) => people.some((p) => p.id === e.userId && p.presence)),
    isAdmin: user.role === "admin",
    partsVersion: parts.version,
    season: activeEvent(settings.seasonMode, date),
    // 公開中のマップにある部屋のURLだけ返す
    meetUrls: Object.fromEntries(Object.entries(settings.callUrls).filter(([id]) => idx.roomById.has(id))),
    autoLeftAt: mine?.autoLeft && mine.leftAt ? mine.leftAt.toISOString() : null,
    ...(notice ? { notice } : {}),
  };
}
