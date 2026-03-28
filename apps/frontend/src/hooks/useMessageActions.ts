import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { queryClient } from "@/lib/queryClient";
import type { Message } from "@/types";

export function useToggleReaction() {
  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async ({
      messageId,
      emoji,
      conversationId,
    }: {
      messageId: string;
      emoji: string;
      conversationId: string;
    }) => {
      const { data } = await api.post(`/messages/${messageId}/reactions`, {
        emoji,
      });
      return { ...data, conversationId, messageId };
    },
    onSuccess: (data) => {
      if (!userId) return;
      if (data.action === "add") {
        addReaction(data.conversationId, data.messageId, userId, data.reaction.emoji);
      } else {
        removeReaction(data.conversationId, data.messageId, userId, data.reaction.emoji);
      }
    },
  });
}

export function useEditMessage() {
  const updateMessage = useChatStore((s) => s.updateMessage);

  return useMutation({
    mutationFn: async ({
      messageId,
      content,
      conversationId,
    }: {
      messageId: string;
      content: string;
      conversationId: string;
    }) => {
      const { data } = await api.patch(`/messages/${messageId}`, { content });
      return { message: data.message as Message, conversationId };
    },
    onSuccess: (data) => {
      updateMessage(data.conversationId, data.message.id, {
        content: data.message.content,
        edited_at: data.message.edited_at,
        is_edited: true,
      });
    },
  });
}

export function useDeleteMessage() {
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  return useMutation({
    mutationFn: async ({
      messageId,
      deleteFor,
      conversationId,
    }: {
      messageId: string;
      deleteFor: "self" | "everyone";
      conversationId: string;
    }) => {
      await api.delete(`/messages/${messageId}`, { data: { deleteFor } });
      return { messageId, conversationId };
    },
    onSuccess: (data) => {
      deleteMessage(data.conversationId, data.messageId);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function usePinMessage() {
  const togglePinnedMessage = useChatStore((s) => s.togglePinnedMessage);

  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { data } = await api.post(`/messages/${messageId}/pin`);
      return { ...data, conversationId };
    },
    onSuccess: (data) => {
      togglePinnedMessage(
        data.conversationId,
        data.messageId,
        data.isPinned
      );
    },
  });
}

export function useForwardMessage() {
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { data } = await api.post(`/messages/${messageId}/forward`, {
        conversationId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function usePinnedMessages(conversationId: string | null) {
  const setPinnedMessages = useChatStore((s) => s.setPinnedMessages);
  const pinnedMessages = useChatStore((s) =>
    conversationId ? s.pinnedMessages[conversationId] : undefined
  );

  const query = useQuery<{ messages: Message[] }>({
    queryKey: ["pinned-messages", conversationId],
    queryFn: async () => {
      const { data } = await api.get(
        `/conversations/${conversationId}/pinned`
      );
      return data;
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });

  if (query.data && conversationId) {
    setPinnedMessages(conversationId, query.data.messages);
  }

  return {
    pinnedMessages: pinnedMessages || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
