import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSocketStore } from "@/stores/socketStore";
import { useChatStore } from "@/stores/chatStore";
import { getSocket } from "@/lib/socket";
import type { Message } from "@/types";

const TITLE = "Qyou";

export function useNotifications() {
  const isConnected = useSocketStore((s) => s.isConnected);
  const unreadRef = useRef(0);
  const permissionRequested = useRef(false);

  // Request notification permission proactively on app load
  useEffect(() => {
    if (
      !permissionRequested.current &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      permissionRequested.current = true;
      Notification.requestPermission();
    }
  }, []);

  const resetTitle = useCallback(() => {
    unreadRef.current = 0;
    document.title = TITLE;
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isConnected) return;

    const handleNewMessage = (data: { message: Message; conversationId: string }) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (data.message.sender_id === currentUserId) return;

      // Don't notify for the active conversation when window is focused
      const activeConvId = useChatStore.getState().activeConversationId;
      if (document.hasFocus() && activeConvId === data.conversationId) return;

      if (!document.hasFocus()) {
        unreadRef.current += 1;
        document.title = `(${unreadRef.current}) ${TITLE}`;
      }

      // Show browser notification if permitted and window not focused
      if (
        !document.hasFocus() &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const sender = data.message.sender;
        const senderName = sender?.display_name || sender?.username || "Someone";
        const preview =
          data.message.content.length > 100
            ? data.message.content.slice(0, 100) + "..."
            : data.message.content;

        const notification = new Notification(senderName, {
          body: preview,
          icon: sender?.avatar_url || "/favicon.ico",
          tag: data.conversationId,
        });

        notification.onclick = () => {
          window.focus();
          useChatStore.getState().setActiveConversation(data.conversationId);
          notification.close();
        };
      }
    };

    socket.on("message:new", handleNewMessage);

    const handleFocus = () => resetTitle();
    window.addEventListener("focus", handleFocus);

    return () => {
      socket.off("message:new", handleNewMessage);
      window.removeEventListener("focus", handleFocus);
      resetTitle();
    };
  }, [isConnected, resetTitle]);

  return null;
}
