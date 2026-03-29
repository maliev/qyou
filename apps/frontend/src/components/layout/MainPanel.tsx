import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { MessageSquare, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShallow } from "zustand/react/shallow";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "@/lib/api";

function BlockedOverlay({
  userName,
  onUnblock,
  isUnblocking,
}: {
  userName: string;
  onUnblock: () => void;
  isUnblocking: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <Ban className="h-12 w-12 opacity-30" />
      <p className="text-base font-medium">You have blocked {userName}</p>
      <Button variant="outline" size="sm" onClick={onUnblock} disabled={isUnblocking}>
        {isUnblocking ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Unblock
      </Button>
    </div>
  );
}

export function MainPanel({ onBack }: { onBack?: () => void }) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore(useShallow((s) => s.conversations));
  const currentUser = useAuthStore((s) => s.user);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [checkingBlock, setCheckingBlock] = useState(false);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const otherParticipant = conversation?.participants.find(
    (p) => p.id !== currentUser?.id
  );

  const checkBlockStatus = useCallback(async () => {
    if (!otherParticipant) {
      setIsBlockedByMe(false);
      return;
    }
    setCheckingBlock(true);
    try {
      const { data } = await api.get<{ contacts: Array<{ user: { id: string } }> }>("/contacts/blocked");
      const blocked = data.contacts.some((c) => c.user.id === otherParticipant.id);
      setIsBlockedByMe(blocked);
    } catch {
      setIsBlockedByMe(false);
    } finally {
      setCheckingBlock(false);
    }
  }, [otherParticipant]);

  useEffect(() => {
    if (activeConversationId) {
      checkBlockStatus();
    } else {
      setIsBlockedByMe(false);
    }
  }, [activeConversationId, checkBlockStatus]);

  const handleUnblock = async () => {
    if (!otherParticipant) return;
    setIsUnblocking(true);
    try {
      await api.delete(`/contacts/block/${otherParticipant.id}`);
      setIsBlockedByMe(false);
      toast.success("User unblocked");
    } catch {
      toast.error("Failed to unblock user");
    } finally {
      setIsUnblocking(false);
    }
  };

  if (!activeConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquare className="h-16 w-16 opacity-20" />
        <p className="text-base">Select a conversation to start chatting</p>
      </div>
    );
  }

  if (isBlockedByMe && otherParticipant) {
    return (
      <div className="flex h-full flex-col bg-background">
        <ChatHeader conversationId={activeConversationId} onBack={onBack} />
        <BlockedOverlay
          userName={otherParticipant.display_name || otherParticipant.username}
          onUnblock={handleUnblock}
          isUnblocking={isUnblocking}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader conversationId={activeConversationId} onBack={onBack} />
      <div className="flex-1 overflow-hidden">
        <MessageList conversationId={activeConversationId} />
      </div>
      <TypingIndicator conversationId={activeConversationId} />
      <MessageInput conversationId={activeConversationId} />
    </div>
  );
}
