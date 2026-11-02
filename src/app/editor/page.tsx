import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { EditorApp } from "./EditorApp";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  return <EditorApp locale={await getLocale()} />;
}
