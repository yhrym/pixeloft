/** みんなのパーツのDBまわり。partsVersion(パーツが変わるたびに増える番号)は書き込みと同じトランザクションで進める */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { clearShortCache, shortCache } from "../virtual-office/short-cache.ts";
import type { PartKind } from "./validate.ts";

const VERSION_KEY = "partsVersion";
const CACHE_KEY = "parts:index";

/** 消していないパーツの id→kind と版。着ている物の確認に使う(人ごとには読まない) */
export type PartsIndex = { version: number; kinds: Map<string, PartKind> };

// shortcut: プロセス内で1秒まで使い回す。書き込みのたびに捨てる(アプリは1プロセスの前提)。複数プロセスにしたら最大1秒古い
export function partsIndex(now = new Date()): Promise<PartsIndex> {
  return shortCache(CACHE_KEY, now, async () => {
    const [v, rows] = await Promise.all([
      prisma.voSetting.findUnique({ where: { key: VERSION_KEY } }),
      prisma.voPart.findMany({ where: { deletedAt: null }, select: { id: true, kind: true } }),
    ]);
    return { version: typeof v?.value === "number" ? v.value : 0, kinds: new Map(rows.map((r) => [r.id, r.kind as PartKind])) };
  });
}

/** lookの"u:<id>"が、消していない同じ種類のパーツか */
export const hasPart = (idx: PartsIndex) => (kind: PartKind, id: string) => idx.kinds.get(id) === kind;

/** パーツの書き込みを、版を進める操作と同じトランザクションで行う */
export async function writeParts<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const out = await prisma.$transaction(async (tx) => {
    const r = await run(tx);
    await tx.$executeRaw`INSERT INTO "VoSetting" ("key", "value", "updatedAt") VALUES (${VERSION_KEY}, '1'::jsonb, now())
      ON CONFLICT ("key") DO UPDATE SET "value" = to_jsonb(("VoSetting"."value" #>> '{}')::int + 1), "updatedAt" = now()`;
    return r;
  });
  clearShortCache("parts:");
  return out;
}
