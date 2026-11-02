/** 状態を変えるリクエストのOrigin確認。判定はscheme・host・portを含むorigin完全一致 */

export type CsrfDenial = "cross-site" | "origin-missing" | "origin-mismatch" | "fetch-metadata-mismatch";

export const trustProxy = () => process.env.TRUSTED_PROXY === "1" || process.env.TRUSTED_PROXY === "true";

/**
 * 期待するorigin。trustProxyがtrueのときだけforwardedヘッダーを見る。
 * request.urlはbindしたホスト名で組まれることがあるので、直接接続ではHostヘッダーを優先する。
 */
export function expectedOrigin(request: Request, trust: boolean): string | null {
  try {
    const direct = new URL(request.url);
    const host = (trust ? request.headers.get("x-forwarded-host") : null) ?? request.headers.get("host") ?? direct.host;
    const proto = (trust ? request.headers.get("x-forwarded-proto") : null) ?? direct.protocol.replace(":", "");
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/** 通ってよければnull、駄目なら理由を返す */
export function checkCsrf(request: Request, trust: boolean): CsrfDenial | null {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return "cross-site";
  if (site !== null && site !== "same-origin" && site !== "same-site") return "fetch-metadata-mismatch";

  const origin = request.headers.get("origin");
  if (!origin) return "origin-missing";
  if (origin === "null") return "origin-mismatch";

  const expected = expectedOrigin(request, trust);
  try {
    return new URL(origin).origin === expected ? null : "origin-mismatch";
  } catch {
    return "origin-mismatch";
  }
}
