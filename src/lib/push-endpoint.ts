// 送り先を既知のプッシュサービスに限る(購読のendpointへサーバーがPOSTするので、内部アドレスへのSSRFを防ぐ)
const EXACT = ["fcm.googleapis.com"]; // Chrome
const SUFFIX = ["push.services.mozilla.com", "push.apple.com", "notify.windows.com"]; // Firefox / Safari / Edge

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  // port: 既定(443)は空文字になる。ドット境界で比べるので evilapple.com は通らない
  if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return false;
  const h = u.hostname;
  return EXACT.includes(h) || SUFFIX.some((s) => h.endsWith(`.${s}`));
}
