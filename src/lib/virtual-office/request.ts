/**
 * バーチャルオフィスのRoute Handlerの共通部品。CSRF・認証・JSONパース・?since=・エラー応答。
 * 認可の根拠はここだけ(middlewareはない)。
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { resolveLocale, t, type Locale } from "../../i18n/index.ts";
import { csrfGuard } from "../auth/route.ts";
import { getCurrentUser } from "../auth/session.ts";
import { parseSince, VoError } from "./presence.ts";

function errorJson(locale: Locale, status: number, key: string, vars?: Record<string, string | number>): NextResponse {
  return NextResponse.json({ error: t(locale, key, vars) }, { status });
}

/** mutate=trueの変異APIはCSRF確認 → 認証 → JSONパースの順に通す */
export async function runVo<T>(
  request: Request,
  mutate: boolean,
  run: (user: User, locale: Locale, body: unknown, since: number | undefined) => Promise<T>,
  /** falseなら?since=を解析しない(プラグインの?since=は本体の意味ではないので、整数でなくても通す) */
  withSince = true,
): Promise<Response> {
  if (mutate) {
    const denied = csrfGuard(request);
    if (denied) return denied;
  }
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.locale, (await headers()).get("accept-language"));
  if (!user) return errorJson(locale, 401, "vo.err.login");

  let body: unknown = {};
  if (mutate) {
    const text = await request.text();
    if (text.length > 10_000) return errorJson(locale, 413, "vo.err.badRequest");
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return errorJson(locale, 422, "vo.err.badRequest");
      }
    }
  }

  try {
    const since = withSince ? parseSince(new URL(request.url).searchParams.get("since")) : undefined;
    return NextResponse.json(await run(user, locale, body, since));
  } catch (error) {
    if (error instanceof VoError) return errorJson(locale, error.status, error.message, error.vars);
    console.error("office:", error);
    return errorJson(locale, 500, "vo.err.server");
  }
}
