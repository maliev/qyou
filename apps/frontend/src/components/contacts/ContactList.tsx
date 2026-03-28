import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { useConversations } from "@/hooks/useConversations";
import { usePendingContacts, useOutgoingPendingContacts } from "@/hooks/useContacts";
import { usePresence } from "@/hooks/usePresence";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Users, Clock } from "lucide-react";
import { ContactRequestNotification } from "./ContactRequestNotification";
import type { Contact, Conversation, User } from "@/types";

function PendingContactRow({ contact }: { contact: Contact }) {
  const name = contact.user.display_name || contact.user.username;

  return (
    <div className="flex w-full items-center gap-3 p-3 min-h-[60px] rounded-lg opacity-60">
      <div className="relative">
        <UserAvatar
          src={contact.user.avatar_url}
          displayName={contact.user.display_name}
          username={contact.user.username}
          size="md"
        />
        <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted">
          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-muted-foreground">
          {name}
        </p>
        <p className="text-xs text-muted-foreground/60">Pending acceptance</p>
      </div>
    </div>
  );
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const resetUnreadCount = useChatStore((s) => s.resetUnreadCount);
  const currentUser = useAuthStore((s) => s.user);
  const isActive = activeId === conversation.id;

  const otherParticipant = conversation.participants.find(
    (p) => p.id !== currentUser?.id
  );

  if (!otherParticipant) return null;

  const handleClick = () => {
    setActiveConversation(conversation.id);
    resetUnreadCount(conversation.id);
  };

  return (
    <ConversationRowInner
      conversation={conversation}
      participant={otherParticipant}
      isActive={isActive}
      onClick={handleClick}
    />
  );
}

function ConversationRowInner({
  conversation,
  participant,
  isActive,
  onClick,
}: {
  conversation: Conversation;
  participant: User;
  isActive: boolean;
  onClick: () => void;
}) {
  const presence = usePresence(participant.id);
  const lastMsg = conversation.last_message;
  const unread = conversation.unread_count ?? 0;

  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 p-3 min-h-[60px] text-left rounded-lg transition-colors",
        isActive
          ? "bg-violet-600/15 hover:bg-violet-600/20"
          : "hover:bg-accent active:bg-accent"
      )}
      onClick={onClick}
    >
      <UserAvatar
        src={participant.avatar_url}
        displayName={participant.display_name}
        username={participant.username}
        size="md"
        showPresence
        presenceStatus={presence.status}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {participant.display_name || participant.username}
          </p>
          {lastMsg && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(lastMsg.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {lastMsg ? lastMsg.content : "No messages yet"}
          </p>
          {unread > 0 && (
            <Badge className="h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-[10px]">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-2.5 w-40 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactList() {
  const { conversations, isLoading } = useConversations();

  // Fetch incoming pending contacts so the store is populated
  usePendingContacts();

  // Fetch outgoing pending contacts (requests current user sent)
  const { outgoing: outgoingPending } = useOutgoingPendingContacts();

  if (isLoading) return <LoadingSkeleton />;

  return (
    <ScrollArea className="h-full">
      {/* Incoming contact requests (accept/decline) */}
      <ContactRequestNotification />

      {/* Outgoing pending contacts */}
      {outgoingPending.length > 0 && (
        <div className="flex flex-col gap-0.5 p-2">
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending
          </p>
          {outgoingPending.map((contact) => (
            <PendingContactRow key={contact.user.id} contact={contact} />
          ))}
        </div>
      )}

      {/* Active conversations */}
      {conversations.length === 0 && outgoingPending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
          <Users className="h-10 w-10 opacity-20" />
          <p className="text-sm text-center">
            No conversations yet.
            <br />
            Search for users to start chatting.
          </p>
        </div>
      ) : (
        conversations.length > 0 && (
          <div className="flex flex-col gap-0.5 p-2">
            {conversations.map((conv) => (
              <ConversationRow key={conv.id} conversation={conv} />
            ))}
          </div>
        )
      )}
    </ScrollArea>
  );
}
