/** みんなのパーツの操作(GET/POST/PUT/DELETE /api/office/parts)。認証・CSRFはrequest.tsのrunVo、権限はここで確かめる */
import type { User } from "@prisma/client";
import { prisma } from "../db.ts";
import { VoError } from "../virtual-office/presence.ts";
import { canModifyPart } from "./permission.ts";
import { writeParts } from "./store.ts";
import { PARTS_PER_USER, validatePart, type PartInput } from "./validate.ts";

export type PartRow = { id: string; kind: string; name: string; data: unknown; createdById: string; createdByName: string; updatedAt: string };

const select = { id: true, kind: true, name: true, data: true, createdById: true, updatedAt: true, createdBy: { select: { name: true } } } as const;
const view = (r: { id: string; kind: string; name: string; data: unknown; createdById: string; updatedAt: Date; createdBy: { name: string } }): PartRow => ({
  id: r.id, kind: r.kind, name: r.name, data: r.data, createdById: r.createdById, createdByName: r.createdBy.name, updatedAt: r.updatedAt.toISOString(),
});

function parse(body: unknown): PartInput {
  const r = validatePart(body);
  if (!r.ok) throw new VoError(422, r.error.key, r.error.vars);
  return r.part;
}

export async function listParts(): Promise<PartRow[]> {
  return (await prisma.voPart.findMany({ where: { deletedAt: null }, select, orderBy: { createdAt: "asc" } })).map(view);
}

export async function createPart(user: User, body: unknown): Promise<PartRow> {
  const p = parse(body);
  // shortcut: 数えてから作るので、同じ人が同時に作ると上限を1〜2個超えうる。困るなら人ごとの行ロックにする
  return writeParts(async (tx) => {
    if ((await tx.voPart.count({ where: { createdById: user.id, deletedAt: null } })) >= PARTS_PER_USER) throw new VoError(422, "parts.err.limit", { max: PARTS_PER_USER });
    return view(await tx.voPart.create({ data: { kind: p.kind, name: p.name, data: p.data, createdById: user.id }, select }));
  });
}

export async function updatePart(user: User, id: string, body: unknown): Promise<PartRow> {
  const p = parse(body);
  return writeParts(async (tx) => {
    const cur = await tx.voPart.findFirst({ where: { id, deletedAt: null } });
    if (!cur) throw new VoError(404, "parts.err.notFound");
    if (!canModifyPart(user, cur)) throw new VoError(403, "parts.err.forbidden");
    // 種類は変えられない(着ている人の項目が合わなくなる)
    if (cur.kind !== p.kind) throw new VoError(422, "parts.err.kind");
    return view(await tx.voPart.update({ where: { id }, data: { name: p.name, data: p.data }, select }));
  });
}

export async function deletePart(user: User, id: string): Promise<{ ok: true }> {
  await writeParts(async (tx) => {
    const cur = await tx.voPart.findFirst({ where: { id, deletedAt: null } });
    if (!cur) throw new VoError(404, "parts.err.notFound");
    if (!canModifyPart(user, cur)) throw new VoError(403, "parts.err.forbidden");
    await tx.voPart.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  return { ok: true };
}
