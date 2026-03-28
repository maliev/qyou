import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useContactStore, type PendingContactRequest } from "@/stores/contactStore";
import { useRespondToContact } from "@/hooks/useContacts";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

function RequestCard({ request }: { request: PendingContactRequest }) {
  const respondToContact = useRespondToContact();

  const handleAccept = async () => {
    try {
      await respondToContact.mutateAsync({
        userId: request.contactId,
        status: "accepted",
      });
      toast.dismiss(`contact-request-${request.contactId}`);
      toast.success(
        `${request.fromUser.display_name || request.fromUser.username} added to contacts`
      );
    } catch {
      toast.error("Failed to accept contact request");
    }
  };

  const handleDecline = async () => {
    try {
      await respondToContact.mutateAsync({
        userId: request.contactId,
        status: "rejected",
      });
      toast.dismiss(`contact-request-${request.contactId}`);
    } catch {
      toast.error("Failed to decline contact request");
    }
  };

  const name = request.fromUser.display_name || request.fromUser.username;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <UserAvatar
        src={request.fromUser.avatar_url}
        displayName={request.fromUser.display_name}
        username={request.fromUser.username}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">wants to add you</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 bg-green-600 hover:bg-green-700"
          onClick={handleAccept}
          disabled={respondToContact.isPending}
          title="Accept"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDecline}
          disabled={respondToContact.isPending}
          title="Decline"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ContactRequestNotification() {
  const pendingRequests = useContactStore(useShallow((s) => s.pendingRequests));

  if (pendingRequests.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {pendingRequests.map((request) => (
        <RequestCard key={request.contactId} request={request} />
      ))}
    </div>
  );
}
