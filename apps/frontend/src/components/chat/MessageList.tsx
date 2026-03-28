import { useEffect, useRef, useCallback, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "./MessageItem";
import { useMessages } from "@/hooks/useMessages";
import { useSocket } from "@/hooks/useSocket";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { queryClient } from "@/lib/queryClient";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { MessageDeliveryStatus } from "@/types";

export function MessageList({
  conversationId,
}: {
  conversationId: string;
}) {
  const { messages, isLoading, error, fetchMore, hasMore } =
    useMessages(conversationId);
  const { sendMessage, sendMessageRead } = useSocket();
  const { addToQueue, sendWithRetry } = useMessageQueue();
  const currentUser = useAuthStore((s) => s.user);
  const resetUnreadCount = useChatStore((s) => s.resetUnreadCount);
  const { replaceOptimisticMessage, updateConversationLastMessage, updateMessage } = useChatStore();

  const targetMessageId = useChatStore((s) => s.targetMessageId);
  const setTargetMessage = useChatStore((s) => s.setTargetMessage);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevMessagesLenRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Scroll to bottom on initial load and when new messages arrive at the end
  useEffect(() => {
    if (messages.length === 0) return;

    const isNewMessageAtEnd = messages.length > prevMessagesLenRef.current;
    const wasAtBottom =
      isInitialLoadRef.current ||
      (scrollContainerRef.current &&
        scrollContainerRef.current.scrollHeight -
          scrollContainerRef.current.scrollTop -
          scrollContainerRef.current.clientHeight <
          100);

    if (isNewMessageAtEnd && wasAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialLoadRef.current ? "instant" : "smooth" });
    }

    prevMessagesLenRef.current = messages.length;
    isInitialLoadRef.current = false;
  }, [messages.length]);

  // Reset on conversation change
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesLenRef.current = 0;
  }, [conversationId]);

  // Scroll to target message (from search result click)
  useEffect(() => {
    if (!targetMessageId || isLoading) return;

    const dismissHighlight = () => setTargetMessage(null);

    const tryScroll = () => {
      const el = messageRefs.current[targetMessageId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Dismiss on any click/tap, or auto-dismiss after 5s
        document.addEventListener("pointerdown", dismissHighlight, { once: true });
        const timer = setTimeout(() => {
          document.removeEventListener("pointerdown", dismissHighlight);
          dismissHighlight();
        }, 5000);
        return () => { clearTimeout(timer); document.removeEventListener("pointerdown", dismissHighlight); };
      }
      return null;
    };

    // If already in loaded messages, scroll immediately
    const cleanup = tryScroll();
    if (cleanup) return cleanup;

    // Otherwise paginate back to find the message (max 5 pages)
    let cancelled = false;
    (async () => {
      const MAX_PAGES = 5;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (cancelled) return;
        if (!hasMore) break;

        await fetchMore();
        await new Promise((r) => requestAnimationFrame(r));

        if (tryScroll()) return;
      }

      if (!cancelled) {
        toast.info("Message not found in recent history");
        setTargetMessage(null);
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", dismissHighlight);
    };
  }, [targetMessageId, isLoading, hasMore, fetchMore, setTargetMessage]);

  // Mark unread messages as read when viewing
  useEffect(() => {
    if (!currentUser || messages.length === 0) return;

    const unreadIds = messages
      .filter(
        (m) =>
          m.sender_id !== currentUser.id &&
          m.status !== "read"
      )
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      sendMessageRead(conversationId, unreadIds);
      resetUnreadCount(conversationId);
    }
  }, [messages, conversationId, currentUser, sendMessageRead, resetUnreadCount]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    // Preserve scroll position
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    await fetchMore();

    // Restore scroll position after prepending
    requestAnimationFrame(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      }
    });

    setIsLoadingMore(false);
  }, [fetchMore, hasMore, isLoadingMore]);

  const handleRetry = useCallback(
    async (tempId: string) => {
      const msg = messages.find((m) => m.id === tempId);
      if (!msg) return;

      // Reset to pending
      updateMessage(conversationId, tempId, {
        status: "pending" as MessageDeliveryStatus,
      });

      addToQueue({
        tempId,
        conversationId,
        content: msg.content,
        replyToId: msg.reply_to_id ?? undefined,
        createdAt: msg.created_at,
      });

      const success = await sendWithRetry(tempId, async () => {
        const ack = await sendMessage(
          conversationId,
          msg.content,
          tempId,
          msg.reply_to_id ?? undefined
        );
        if (ack.message) {
          replaceOptimisticMessage(conversationId, tempId, ack.message);
          updateConversationLastMessage(conversationId, ack.message);
        }
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      });

      if (!success) {
        updateMessage(conversationId, tempId, {
          status: "failed" as MessageDeliveryStatus,
        });
      }
    },
    [
      messages,
      conversationId,
      sendMessage,
      addToQueue,
      sendWithRetry,
      replaceOptimisticMessage,
      updateConversationLastMessage,
      updateMessage,
    ]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 bg-background text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-20" />
        <p className="text-sm">Failed to load messages</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 bg-background text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-20" />
        <p className="text-sm">No messages yet. Say hello!</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div
        ref={scrollContainerRef}
        className="flex flex-col py-2"
      >
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoadingMore ? "Loading..." : "Load older messages"}
            </Button>
          </div>
        )}

        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            ref={(el) => { messageRefs.current[msg.id] = el; }}
            message={msg}
            isOwn={msg.sender_id === currentUser?.id}
            isHighlighted={msg.id === targetMessageId}
            onRetry={handleRetry}
          />
        ))}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
