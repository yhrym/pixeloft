import { NextResponse } from "next/server";
import { checkCsrf, expectedOrigin, trustProxy } from "./csrf.ts";
import { getCurrentUser } from "./session.ts";

/** 状態を変えるPOSTの入口。Originがだめならレスポンスを返す */
export function csrfGuard(req: Request): Response | null {
  if (checkCsrf(req, trustProxy())) return new Response("Forbidden", { status: 403 });
  return null;
}

/** 管理者だけ。だめならnull */
export async function adminUser() {
  const u = await getCurrentUser();
  return u?.role === "admin" ? u : null;
}

export const secureCookie = (req: Request) =>
  !!process.env.APP_URL?.startsWith("https") || !!expectedOrigin(req, trustProxy())?.startsWith("https");

/** 発行したリンクに使うorigin。APP_URLがあればそれ */
export const publicOrigin = (req: Request) =>
  process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, "") : (expectedOrigin(req, trustProxy()) ?? "");

/** 303でGETに戻す。Locationは相対パスのままでよい */
export const redirectTo = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

/** レート制限のキー用。信頼できるプロキシのときだけ、プロキシが足した末尾のX-Forwarded-Forを使う */
export function clientIp(req: Request): string {
  if (!trustProxy()) return "direct";
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",").pop()?.trim() || "unknown";
}
