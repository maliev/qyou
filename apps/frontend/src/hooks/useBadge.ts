import { useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";

export function useBadge() {
  const conversations = useChatStore((s) => s.conversations);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    const totalUnread = conversations.reduce(
      (sum, c) => sum + (c.unread_count || 0),
      0
    );

    if (totalUnread > 0) {
      navigator.setAppBadge(totalUnread).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [conversations]);
}
