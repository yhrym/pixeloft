/** マップの下書き・公開のDB操作(サーバー専用) */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { getSettings } from "../settings.ts";
import { dateKey } from "../time.ts";
import { indexOf, invalidateMapIndex, getMapIndex } from "../virtual-office/map.ts";
import { relocateAfterPublish } from "../virtual-office/seat-loss.ts";
import { invalidateShared } from "../virtual-office/state.ts";
import type { OfficeMap } from "../../engine/map.js";
import { emptyMap } from "./empty.ts";
import { MAP_MAX_BYTES } from "./validate.ts";

/** 下書き、なければ最新の公開版、なければ空のマップ */
export async function loadEditorMap(): Promise<{ map: OfficeMap; source: "draft" | "version" | "empty" }> {
  const draft = await prisma.mapDraft.findUnique({ where: { id: 1 } });
  if (draft) return { map: draft.json as unknown as OfficeMap, source: "draft" };
  const v = await prisma.mapVersion.findFirst({ orderBy: { id: "desc" } });
  return v ? { map: v.json as unknown as OfficeMap, source: "version" } : { map: emptyMap(), source: "empty" };
}

export async function saveDraft(map: OfficeMap, userId: string): Promise<void> {
  const json = map as unknown as Prisma.InputJsonValue;
  await prisma.mapDraft.upsert({ where: { id: 1 }, create: { id: 1, json, updatedById: userId }, update: { json, updatedById: userId } });
}

/**
 * 検証済みのマップをMapVersionに足す。今日の在室のうち部屋・席がなくなった人は、同じtransactionで席なし・共用部へ動かす(seat-loss.ts)。
 * 呼ぶ側が先にvalidateMapで通すこと
 */
export async function publishMap(map: OfficeMap, userId: string): Promise<number> {
  invalidateMapIndex();
  const [settings, oldIdx] = await Promise.all([getSettings(), getMapIndex()]);
  const newIdx = indexOf(map);
  const rows = await prisma.voPresence.findMany({ where: { date: dateKey(new Date(), settings.timeZone), leftAt: null }, select: { id: true, room: true, seatId: true } });
  const id = await prisma.$transaction(async (tx) => {
    const v = await tx.mapVersion.create({ data: { json: map as unknown as Prisma.InputJsonValue, createdById: userId }, select: { id: true } });
    for (const r of rows) {
      const to = relocateAfterPublish(oldIdx, newIdx, r);
      if (to) await tx.voPresence.update({ where: { id: r.id }, data: { room: to.room, seatId: null, seatGone: r.seatId !== null } });
    }
    return v.id;
  });
  invalidateMapIndex();
  invalidateShared();
  return id;
}

/** リクエストの本文をJSONで読む。大きすぎる・JSONでないならnull。shortcut: 本文は読み切ってから長さを見る(Content-Lengthが正しければ先に弾く) */
export async function readJson(req: Request, max = MAP_MAX_BYTES + 4096): Promise<unknown | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  try {
    const text = await req.text();
    return text.length > max ? null : JSON.parse(text);
  } catch {
    return null;
  }
}
