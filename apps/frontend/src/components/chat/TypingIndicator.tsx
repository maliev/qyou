import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useShallow } from "zustand/react/shallow";

const EMPTY_TYPING: string[] = [];

export function TypingIndicator({
  conversationId,
}: {
  conversationId: string;
}) {
  const storeTyping = useChatStore((s) => s.typingUsers[conversationId]);
  const typingUsers = storeTyping ?? EMPTY_TYPING;
  const conversations = useChatStore(useShallow((s) => s.conversations));
  const currentUserId = useAuthStore((s) => s.user?.id);

  if (typingUsers.length === 0) return null;

  // Resolve names from conversation participants
  const conversation = conversations.find((c) => c.id === conversationId);
  const names = typingUsers
    .filter((uid) => uid !== currentUserId)
    .map((uid) => {
      const participant = conversation?.participants.find((p) => p.id === uid);
      return participant?.display_name || participant?.username || "Someone";
    });

  if (names.length === 0) return null;

  const text =
    names.length === 1
      ? `${names[0]} is typing...`
      : `${names.join(" and ")} are typing...`;

  return (
    <div className="px-4 py-1">
      <p className="text-xs text-muted-foreground animate-pulse">{text}</p>
    </div>
  );
}
