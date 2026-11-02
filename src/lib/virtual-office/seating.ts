/** 席を取り合うところのDB操作。入室・移動(actions.ts)と、席を外された人の戻し(state.ts)で使う */
import { Prisma } from "@prisma/client";
import type { Locale } from "../../i18n/index.ts";
import { prisma } from "../db.ts";
import type { MapIndex } from "./map.ts";
import { pickSeat, returnNotice, seatingOf, seatlessRoom, STALE_SEAT_MS, VoError, type SeatPick, type Seating } from "./presence.ts";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const seatTaken = () => new VoError(409, "vo.err.seatJustTaken");

/** 自分以外の在室の人の席と、そのうち押し忘れ(ハートビート2時間なし)の人の席 */
export async function loadSeating(date: string, userId: string, now: Date): Promise<Seating> {
  const rows = await prisma.voPresence.findMany({
    where: { date, leftAt: null, userId: { not: userId } },
    select: { seatId: true, lastSeenAt: true },
  });
  return seatingOf(rows, now);
}

/**
 * 席に座る。bumpなら同じtransactionで先に押し忘れの人を席から外し、席なし扱いにする
 * (そのあいだに戻ってきていたら409)。writeは自分の在室の行を書く処理。
 * 同じ席の取り合いは部分ユニークインデックスで409にする。
 */
export async function takeSeat(
  date: string,
  pick: Pick<SeatPick, "seatId" | "bump"> & { fallbackRoom: string | null },
  now: Date,
  write: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      if (pick.bump) {
        const r = await tx.voPresence.updateMany({
          where: { date, seatId: pick.seatId, leftAt: null, lastSeenAt: { lt: new Date(now.getTime() - STALE_SEAT_MS) } },
          data: { ...(pick.fallbackRoom ? { room: pick.fallbackRoom } : {}), seatId: null, seatLost: true, overflow: true },
        });
        if (r.count !== 1) throw seatTaken();
      }
      await write(tx);
    });
  } catch (e) {
    throw isUniqueViolation(e) ? seatTaken() : e;
  }
}

/** 押し忘れで席を外されていた人が戻ってきたら、入室と同じ順で席へ戻す。戻したらお知らせを返す */
export async function reseatIfLost(user: { id: string }, idx: MapIndex, locale: Locale, date: string, now: Date): Promise<string | undefined> {
  const lost = await prisma.voPresence.findFirst({
    where: { userId: user.id, date, leftAt: null, seatLost: true },
    select: { id: true },
  });
  if (!lost) return undefined;
  try {
    const seat = pickSeat(idx, await loadSeating(date, user.id, now));
    await takeSeat(date, { ...seat, fallbackRoom: seatlessRoom(idx) }, now, (tx) =>
      tx.voPresence.update({ where: { id: lost.id }, data: { room: seat.room, seatId: seat.seatId, seatLost: false, overflow: seat.overflow } }),
    );
    return returnNotice(locale, idx, seat.room);
  } catch (e) {
    // 取り合いに負けた・座れる所がない: 席なし扱いのまま、次のポーリングでやり直す
    if (e instanceof VoError) return undefined;
    throw e;
  }
}
