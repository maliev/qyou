import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import api from "@/lib/api";

const VAPID_PUBLIC_KEY =
  "BExHJKTGsZWyjhSxZzpFE1y0-0JWNNynvaJcFd2hv1aG3fOVVwQq3kj_1kDZQeWpvX9tuNyValJ4lhjI3w6nKck";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      // Register service worker and wait for it to be active
      const registration = await navigator.serviceWorker.register(
        import.meta.env.BASE_URL + "sw.js"
      );

      // Wait for the SW to be ready (important for iOS)
      const ready = await navigator.serviceWorker.ready;

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      // Check for existing subscription first
      let subscription = await ready.pushManager.getSubscription();

      if (!subscription) {
        // Subscribe to push
        subscription = await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Send subscription to backend
      await api.post("/push/subscribe", {
        subscription: subscription.toJSON(),
      });

      console.log("[Push] Subscription registered successfully");
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      subscribe();
    }
  }, [isAuthenticated, subscribe]);
}
