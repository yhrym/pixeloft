import { PART_KINDS, type PartKind } from "@/lib/parts/validate";
import { partsPageData } from "@/lib/parts/page";
import { AdminShell } from "../../components";
import { PartEditor } from "../PartEditor";
import { PARTS_MSG_KEYS, type PartView } from "../lib";

export const dynamic = "force-dynamic";

export default async function NewPart({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const sp = await searchParams;
  const { look, parts, m } = await partsPageData(PARTS_MSG_KEYS);
  // 知らない・消えたidは無視して白紙から始める
  const from = (parts as PartView[]).find((p) => p.id === sp.from) ?? null;
  const kind: PartKind = from?.kind ?? PART_KINDS.find((k) => k === sp.kind) ?? "hair";
  return (
    <AdminShell title={m["parts.editor.new"].replace("{kind}", m[`parts.kind.${kind}`])} back={m["parts.toList"]} backHref="/parts" wide>
      <PartEditor kind={kind} part={null} from={from} parts={parts as PartView[]} look={look} m={m} />
    </AdminShell>
  );
}
