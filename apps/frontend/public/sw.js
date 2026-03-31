// Service Worker for Qyou PWA Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || "Qyou";
  const options = {
    body: payload.body || "New message",
    icon: "/qyou/icon.svg",
    badge: "/qyou/icon.svg",
    data: payload.data || {},
    tag: payload.data?.conversationId || "default",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const conversationId = event.notification.data?.conversationId;
  const url = conversationId ? `/qyou/#/${conversationId}` : "/qyou/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if found
      for (const client of windowClients) {
        if (client.url.includes("/qyou") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
