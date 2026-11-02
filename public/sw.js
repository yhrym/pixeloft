/* global self, clients */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const options = {
    body: data.body,
    // 同じ人からの声かけは1件にまとめる（tagはサーバー側で付ける）
    tag: data.tag || "office",
    renotify: true,
    // 返事が要る通知は押すまで残す
    requireInteraction: Boolean(data.requireInteraction),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(data.title || "Virtual Office", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.split("#")[0] === target.split("#")[0]);
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return clients.openWindow(target);
    }),
  );
});
