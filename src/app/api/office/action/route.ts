import { runAction } from "@/lib/virtual-office/actions";
import { runVo } from "@/lib/virtual-office/request";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return runVo(request, true, (user, locale, body, since) => runAction(user, locale, body, since));
}
