import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSocket } from "@/hooks/useSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { AppShell } from "@/components/layout/AppShell";

export function ChatPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Initialize WebSocket connection
  useSocket();

  // Tab title + browser notifications for background messages
  useNotifications();

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell />;
}
