/** バーチャルオフィスの操作(POST /api/office/action)。検証はpresence.tsのparseAction */
import type { User } from "@prisma/client";
import { after } from "next/server";
import { resolveLocale, t, type Locale } from "../../i18n/index.ts";
import { prisma } from "../db.ts";
import { notifyUser } from "../push.ts";
import { getSettings } from "../settings.ts";
import { dateKey } from "../time.ts";
import { hasPart, partsIndex } from "../parts/store.ts";
import { putEmote } from "./emotes.ts";
import { getMapIndex } from "./map.ts";
import {
  chatRoomOf,
  checkMove,
  defaultLook,
  FOCUS_MINUTES_DEFAULT,
  overflowNotice,
  parseAction,
  pickSeat,
  seatlessRoom,
  sentTooSoon,
  unchatTooLate,
  VoError,
} from "./presence.ts";
import { loadSeating, takeSeat } from "./seating.ts";
import { buildState, invalidateShared } from "./state.ts";
import { leaveOffice } from "./summary.ts";
import type { VoDeco, VoKeyboard, VoLook, VoPc, VoState } from "./types.ts";

/** 今日入室している相手。いなければ409 */
async function presentUser(id: string, date: string) {
  const u = await prisma.user.findFirst({
    where: { id, voPresences: { some: { date, leftAt: null } } },
    select: { id: true, name: true, locale: true },
  });
  if (!u) throw new VoError(409, "vo.err.notPresent");
  return u;
}

/** 前の日のチャット(リアクションはカスケードで消える)と出来事は、書き込みのついでに消す */
async function sweepOld(date: string) {
  await prisma.$transaction([
    prisma.voMessage.deleteMany({ where: { date: { lt: date } } }),
    prisma.voEvent.deleteMany({ where: { date: { lt: date } } }),
  ]);
}

export async function runAction(user: User, locale: Locale, body: unknown, since?: number): Promise<VoState> {
  const now = new Date();
  const action = parseAction(body, hasPart(await partsIndex(now)));
  const [settings, idx] = await Promise.all([getSettings(now), getMapIndex()]);
  const date = dateKey(now, settings.timeZone);
  const me = await prisma.voPresence.findUnique({ where: { userId_date: { userId: user.id, date } } });
  const here = me && me.leftAt === null ? me : null;
  const requireHere = () => {
    if (!here) throw new VoError(409, "vo.err.notEntered");
    return here;
  };
  type ProfileFields = { look?: VoLook; deco?: VoDeco | null; pc?: VoPc; mon?: number; keyboard?: VoKeyboard; memo?: string; memoDate?: string | null };
  const upsertProfile = (data: ProfileFields) =>
    prisma.voProfile.upsert({
      where: { userId: user.id },
      // dataのlookがundefinedでも既定の見た目を入れる(...dataの後ろに置く)
      create: { userId: user.id, ...data, look: data.look ?? defaultLook(user.id) },
      update: data,
      select: { userId: true },
    });

  let notice: string | undefined;
  switch (action.type) {
    case "enter": {
      // 二重に押されても入り直さない
      if (here) break;
      // おまかせは同時入室で席を取り合うので、負けたら選び直す(席を指定したときは409のまま)
      for (let attempt = 1; ; attempt++) {
        const seat = pickSeat(idx, { wanted: action.seatId, ...(await loadSeating(date, user.id, now)) });
        const fresh = {
          room: seat.room,
          seatId: seat.seatId,
          status: "work",
          away: false,
          focusUntil: null,
          seatLost: false,
          overflow: seat.overflow,
          leftAt: null,
          enteredAt: now,
          lastSeenAt: now,
          lastActiveAt: now,
          autoLeft: false,
        };
        try {
          await takeSeat(date, { ...seat, fallbackRoom: seatlessRoom(idx) }, now, (tx) =>
            tx.voPresence.upsert({ where: { userId_date: { userId: user.id, date } }, create: { userId: user.id, date, ...fresh }, update: fresh }),
          );
        } catch (e) {
          if (!action.seatId && attempt < 5 && e instanceof VoError && e.status === 409) continue;
          throw e;
        }
        if (seat.overflow) notice = overflowNotice(locale, idx, seat.room, seat.seatId !== null);
        break;
      }
      break;
    }
    case "leave":
      requireHere();
      await leaveOffice(user.id, date, now);
      break;
    case "move": {
      const p = requireHere();
      const { taken, stale } = await loadSeating(date, user.id, now);
      const { bump } = checkMove(idx, action.room, action.seatId, taken, stale);
      await takeSeat(date, { seatId: action.seatId, bump, fallbackRoom: seatlessRoom(idx) }, now, (tx) =>
        tx.voPresence.update({ where: { id: p.id }, data: { room: action.room, seatId: action.seatId, away: false, seatLost: false, overflow: false } }),
      );
      break;
    }
    case "away": {
      const p = requireHere();
      await prisma.voPresence.update({ where: { id: p.id }, data: { away: action.away } });
      break;
    }
    case "status": {
      const p = requireHere();
      const minutes = action.focusMinutes ?? FOCUS_MINUTES_DEFAULT;
      const focusUntil = action.status === "focus" ? new Date(now.getTime() + minutes * 60_000) : null;
      await prisma.voPresence.update({ where: { id: p.id }, data: { status: action.status, focusUntil } });
      break;
    }
    case "memo":
      await upsertProfile({ memo: action.text, memoDate: action.text ? date : null });
      break;
    case "profile":
      // undefinedの項目はPrismaが触らない
      await upsertProfile({ look: action.look, deco: action.deco, pc: action.pc, mon: action.mon, keyboard: action.keyboard });
      break;
    case "chat": {
      const p = requireHere();
      await sweepOld(date);
      await prisma.$transaction(async (tx) => {
        const current = await tx.voPresence.findFirst({ where: { id: p.id, leftAt: null } });
        if (!current) throw new VoError(409, "vo.err.notEntered");
        const room = chatRoomOf(action.room, current.room);
        // 名指しは今日在室していて同じ部屋にいる自分以外だけ残す
        const rows = action.mentions?.length
          ? await tx.voPresence.findMany({ where: { date, leftAt: null, userId: { in: action.mentions, not: user.id } }, select: { userId: true, room: true } })
          : [];
        const sameRoom = new Set(rows.filter((r) => r.room === room).map((r) => r.userId));
        const mentions = (action.mentions ?? []).filter((id) => sameRoom.has(id));
        await tx.voMessage.create({ data: { date, room, userId: user.id, text: action.text, mentions } });
      });
      break;
    }
    case "react": {
      const p = requireHere();
      await prisma.$transaction(async (tx) => {
        // 発言の行をロックして取り消しと順に処理する(同時に来ても、ユニーク制約に当たらず、取り消した発言にリアクションが残らない)
        await tx.$queryRaw`SELECT id FROM "VoMessage" WHERE id = ${action.messageId} FOR UPDATE`;
        const m = await tx.voMessage.findFirst({
          where: { id: action.messageId, date, room: p.room },
          select: { deletedAt: true },
        });
        if (!m) throw new VoError(404, "vo.err.noMessage");
        if (m.deletedAt) throw new VoError(409, "vo.err.messageDeleted");
        const key = { messageId: action.messageId, userId: user.id, kind: action.kind };
        const { count } = await tx.voReaction.deleteMany({ where: key });
        if (count === 0) await tx.voReaction.create({ data: key });
      });
      break;
    }
    case "unchat": {
      await prisma.$transaction(async (tx) => {
        // reactと同じ行ロック
        await tx.$queryRaw`SELECT id FROM "VoMessage" WHERE id = ${action.messageId} FOR UPDATE`;
        const m = await tx.voMessage.findFirst({
          where: { id: action.messageId, userId: user.id, date },
          select: { createdAt: true, deletedAt: true },
        });
        if (!m) throw new VoError(404, "vo.err.noMessage");
        // 二度押しは取り消し済みのまま通す
        if (m.deletedAt) return;
        if (unchatTooLate(m.createdAt, now)) throw new VoError(409, "vo.err.unchatLate");
        await tx.voMessage.update({ where: { id: action.messageId }, data: { deletedAt: now, text: "", mentions: [] } });
        await tx.voReaction.deleteMany({ where: { messageId: action.messageId } });
      });
      break;
    }
    case "call":
    case "wave": {
      requireHere();
      if (action.toUserId === user.id) throw new VoError(422, "vo.err.toSelf");
      const to = await presentUser(action.toUserId, date);
      const last = await prisma.voEvent.findFirst({
        where: { fromUserId: user.id, toUserId: to.id, kind: action.type },
        orderBy: { id: "desc" },
        select: { createdAt: true },
      });
      // shortcut: 読んでから書くまでの間に同時に来た2回目は通る。連打よけなのでそこまでは見ない
      if (sentTooSoon(action.type, last?.createdAt ?? null, now)) throw new VoError(429, "vo.err.tooFast");
      await sweepOld(date);
      await prisma.voEvent.create({ data: { date, toUserId: to.id, fromUserId: user.id, kind: action.type } });
      if (action.type === "call") {
        // 通知の文言は受け取る人の言語
        const toLocale = resolveLocale(to.locale, null);
        after(() =>
          notifyUser(to.id, {
            title: t(toLocale, "vo.push.callTitle", { name: user.name }),
            body: t(toLocale, "vo.push.callBody"),
            url: "/",
            // 同じ人からの声かけは端末の上で1件にまとめる
            tag: `vo-call:${user.id}`,
            requireInteraction: true,
          }),
        );
      }
      break;
    }
    case "emote":
      requireHere();
      if (!putEmote(user.id, action.emote, now)) throw new VoError(429, "vo.err.tooFast");
      break;
    case "answer":
      await prisma.$transaction(async (tx) => {
        // 二度押しが同時に来ても返事は1回だけになるよう、元の声かけの行をロックしてから確かめる
        await tx.$queryRaw`SELECT id FROM "VoEvent" WHERE id = ${action.callId} FOR UPDATE`;
        const call = await tx.voEvent.findFirst({
          where: { id: action.callId, toUserId: user.id, kind: "call", date },
          select: { fromUserId: true },
        });
        if (!call) throw new VoError(404, "vo.err.noCall");
        const done = await tx.voEvent.findFirst({ where: { kind: "answer", callId: action.callId, fromUserId: user.id }, select: { id: true } });
        if (done) throw new VoError(409, "vo.err.alreadyAnswered");
        await tx.voEvent.create({
          data: { date, toUserId: call.fromUserId, fromUserId: user.id, kind: "answer", callId: action.callId, answer: action.answer },
        });
      });
      break;
  }
  // 操作したことも「触った」に数える(idle=0)
  invalidateShared();
  const state = await buildState(user, locale, since, 0);
  return notice ? { ...state, notice } : state;
}
