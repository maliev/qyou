import type { User } from "@/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { usePresence } from "@/hooks/usePresence";
import { useChatStore } from "@/stores/chatStore";

export function ContactItem({ user }: { user: User }) {
  const presence = usePresence(user.id);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  return (
    <button
      className="flex w-full items-center gap-3 p-3 min-h-[44px] text-left hover:bg-accent active:bg-accent rounded-lg transition-colors"
      onClick={() => {
        // TODO: find or create conversation with this user, then set active
        setActiveConversation(null);
      }}
    >
      <UserAvatar
        src={user.avatar_url}
        displayName={user.display_name}
        username={user.username}
        size="md"
        showPresence
        presenceStatus={presence.status}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {user.display_name || user.username}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username}
        </p>
      </div>
    </button>
  );
}
