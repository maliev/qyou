import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Search, UserPlus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useSendContactRequest } from "@/hooks/useContacts";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types";
import { toast } from "sonner";

export function SearchUsers() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sendContactRequest = useSendContactRequest();
  const currentUser = useAuthStore((s) => s.user);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const { data } = await api.get("/users/search", {
          params: { q: q.trim(), limit: 10 },
        });
        setResults(
          (data.users as User[]).filter((u) => u.id !== currentUser?.id)
        );
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

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
      toast.success(`Contact request sent to ${user.display_name || user.username}`);
    } catch {
      toast.error("Failed to send contact request");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search users..."
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
            setResults([]);
            e.currentTarget.blur();
          }
        }}
      />

      {showResults && (query.trim().length >= 2 || results.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[300px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {isSearching && (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {!isSearching && results.length === 0 && query.trim().length >= 2 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No users found
            </div>
          )}

          {!isSearching &&
            results.map((user) => {
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
        </div>
      )}
    </div>
  );
}
