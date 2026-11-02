import { deletePart, updatePart } from "@/lib/parts/service";
import { runVo } from "@/lib/virtual-office/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  return runVo(request, true, (user, _locale, body) => updatePart(user, id, body));
}

export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  return runVo(request, true, (user) => deletePart(user, id));
}
