import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import type { Conversation } from "@/types";

export function useConversations() {
  const setConversations = useChatStore((s) => s.setConversations);
  const storeConversations = useChatStore((s) => s.conversations);

  const query = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data } = await api.get("/conversations");
      return data.conversations;
    },
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (query.data) {
      // Preserve local unread_count=0 for the active conversation
      // (read receipts are async, API may still report unread)
      const activeId = useChatStore.getState().activeConversationId;
      const merged = query.data.map((conv) => {
        if (conv.id === activeId) {
          return { ...conv, unread_count: 0 };
        }
        return conv;
      });
      setConversations(merged);
    }
  }, [query.data, setConversations]);

  return {
    conversations: storeConversations,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setConversations = useChatStore((s) => s.setConversations);

  return useMutation({
    mutationFn: async (uin: number) => {
      const { data } = await api.post("/conversations", { uin });
      return data.conversation as Conversation;
    },
    onSuccess: (conversation) => {
      // Optimistically add the new conversation to the cache and store
      queryClient.setQueryData<Conversation[]>(["conversations"], (old) => {
        if (!old) return [conversation];
        if (old.some((c) => c.id === conversation.id)) return old;
        return [conversation, ...old];
      });
      const current = useChatStore.getState().conversations;
      if (!current.some((c) => c.id === conversation.id)) {
        setConversations([conversation, ...current]);
      }
      setActiveConversation(conversation.id);
      // Also trigger a background refetch for full server state
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
