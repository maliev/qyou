import { useState } from "react";
import { ArrowLeft, MoreVertical, Ban, Shield, Lock } from "lucide-react";
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
import { useE2EE } from "@/hooks/useE2EE";
import api from "@/lib/api";
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
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const updateConversationE2EE = useChatStore((s) => s.updateConversationE2EE);
  const currentUser = useAuthStore((s) => s.user);
  const conversation = conversations.find((c) => c.id === conversationId);
  const blockMutation = useRespondToContact();
  const { ensureE2EEReady } = useE2EE();
  const [togglingE2EE, setTogglingE2EE] = useState(false);

  const otherParticipant = conversation?.participants.find(
    (p) => p.id !== currentUser?.id
  );

  const isE2EEOn = conversation?.e2ee_enabled ?? false;

  const handleToggleE2EE = async () => {
    if (togglingE2EE) return;
    setTogglingE2EE(true);
    try {
      const newEnabled = !isE2EEOn;
      if (newEnabled) {
        const ready = await ensureE2EEReady();
        if (!ready) {
          toast.error("Failed to initialize encryption keys");
          return;
        }
      }
      await api.patch(`/conversations/${conversationId}/e2ee`, {
        enabled: newEnabled,
      });
      updateConversationE2EE(conversationId, newEnabled);
      toast.success(
        newEnabled ? "Secret Chat enabled" : "Secret Chat disabled"
      );
    } catch {
      toast.error("Failed to toggle Secret Chat");
    } finally {
      setTogglingE2EE(false);
    }
  };

  const handleBlock = async () => {
    if (!otherParticipant) return;
    try {
      await blockMutation.mutateAsync({
        userId: otherParticipant.id,
        status: "blocked",
      });
      toast.success("User blocked");
      setActiveConversation(null);
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
        {isE2EEOn && (
          <div className="flex items-center gap-1 text-emerald-500" title="Secret Chat enabled">
            <Lock className="h-4 w-4" />
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
                onClick={handleToggleE2EE}
                disabled={togglingE2EE}
              >
                <Shield className="mr-2 h-4 w-4" />
                {isE2EEOn ? "Disable Secret Chat" : "Enable Secret Chat"}
              </DropdownMenuItem>
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
