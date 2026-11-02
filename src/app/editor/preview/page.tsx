import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/locale";
import { PreviewFrame } from "./PreviewFrame";

export const dynamic = "force-dynamic";

/** エディタのiframeの中身。エンジンはwindowの大きさでカメラを決めるので、枠ごと別ウィンドウにして描く */
export default async function PreviewPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/");
  return <PreviewFrame locale={await getLocale()} />;
}
