import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSocket } from "@/hooks/useSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { useE2EE } from "@/hooks/useE2EE";
import { AppShell } from "@/components/layout/AppShell";

export function ChatPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { initializeE2EE } = useE2EE();

  // Initialize WebSocket connection
  useSocket();

  // Tab title + browser notifications for background messages
  useNotifications();

  // Initialize E2EE after auth is confirmed
  useEffect(() => {
    if (isAuthenticated) {
      initializeE2EE();
    }
  }, [isAuthenticated, initializeE2EE]);

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell />;
}
