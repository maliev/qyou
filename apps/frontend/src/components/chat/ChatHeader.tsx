import { ArrowLeft, MoreVertical, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PinnedMessages } from "./PinnedMessages";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { usePresence } from "@/hooks/usePresence";
import { useRespondToContact } from "@/hooks/useContacts";
import { useShallow } from "zustand/react/shallow";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import type { User } from "@/types";

function ParticipantInfo({ participant }: { participant: User }) {
  const presence = usePresence(participant.id);

  const statusText =
    presence.status === "online"
      ? "Online"
      : presence.lastSeenAt
        ? `Last seen ${formatRelativeTime(presence.lastSeenAt)}`
        : "Offline";

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <UserAvatar
        src={participant.avatar_url}
        displayName={participant.display_name}
        username={participant.username}
        size="md"
        showPresence
        presenceStatus={presence.status}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {participant.display_name || participant.username}
        </p>
        <p className="text-xs text-muted-foreground">{statusText}</p>
      </div>
    </div>
  );
}

export function ChatHeader({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack?: () => void;
}) {
  const conversations = useChatStore(useShallow((s) => s.conversations));
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const currentUser = useAuthStore((s) => s.user);
  const conversation = conversations.find((c) => c.id === conversationId);
  const blockMutation = useRespondToContact();

  const otherParticipant = conversation?.participants.find(
    (p) => p.id !== currentUser?.id
  );

  const handleBlock = async () => {
    if (!otherParticipant) return;
    try {
      await blockMutation.mutateAsync({
        userId: otherParticipant.id,
        status: "blocked",
      });
      toast.success("User blocked");
      setActiveConversationId(null);
    } catch {
      toast.error("Failed to block user");
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 p-3 min-h-[56px]">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px] md:hidden"
            onClick={onBack}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {otherParticipant ? (
          <ParticipantInfo participant={otherParticipant} />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              Conversation
            </p>
          </div>
        )}
        <PinnedMessages conversationId={conversationId} />
        {otherParticipant && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                aria-label="Chat options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleBlock}
              >
                <Ban className="mr-2 h-4 w-4" />
                Block user
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Separator />
    </>
  );
}
