// Service Worker for Qyou PWA Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Qyou", body: event.data.text() };
  }

  const title = payload.title || "Qyou";
  const options = {
    body: payload.body || "New message",
    icon: "/qyou/icon.svg",
    badge: "/qyou/icon.svg",
    data: payload.data || {},
    tag: payload.data?.conversationId || "default",
    renotify: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Try to set app badge (supported on Android, not iOS)
      if ("setAppBadge" in navigator) {
        return navigator.setAppBadge().catch(() => {});
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear badge on click
  if ("clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }

  const conversationId = event.notification.data?.conversationId;
  const url = conversationId ? "/qyou/#/" + conversationId : "/qyou/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes("/qyou") && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// Activate immediately (don't wait for old SW to die)
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
