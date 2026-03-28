import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X, Reply, Pencil } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useEditMessage } from "@/hooks/useMessageActions";
import { queryClient } from "@/lib/queryClient";
import type { Message, MessageDeliveryStatus } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function MessageInput({
  conversationId,
}: {
  conversationId: string;
}) {
  const [text, setText] = useState("");
  const { sendMessage, sendTypingStart, sendTypingStop } = useSocket();
  const {
    addMessage,
    replaceOptimisticMessage,
    updateConversationLastMessage,
    replyToMessage,
    setReplyToMessage,
    editingMessage,
    setEditingMessage,
  } = useChatStore();
  const currentUser = useAuthStore((s) => s.user);
  const editMessageMutation = useEditMessage();
  const { addToQueue, sendWithRetry, removeFromQueue, markFailed } = useMessageQueue();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering edit mode, populate the input with the message content
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  // Focus input when entering reply mode
  useEffect(() => {
    if (replyToMessage) {
      inputRef.current?.focus();
    }
  }, [replyToMessage]);

  // Clear modes when conversation changes
  useEffect(() => {
    setReplyToMessage(null);
    setEditingMessage(null);
    setText("");
  }, [conversationId, setReplyToMessage, setEditingMessage]);

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingStart(conversationId);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }, 3000);
  }, [conversationId, sendTypingStart, sendTypingStop]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }
  }, [conversationId, sendTypingStop]);

  const cancelMode = useCallback(() => {
    if (editingMessage) {
      setEditingMessage(null);
      setText("");
    }
    if (replyToMessage) {
      setReplyToMessage(null);
    }
  }, [editingMessage, replyToMessage, setEditingMessage, setReplyToMessage]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !currentUser) return;

    // Edit mode
    if (editingMessage) {
      try {
        await editMessageMutation.mutateAsync({
          messageId: editingMessage.id,
          content,
          conversationId,
        });
        setEditingMessage(null);
        setText("");
      } catch {
        toast.error("Failed to edit message");
      }
      return;
    }

    // Normal send / reply
    const tempId = crypto.randomUUID();

    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUser.id,
      content,
      status: "sent" as MessageDeliveryStatus,
      created_at: new Date().toISOString(),
      edited_at: null,
      reply_to_id: replyToMessage?.id || null,
      reply_to: replyToMessage
        ? {
            id: replyToMessage.id,
            content: replyToMessage.content,
            sender_id: replyToMessage.sender_id,
            sender_name:
              replyToMessage.sender?.display_name ||
              replyToMessage.sender?.username ||
              "Unknown",
          }
        : null,
      is_edited: false,
      is_deleted: false,
      is_pinned: false,
      forwarded_from_id: null,
      forwarded_from: null,
      reactions: [],
    };

    addMessage(conversationId, optimistic);
    updateConversationLastMessage(conversationId, optimistic);
    setText("");
    const replyId = replyToMessage?.id;
    setReplyToMessage(null);
    stopTyping();

    // Add to queue for retry tracking
    addToQueue({
      tempId,
      conversationId,
      content,
      replyToId: replyId,
      createdAt: optimistic.created_at,
    });

    const success = await sendWithRetry(tempId, async () => {
      const ack = await sendMessage(conversationId, content, tempId, replyId);
      if (ack.message) {
        replaceOptimisticMessage(conversationId, tempId, ack.message);
        updateConversationLastMessage(conversationId, ack.message);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });

    if (!success) {
      // Mark message as failed in the store
      useChatStore.getState().updateMessage(conversationId, tempId, {
        status: "failed" as MessageDeliveryStatus,
      });
    }
  };

  return (
    <div className="border-t border-border">
      {/* Reply / Edit preview bar */}
      {(replyToMessage || editingMessage) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <div
            className={cn(
              "flex items-center gap-2 flex-1 min-w-0",
              editingMessage ? "text-violet-500" : "text-blue-500"
            )}
          >
            {editingMessage ? (
              <Pencil className="h-4 w-4 shrink-0" />
            ) : (
              <Reply className="h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                {editingMessage
                  ? "Editing message"
                  : `Replying to ${replyToMessage?.sender?.display_name || replyToMessage?.sender?.username || "message"}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {editingMessage?.content || replyToMessage?.content}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={cancelMode}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) handleTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === "Escape") {
              cancelMode();
            }
          }}
          placeholder={
            editingMessage
              ? "Edit message..."
              : replyToMessage
                ? "Reply..."
                : "Type a message..."
          }
          className="flex-1 text-base"
        />
        <Button
          size="icon"
          className="min-h-[44px] min-w-[44px] shrink-0"
          onClick={handleSend}
          disabled={!text.trim()}
          aria-label={editingMessage ? "Save edit" : "Send message"}
        >
          {editingMessage ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
