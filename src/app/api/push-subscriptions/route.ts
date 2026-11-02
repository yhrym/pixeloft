import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/auth/route";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { t } from "@/i18n";
import { getLocale } from "@/lib/locale";

export const runtime = "nodejs";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

const MAX = 2048;

function validSubscription(value: SubscriptionInput) {
  const endpoint = typeof value.endpoint === "string" ? value.endpoint : "";
  const p256dh = typeof value.keys?.p256dh === "string" ? value.keys.p256dh : "";
  const auth = typeof value.keys?.auth === "string" ? value.keys.auth : "";
  if (!endpoint || !p256dh || !auth || endpoint.length > MAX || p256dh.length > MAX || auth.length > MAX) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await request.json();
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = csrfGuard(request);
  if (denied) return denied;
  const me = await getCurrentUser();
  const locale = await getLocale();
  if (!me) return NextResponse.json({ error: t(locale, "vo.err.login") }, { status: 401 });

  const subscription = validSubscription((await readJson(request)) ?? {});
  if (!subscription) return NextResponse.json({ error: t(locale, "push.invalid") }, { status: 400 });

  // endpointはブラウザ固有。リクエスト中のログイン本人だけに紐付ける。
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId: me.id, ...subscription },
    update: { userId: me.id, p256dh: subscription.p256dh, auth: subscription.auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = csrfGuard(request);
  if (denied) return denied;
  const me = await getCurrentUser();
  const locale = await getLocale();
  if (!me) return NextResponse.json({ error: t(locale, "vo.err.login") }, { status: 401 });
  const body = await readJson(request);
  if (typeof body?.endpoint !== "string" || !body.endpoint) return NextResponse.json({ error: t(locale, "push.invalid") }, { status: 400 });
  // deleteManyに本人のIDも加え、他者のendpointを指定しても削除できない。
  await prisma.pushSubscription.deleteMany({ where: { userId: me.id, endpoint: body.endpoint } });
  return NextResponse.json({ ok: true });
}
