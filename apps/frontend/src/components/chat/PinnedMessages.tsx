import { Pin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePinnedMessages } from "@/hooks/useMessageActions";
import { format } from "date-fns";

export function PinnedMessages({
  conversationId,
}: {
  conversationId: string;
}) {
  const { pinnedMessages, isLoading } = usePinnedMessages(conversationId);

  if (pinnedMessages.length === 0 && !isLoading) return null;

  return (
    <Sheet>
      <SheetTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground h-8 px-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
        <Pin className="h-3 w-3" />
        {pinnedMessages.length} pinned
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Pinned Messages</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)] mt-4">
          <div className="space-y-3 pr-2">
            {pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-lg bg-muted p-3 text-sm"
              >
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {msg.sender?.display_name || msg.sender?.username || "Unknown"}
                </p>
                <p className="break-words whitespace-pre-wrap">
                  {msg.content}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(msg.created_at), "MMM d, HH:mm")}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
