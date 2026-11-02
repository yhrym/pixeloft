import { endSession } from "@/lib/auth/session";
import { csrfGuard, redirectTo } from "@/lib/auth/route";

export async function POST(req: Request) {
  const denied = csrfGuard(req);
  if (denied) return denied;
  await endSession();
  return redirectTo("/login");
}
