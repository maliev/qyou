import { useChatStore } from "@/stores/chatStore";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { MessageSquare } from "lucide-react";

export function MainPanel({ onBack }: { onBack?: () => void }) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  if (!activeConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquare className="h-16 w-16 opacity-20" />
        <p className="text-base">Select a conversation to start chatting</p>
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
