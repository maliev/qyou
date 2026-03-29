import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Loader2, UserX } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { Contact } from "@/types";

export function BlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlocked = useCallback(async () => {
    try {
      const { data } = await api.get<{ contacts: Contact[] }>("/contacts/blocked");
      setBlockedUsers(data.contacts);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await api.delete(`/contacts/block/${userId}`);
      setBlockedUsers((prev) => prev.filter((c) => c.user.id !== userId));
      toast.success("User unblocked");
    } catch {
      toast.error("Failed to unblock user");
    } finally {
      setUnblockingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No blocked users
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {blockedUsers.map((contact) => (
        <div
          key={contact.user.id}
          className="flex items-center gap-3 rounded-lg border p-3"
        >
          <UserAvatar
            src={contact.user.avatar_url}
            displayName={contact.user.display_name}
            username={contact.user.username}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {contact.user.display_name || contact.user.username}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              @{contact.user.username}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUnblock(contact.user.id)}
            disabled={unblockingId === contact.user.id}
          >
            {unblockingId === contact.user.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <UserX className="mr-1 h-3 w-3" />
                Unblock
              </>
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
