import { useEffect, useCallback, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { decryptMessages } from "@/lib/e2ee/decryptMessages";
import type { Message } from "@/types";

const EMPTY_MESSAGES: Message[] = [];

export function useMessages(conversationId: string | null) {
  const setMessages = useChatStore((s) => s.setMessages);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const storeMessages = useChatStore((s) =>
    conversationId ? s.messages[conversationId] : undefined
  );
  const messages = storeMessages ?? EMPTY_MESSAGES;
  const [hasMore, setHasMore] = useState(true);

  const query = useQuery<{ messages: Message[]; hasMore: boolean }>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data } = await api.get(
        `/conversations/${conversationId}/messages`
      );
      return data;
    },
    enabled: !!conversationId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (query.data && conversationId) {
      // API returns newest-first; reverse for chronological order
      const reversed = [...query.data.messages].reverse();
      // Decrypt any encrypted messages before storing
      decryptMessages(reversed).then((decrypted) => {
        setMessages(conversationId, decrypted);
      });
      setHasMore(query.data.hasMore);
    }
  }, [query.data, conversationId, setMessages]);

  const fetchMore = useCallback(async () => {
    if (!conversationId || !hasMore || messages.length === 0) return;

    const oldest = messages[0];
    const { data } = await api.get(
      `/conversations/${conversationId}/messages`,
      { params: { before: oldest.created_at } }
    );

    if (data.messages.length > 0) {
      const reversed = [...(data.messages as Message[])].reverse();
      const decrypted = await decryptMessages(reversed);
      prependMessages(conversationId, decrypted);
    }
    setHasMore(data.hasMore);
  }, [conversationId, hasMore, messages, prependMessages]);

  return {
    messages,
    isLoading: query.isLoading,
    error: query.error,
    fetchMore,
    hasMore,
  };
}
