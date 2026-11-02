import { createPart, listParts } from "@/lib/parts/service";
import { runVo } from "@/lib/virtual-office/request";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return runVo(request, false, () => listParts());
}

export function POST(request: Request) {
  return runVo(request, true, (user, _locale, body) => createPart(user, body));
}
