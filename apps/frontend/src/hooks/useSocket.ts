import { useEffect, useRef, useCallback } from "react";
import { connect, disconnect, getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { usePresenceStore } from "@/stores/presenceStore";
import { useSocketStore } from "@/stores/socketStore";
import { useContactStore, type PendingContactRequest } from "@/stores/contactStore";
import { queryClient } from "@/lib/queryClient";
import api from "@/lib/api";
import type { Conversation, Message, MessageDeliveryStatus } from "@/types";
import { toast } from "sonner";

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isConnected = useSocketStore((s) => s.isConnected);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    // Prevent React 18 StrictMode double-invoke from creating duplicate connections
    if (connectingRef.current) return;
    connectingRef.current = true;

    useSocketStore.getState().setConnecting(true);
    const socket = connect(accessToken);

    socket.on("connect", () => {
      useSocketStore.getState().setConnected(true);
      useSocketStore.getState().setConnecting(false);
    });

    socket.on("disconnect", () => {
      useSocketStore.getState().setConnected(false);
      useSocketStore.getState().setConnecting(true);
    });

    socket.io.on("reconnect_attempt", () => {
      useSocketStore.getState().setConnecting(true);
    });

    socket.io.on("reconnect_failed", () => {
      useSocketStore.getState().setConnecting(false);
    });

    socket.on(
      "message:new",
      (data: { message: Message; conversationId: string }) => {
        const store = useChatStore.getState();
        store.addMessage(data.conversationId, data.message);
        store.updateConversationLastMessage(data.conversationId, data.message);
        store.incrementUnreadCount(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    );

    socket.on(
      "message:delivered",
      (data: { messageId: string; conversationId: string }) => {
        useChatStore.getState().updateMessageStatus(
          data.conversationId,
          data.messageId,
          "delivered" as MessageDeliveryStatus
        );
      }
    );

    socket.on(
      "message:read",
      (data: { conversationId: string; messageIds: string[] }) => {
        const store = useChatStore.getState();
        for (const msgId of data.messageIds) {
          store.updateMessageStatus(
            data.conversationId,
            msgId,
            "read" as MessageDeliveryStatus
          );
        }
      }
    );

    socket.on(
      "typing",
      (data: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
      }) => {
        useChatStore.getState().setTyping(data.conversationId, data.userId, data.isTyping);
      }
    );

    socket.on(
      "presence:update",
      (data: {
        userId: string;
        status: "online" | "offline";
        lastSeenAt: string;
      }) => {
        usePresenceStore.getState().setPresence(data.userId, {
          status: data.status,
          lastSeenAt: data.lastSeenAt,
        });
      }
    );

    socket.on(
      "contact:request",
      (data: PendingContactRequest) => {
        useContactStore.getState().addPendingRequest(data);
        queryClient.invalidateQueries({ queryKey: ["contacts", "pending"] });
        const name = data.fromUser.display_name || data.fromUser.username;
        toast.info(`${name} wants to add you as a contact`, {
          duration: Infinity,
          id: `contact-request-${data.contactId}`,
        });
      }
    );

    socket.on(
      "conversation:new",
      (data: { conversation: Conversation }) => {
        const { conversations, setConversations } = useChatStore.getState();
        if (!conversations.some((c) => c.id === data.conversation.id)) {
          setConversations([data.conversation, ...conversations]);
        }
        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        const currentUserId = useAuthStore.getState().user?.id;
        const otherParticipant = data.conversation.participants.find(
          (p) => p.id !== currentUserId
        );

        // Remove the other participant from pending requests (both sides)
        if (otherParticipant) {
          useContactStore.getState().removePendingRequest(otherParticipant.id);
        }
        // Invalidate pending contacts queries so the list refetches
        queryClient.invalidateQueries({ queryKey: ["contacts", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["contacts", "all-pending"] });
        queryClient.invalidateQueries({ queryKey: ["contacts"] });

        const name = otherParticipant?.display_name || otherParticipant?.username || "Someone";
        toast.info(`${name} started a conversation with you`);
      }
    );

    // Phase 2 events
    socket.on(
      "message:reaction",
      (data: {
        messageId: string;
        conversationId: string;
        userId: string;
        emoji: string;
        action: "add" | "remove";
      }) => {
        const store = useChatStore.getState();
        if (data.action === "add") {
          store.addReaction(data.conversationId, data.messageId, data.userId, data.emoji);
        } else {
          store.removeReaction(data.conversationId, data.messageId, data.userId, data.emoji);
        }
      }
    );

    socket.on(
      "message:edited",
      (data: {
        messageId: string;
        conversationId: string;
        content: string;
        editedAt: string;
      }) => {
        useChatStore.getState().updateMessage(data.conversationId, data.messageId, {
          content: data.content,
          edited_at: data.editedAt,
          is_edited: true,
        });
      }
    );

    socket.on(
      "message:deleted",
      (data: {
        messageId: string;
        conversationId: string;
        deleteFor: "self" | "everyone";
        userId: string;
      }) => {
        useChatStore.getState().deleteMessage(data.conversationId, data.messageId);
      }
    );

    socket.on(
      "message:pinned",
      (data: {
        messageId: string;
        conversationId: string;
        isPinned: boolean;
        pinnedBy: string;
      }) => {
        useChatStore.getState().togglePinnedMessage(
          data.conversationId,
          data.messageId,
          data.isPinned
        );
      }
    );

    // Phase 3: Handle sync:required on reconnect
    socket.on(
      "sync:required",
      async (data: { conversationIds: string[]; since: string }) => {
        const store = useChatStore.getState();
        for (const convId of data.conversationIds) {
          try {
            const { data: msgData } = await api.get(
              `/conversations/${convId}/messages`
            );
            if (msgData.messages && msgData.messages.length > 0) {
              const reversed = [...(msgData.messages as Message[])].reverse();
              const existing = store.messages[convId] || [];
              const existingIds = new Set(existing.map((m) => m.id));
              const newMsgs = reversed.filter((m) => !existingIds.has(m.id));
              if (newMsgs.length > 0) {
                store.setMessages(convId, [...existing, ...newMsgs]);
              }
            }
          } catch {
            // Silently fail — data will load on conversation open
          }
        }
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    );

    // Heartbeat every 20s
    heartbeatRef.current = setInterval(() => {
      socket.emit("heartbeat");
    }, 20000);

    return () => {
      connectingRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      disconnect();
      useSocketStore.getState().setConnected(false);
    };
  }, [isAuthenticated, accessToken]);

  const sendMessage = useCallback(
    (conversationId: string, content: string, tempId: string, replyToId?: string) => {
      return new Promise<{ success: boolean; message?: Message; tempId: string }>(
        (resolve, reject) => {
          const socket = getSocket();
          if (!socket) return reject(new Error("Not connected"));
          socket.emit(
            "message:send",
            { conversationId, content, tempId, replyToId },
            (ack: { success: boolean; message?: Message; tempId: string; error?: string }) => {
              if (ack.success) resolve(ack);
              else reject(new Error(ack.error || "Send failed"));
            }
          );
        }
      );
    },
    []
  );

  const sendTypingStart = useCallback((conversationId: string) => {
    getSocket()?.emit("typing:start", { conversationId });
  }, []);

  const sendTypingStop = useCallback((conversationId: string) => {
    getSocket()?.emit("typing:stop", { conversationId });
  }, []);

  const sendMessageRead = useCallback(
    (conversationId: string, messageIds: string[]) => {
      getSocket()?.emit(
        "message:read",
        { conversationId, messageIds },
        () => {}
      );
    },
    []
  );

  return {
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    sendMessageRead,
    isConnected,
  };
}
