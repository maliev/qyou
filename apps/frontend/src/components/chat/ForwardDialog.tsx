import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useForwardMessage } from "@/hooks/useMessageActions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function ForwardDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const conversations = useChatStore((s) => s.conversations);
  const currentUser = useAuthStore((s) => s.user);
  const forwardMessage = useForwardMessage();
  const [forwarding, setForwarding] = useState<string | null>(null);

  const handleForward = async (conversationId: string) => {
    setForwarding(conversationId);
    try {
      await forwardMessage.mutateAsync({ messageId, conversationId });
      toast.success("Message forwarded");
      onOpenChange(false);
    } catch {
      toast.error("Failed to forward message");
    } finally {
      setForwarding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward to...</DialogTitle>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {conversations.map((conv) => {
            const other = conv.participants.find(
              (p) => p.id !== currentUser?.id
            );
            if (!other) return null;
            return (
              <Button
                key={conv.id}
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-2"
                onClick={() => handleForward(conv.id)}
                disabled={forwarding !== null}
              >
                <UserAvatar
                  src={other.avatar_url}
                  displayName={other.display_name}
                  username={other.username}
                  size="sm"
                />
                <span className="truncate text-sm">
                  {other.display_name || other.username}
                </span>
                {forwarding === conv.id && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                )}
              </Button>
            );
          })}
          {conversations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No conversations to forward to
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
