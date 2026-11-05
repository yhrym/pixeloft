import { notFound, redirect } from "next/navigation";
import { canModifyPart } from "@/lib/parts/permission";
import { partsPageData } from "@/lib/parts/page";
import { AdminShell } from "../../../components";
import { PartEditor } from "../../PartEditor";
import { PARTS_MSG_KEYS, type PartView } from "../../lib";

export const dynamic = "force-dynamic";

export default async function EditPart({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, look, parts, m } = await partsPageData(PARTS_MSG_KEYS);
  const part = (parts as PartView[]).find((p) => p.id === id);
  if (!part) notFound();
  if (!canModifyPart(user, part)) redirect("/parts");
  return (
    <AdminShell title={m["parts.editor.edit"].replace("{kind}", m[`parts.kind.${part.kind}`])} back={m["parts.toList"]} backHref="/parts" wide>
      <PartEditor kind={part.kind} part={part} parts={parts as PartView[]} look={look} m={m} />
    </AdminShell>
  );
}
