import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSocket } from "@/hooks/useSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useBadge } from "@/hooks/useBadge";
import { setCurrentUserId } from "@/lib/e2ee/keyStore";
import { AppShell } from "@/components/layout/AppShell";

export function ChatPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // Initialize WebSocket connection
  useSocket();

  // Tab title + browser notifications for background messages
  useNotifications();

  // PWA push notifications via service worker
  usePushNotifications();

  // App badge counter for unread messages
  useBadge();

  // Namespace E2EE keys by user ID (actual init is lazy, on first Secret Chat use)
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      setCurrentUserId(user.id);
    }
  }, [isAuthenticated, user?.id]);

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell />;
}
