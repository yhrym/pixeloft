import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { csrfGuard, redirectTo } from "@/lib/auth/route";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  const user = await getCurrentUser();
  const locale = String((await req.formData()).get("locale"));
  if (!user || (locale !== "ja" && locale !== "en")) return redirectTo("/");
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  return redirectTo("/");
}
