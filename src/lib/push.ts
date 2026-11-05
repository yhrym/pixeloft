import webpush from "web-push";
import { prisma } from "./db.ts";
import { isAllowedPushEndpoint } from "./push-endpoint.ts";

/** Service Workerへ渡す通知の中身。`tag` が同じ通知は端末上で1件にまとまる。 */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** 対応が必要な通知だけ true。押すまで画面に残す */
  requireInteraction?: boolean;
};

type Subscription = { endpoint: string; p256dh: string; auth: string };
type Send = (subscription: Subscription, payload: string) => Promise<unknown>;

type Vapid = { publicKey: string; privateKey: string };
const isVapid = (v: unknown): v is Vapid =>
  typeof v === "object" && v !== null && typeof (v as Vapid).publicKey === "string" && typeof (v as Vapid).privateKey === "string";

// shortcut: プロセスごとに1回読む。鍵を作り直す操作はない(作り直すと全員の購読が無効になる)
let vapid: Promise<Vapid> | null = null;

/** DBのVoSetting "vapid"。なければ作る(同時に作っても、先に入った1つだけが残る) */
export function getVapid(): Promise<Vapid> {
  vapid ??= (async () => {
    const gen = () => { const k = webpush.generateVAPIDKeys(); return { publicKey: k.publicKey, privateKey: k.privateKey }; };
    const read = async () => (await prisma.voSetting.findUnique({ where: { key: "vapid" } }))?.value;
    let v = await read();
    if (!isVapid(v)) {
      await prisma.voSetting.createMany({ data: [{ key: "vapid", value: gen() }], skipDuplicates: true });
      v = await read();
    }
    if (!isVapid(v)) throw new Error("vapid keys missing");
    return v;
  })().catch((e) => {
    vapid = null;
    throw e;
  });
  return vapid;
}

/**
 * VAPIDのsubject。APP_URLがhttpsならそれ、なければmailto。
 * shortcut: mailtoは連絡先のない固定の宛先。プッシュのサービスが連絡を要求するようになったら設定に足す
 */
export function vapidSubject(appUrl = process.env.APP_URL): string {
  return appUrl?.startsWith("https://") ? appUrl : "mailto:admin@example.com";
}

async function configure() {
  const v = await getVapid();
  webpush.setVapidDetails(vapidSubject(), v.publicKey, v.privateKey);
}

const sendWithWebPush: Send = (subscription, payload) =>
  webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    payload,
    { TTL: 60 * 60 * 12, urgency: "high" },
  );

/**
 * 購読ごとに送る。失敗はログのみ。ブラウザ側で解除済み(404/410)の購読は
 * `expired` に返し、呼び出し側で削除する。
 */
export async function deliver(
  subscriptions: Subscription[],
  payload: PushPayload,
  send: Send = sendWithWebPush,
): Promise<{ sent: number; expired: string[] }> {
  let sent = 0;
  const expired: string[] = [];
  for (const subscription of subscriptions) {
    // 保存済みでも許可外の送り先には送らず、失効扱いにして消す
    if (!isAllowedPushEndpoint(subscription.endpoint)) { expired.push(subscription.endpoint); continue; }
    try {
      await send(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) expired.push(subscription.endpoint);
      console.error("Web Push delivery failed", { tag: payload.tag, statusCode });
    }
  }
  return { sent, expired };
}

/** 1ユーザーの購読へ送り、失効した購読を消す。例外を投げないので、`after(() => notifyUser(...))` で投げっぱなしにしてよい */
export async function notifyUser(userId: string, payload: PushPayload): Promise<{ sent: number }> {
  try {
    await configure();
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    const { sent, expired } = await deliver(subscriptions, payload);
    if (expired.length > 0) await prisma.pushSubscription.deleteMany({ where: { userId, endpoint: { in: expired } } });
    return { sent };
  } catch (error) {
    console.error("Web Push notify failed", { tag: payload.tag, error });
    return { sent: 0 };
  }
}
