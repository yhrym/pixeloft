import { PART_KINDS, type PartKind } from "@/lib/parts/validate";
import { partsPageData } from "@/lib/parts/page";
import { PartEditor } from "../PartEditor";
import { PARTS_MSG_KEYS, type PartView } from "../lib";

export const dynamic = "force-dynamic";

export default async function NewPart({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const q = (await searchParams).kind;
  const kind: PartKind = PART_KINDS.find((k) => k === q) ?? "hair";
  const { look, parts, m } = await partsPageData(PARTS_MSG_KEYS);
  return (
    <main className="max-w-5xl">
      <h1 className="text-xl">{m["parts.editor.new"]}: {m[`parts.kind.${kind}`]}</h1>
      <PartEditor kind={kind} part={null} parts={parts as PartView[]} look={look} m={m} />
    </main>
  );
}
