import { buildState } from "@/lib/virtual-office/state";
import { parseIdle } from "@/lib/virtual-office/presence";
import { runVo } from "@/lib/virtual-office/request";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return runVo(request, false, (user, locale, _body, since) =>
    buildState(user, locale, since, parseIdle(new URL(request.url).searchParams.get("idle"))),
  );
}
