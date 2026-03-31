import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSocket } from "@/hooks/useSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { useE2EE } from "@/hooks/useE2EE";
import { setCurrentUserId } from "@/lib/e2ee/keyStore";
import { AppShell } from "@/components/layout/AppShell";

export function ChatPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { initializeE2EE } = useE2EE();

  // Initialize WebSocket connection
  useSocket();

  // Tab title + browser notifications for background messages
  useNotifications();

  // Initialize E2EE after auth is confirmed — namespace keys by user ID
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      setCurrentUserId(user.id);
      initializeE2EE();
    }
  }, [isAuthenticated, user?.id, initializeE2EE]);

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell />;
}
