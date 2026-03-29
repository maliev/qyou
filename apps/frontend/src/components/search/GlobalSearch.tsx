import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Search,
  UserPlus,
  Check,
  Loader2,
  MessageSquare,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useSendContactRequest } from "@/hooks/useContacts";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import type { User, MessageSearchResult, SearchResponse } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type SearchMode = "users" | "messages";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/40 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("users");
  const [userResults, setUserResults] = useState<User[]>([]);
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>(
    []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sendContactRequest = useSendContactRequest();
  const currentUser = useAuthStore((s) => s.user);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const doSearch = useCallback(
    async (q: string, searchMode: SearchMode) => {
      if (q.trim().length < 2) {
        setUserResults([]);
        setMessageResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        if (searchMode === "users") {
          // User search still uses the API (user data is not encrypted)
          const { data } = await api.get<SearchResponse>("/search", {
            params: { q: q.trim(), type: "users", limit: 10 },
          });
          setUserResults(
            (data.users ?? []).filter((u) => u.id !== currentUser?.id)
          );
        } else {
          // Message search: search locally through decrypted messages in chatStore
          const term = q.trim().toLowerCase();
          const allMessages = useChatStore.getState().messages;
          const conversations = useChatStore.getState().conversations;
          const results: MessageSearchResult[] = [];

          for (const [convId, msgs] of Object.entries(allMessages)) {
            const conv = conversations.find((c) => c.id === convId);
            const otherParticipant = conv?.participants.find(
              (p) => p.id !== currentUser?.id
            );

            for (const msg of msgs) {
              if (
                msg.content.toLowerCase().includes(term) &&
                !msg.is_deleted
              ) {
                results.push({
                  id: msg.id,
                  conversation_id: msg.conversation_id,
                  sender_id: msg.sender_id,
                  content: msg.content,
                  created_at: msg.created_at,
                  sender_name:
                    msg.sender?.display_name ||
                    msg.sender?.username ||
                    "Unknown",
                  sender_avatar_url: msg.sender?.avatar_url ?? null,
                  other_participant_name:
                    otherParticipant?.display_name ||
                    otherParticipant?.username ||
                    "Unknown",
                  other_participant_avatar_url:
                    otherParticipant?.avatar_url ?? null,
                });
              }
            }
          }

          // Sort by date descending, limit to 10
          results.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          setMessageResults(results.slice(0, 10));
        }
      } catch {
        setUserResults([]);
        setMessageResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setUserResults([]);
      setMessageResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query, mode), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, doSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddContact = async (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    try {
      await sendContactRequest.mutateAsync(user.id);
      setSentRequests((prev) => new Set(prev).add(user.id));
      toast.success(
        `Contact request sent to ${user.display_name || user.username}`
      );
    } catch {
      toast.error("Failed to send contact request");
    }
  };

  const handleMessageClick = (result: MessageSearchResult) => {
    setActiveConversation(result.conversation_id);
    useChatStore.getState().setTargetMessage(result.id);
    setShowResults(false);
    setQuery("");
  };

  const hasResults =
    mode === "users" ? userResults.length > 0 : messageResults.length > 0;
  const showDropdown =
    showResults && (query.trim().length >= 2 || hasResults);

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={
          mode === "users" ? "Search users..." : "Search messages..."
        }
        className="pl-9 text-base"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setShowResults(false);
            setQuery("");
            setUserResults([]);
            setMessageResults([]);
            e.currentTarget.blur();
          }
        }}
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[400px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {/* Mode toggle tabs */}
          <div className="flex border-b border-border">
            <button
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
                mode === "users"
                  ? "border-b-2 border-violet-500 text-violet-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("users")}
            >
              <Users className="h-3.5 w-3.5" />
              Users
            </button>
            <button
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
                mode === "messages"
                  ? "border-b-2 border-violet-500 text-violet-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("messages")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messages
            </button>
          </div>

          <div className="max-h-[350px] overflow-y-auto">
            {/* Loading state */}
            {isSearching && (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}

            {/* Empty state */}
            {!isSearching && !hasResults && query.trim().length >= 2 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No results for &apos;{query.trim()}&apos;
                {mode === "messages" && (
                  <p className="text-xs mt-1 opacity-60">
                    Searching loaded messages only
                  </p>
                )}
              </div>
            )}

            {/* User results */}
            {!isSearching &&
              mode === "users" &&
              userResults.map((user) => {
                const wasSent = sentRequests.has(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex w-full items-center gap-3 p-3 min-h-[44px] text-left hover:bg-accent transition-colors"
                  >
                    <UserAvatar
                      src={user.avatar_url}
                      displayName={user.display_name}
                      username={user.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.display_name || user.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{user.username} · UIN {user.uin}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {wasSent ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-500"
                          disabled
                          title="Request sent"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Add contact"
                          onClick={(e) => handleAddContact(e, user)}
                          disabled={sendContactRequest.isPending}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

            {/* Message results */}
            {!isSearching &&
              mode === "messages" &&
              messageResults.map((result) => (
                <button
                  key={result.id}
                  className="flex w-full items-center gap-3 p-3 min-h-[44px] text-left hover:bg-accent transition-colors"
                  onClick={() => handleMessageClick(result)}
                >
                  <UserAvatar
                    src={result.other_participant_avatar_url}
                    displayName={result.other_participant_name}
                    username={result.other_participant_name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {result.other_participant_name}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format(new Date(result.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-medium">{result.sender_name}:</span>{" "}
                      {highlightMatch(result.content, query.trim())}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
