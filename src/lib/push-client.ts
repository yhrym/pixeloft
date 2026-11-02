function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** プッシュを出せる環境か。HTTPS(かlocalhost)でないと、ブラウザがサービスワーカーとプッシュを出さない */
export const canPush = () => typeof window !== "undefined" && window.isSecureContext && "PushManager" in window;

/** 通知の許可→Service Worker登録→Push購読→サーバー保存。msgsは画面の言語の文言 */
export async function subscribeToPush(publicKey: string, msgs: { denied: string; saveFailed: string }): Promise<PushSubscription> {
  // クリック直後のユーザー操作として扱わせるため、awaitより前に許可を求める
  if ((await Notification.requestPermission()) !== "granted") throw new Error(msgs.denied);
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const next = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const response = await fetch("/api/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  if (!response.ok) {
    await next.unsubscribe();
    throw new Error((await response.json().catch(() => null))?.error || msgs.saveFailed);
  }
  return next;
}
