import { partsPageData } from "@/lib/parts/page";
import { PartsClient } from "./PartsClient";
import { PARTS_MSG_KEYS, type PartView } from "./lib";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  const { user, look, parts, m } = await partsPageData(PARTS_MSG_KEYS);
  return (
    <main className="pg pg-admin pg-wide">
      <PartsClient parts={parts as PartView[]} look={look} meId={user.id} isAdmin={user.role === "admin"} m={m} />
    </main>
  );
}
