import { useState, useRef, useEffect, forwardRef } from "react";
import type { Message } from "@/types";
import { MessageStatus } from "@/components/ui/MessageStatus";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Reply,
  Pencil,
  Trash2,
  Pin,
  Forward,
  SmilePlus,
  Copy,
  RotateCcw,
} from "lucide-react";
import { ReactionPicker } from "./ReactionPicker";
import { ForwardDialog } from "./ForwardDialog";
import { useChatStore } from "@/stores/chatStore";
import {
  useToggleReaction,
  useDeleteMessage,
  usePinMessage,
} from "@/hooks/useMessageActions";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  isHighlighted?: boolean;
  onRetry?: (messageId: string) => void;
}

export const MessageItem = forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem({ message, isOwn, isHighlighted = false, onRetry }, ref) {
  const [showReactions, setShowReactions] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<"above" | "below">("above");
  const [showForward, setShowForward] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const reactionBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isHighlighted) {
      setHighlighted(true);
      const timer = setTimeout(() => setHighlighted(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);
  const setReplyToMessage = useChatStore((s) => s.setReplyToMessage);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const toggleReaction = useToggleReaction();
  const deleteMessage = useDeleteMessage();
  const pinMessage = usePinMessage();
  const userId = useAuthStore((s) => s.user?.id);

  const handleReaction = (emoji: string) => {
    setShowReactions(false);
    toggleReaction.mutate({
      messageId: message.id,
      emoji,
      conversationId: message.conversation_id,
    });
  };

  const handleDelete = (deleteFor: "self" | "everyone") => {
    deleteMessage.mutate({
      messageId: message.id,
      deleteFor,
      conversationId: message.conversation_id,
    });
  };

  const handlePin = () => {
    pinMessage.mutate({
      messageId: message.id,
      conversationId: message.conversation_id,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      ref={ref}
      className={cn(
        "group flex w-full px-4 py-0.5 relative",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn("max-w-[75%] relative")}>
        {/* Reply preview */}
        {message.reply_to && (
          <div
            className={cn(
              "text-xs px-3 py-1.5 mb-0.5 rounded-t-lg border-l-2",
              isOwn
                ? "bg-violet-700/50 border-white/30 text-white/70"
                : "bg-muted/70 border-violet-500 text-muted-foreground"
            )}
          >
            <p className="font-medium text-[11px]">
              {message.reply_to.sender_name}
            </p>
            <p className="truncate">{message.reply_to.content}</p>
          </div>
        )}

        {/* Forwarded label */}
        {message.forwarded_from && (
          <div
            className={cn(
              "text-[11px] px-3 pt-1.5 italic",
              isOwn ? "text-white/50" : "text-muted-foreground"
            )}
          >
            Forwarded from {message.forwarded_from.sender_name}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "px-3 py-2 transition-shadow duration-[2000ms]",
            isOwn
              ? "bg-violet-600 text-white rounded-2xl rounded-br-sm"
              : "bg-muted text-foreground rounded-2xl rounded-bl-sm",
            message.reply_to && "rounded-t-none",
            highlighted && "ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
          )}
        >
          {/* Pin indicator */}
          {message.is_pinned && (
            <div
              className={cn(
                "flex items-center gap-1 text-[11px] mb-1",
                isOwn ? "text-white/50" : "text-muted-foreground"
              )}
            >
              <Pin className="h-3 w-3" />
              Pinned
            </div>
          )}

          <p className="text-sm break-words whitespace-pre-wrap">
            {message.content}
          </p>

          <div className="flex items-center gap-1 mt-1 justify-end">
            {message.is_edited && (
              <span
                className={cn(
                  "text-[11px]",
                  isOwn ? "text-white/40" : "text-muted-foreground/60"
                )}
              >
                edited
              </span>
            )}
            <span
              className={cn(
                "text-xs",
                isOwn ? "text-white/60" : "text-muted-foreground"
              )}
            >
              {format(new Date(message.created_at), "HH:mm")}
            </span>
            {isOwn && <MessageStatus status={message.status} />}
          </div>

          {/* Failed message retry */}
          {(message.status as string) === "failed" && onRetry && (
            <button
              onClick={() => onRetry(message.id)}
              className="flex items-center gap-1 mt-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Click to retry</span>
              <span className="sm:hidden">Tap to retry</span>
            </button>
          )}
        </div>

        {/* Reactions display */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {message.reactions.map((group) => (
              <button
                key={group.emoji}
                onClick={() => handleReaction(group.emoji)}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors",
                  group.user_ids.includes(userId || "")
                    ? "bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-600"
                    : "bg-muted border-border hover:bg-accent"
                )}
              >
                <span>{group.emoji}</span>
                <span className="text-muted-foreground">{group.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Action buttons (visible on hover) */}
        <div
          className={cn(
            "absolute top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
            isOwn ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"
          )}
        >
          {/* Reaction picker toggle */}
          <div className="relative">
            <button
              ref={reactionBtnRef}
              onClick={() => {
                if (!showReactions && reactionBtnRef.current) {
                  const rect = reactionBtnRef.current.getBoundingClientRect();
                  // 120px = ~60px header + ~50px picker + 10px buffer
                  setPickerPosition(rect.top < 120 ? "below" : "above");
                }
                setShowReactions(!showReactions);
              }}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
            {showReactions && (
              <div
                className={cn(
                  "absolute z-50",
                  pickerPosition === "above"
                    ? "bottom-full mb-1"
                    : "top-full mt-1",
                  isOwn ? "right-0" : "left-0"
                )}
              >
                <ReactionPicker
                  onSelect={handleReaction}
                />
              </div>
            )}
          </div>

          {/* Context menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"}>
              <DropdownMenuItem onClick={() => setReplyToMessage(message)}>
                <Reply className="mr-2 h-4 w-4" />
                Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowForward(true)}>
                <Forward className="mr-2 h-4 w-4" />
                Forward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePin}>
                <Pin className="mr-2 h-4 w-4" />
                {message.is_pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              {isOwn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditingMessage(message)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete("everyone")}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete for everyone
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={() => handleDelete("self")}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete for me
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Forward dialog */}
      {showForward && (
        <ForwardDialog
          messageId={message.id}
          open={showForward}
          onOpenChange={setShowForward}
        />
      )}
    </div>
  );
});
