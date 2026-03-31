import { create } from "zustand";
import type { Conversation, Message, MessageDeliveryStatus, ReactionGroup } from "@/types";

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  pinnedMessages: Record<string, Message[]>;
  // Phase 2: reply/edit mode
  replyToMessage: Message | null;
  editingMessage: Message | null;
  // Phase 3: scroll-to-message from search
  targetMessageId: string | null;

  reset: () => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  updateMessageStatus: (
    conversationId: string,
    messageId: string,
    status: MessageDeliveryStatus
  ) => void;
  setTyping: (
    conversationId: string,
    userId: string,
    isTyping: boolean
  ) => void;
  prependMessages: (conversationId: string, messages: Message[]) => void;
  replaceOptimisticMessage: (
    conversationId: string,
    tempId: string,
    realMessage: Message
  ) => void;
  updateConversationLastMessage: (
    conversationId: string,
    message: Message
  ) => void;
  incrementUnreadCount: (conversationId: string) => void;
  resetUnreadCount: (conversationId: string) => void;
  // Phase 2
  addReaction: (conversationId: string, messageId: string, userId: string, emoji: string) => void;
  removeReaction: (conversationId: string, messageId: string, userId: string, emoji: string) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setPinnedMessages: (conversationId: string, messages: Message[]) => void;
  togglePinnedMessage: (conversationId: string, messageId: string, isPinned: boolean, message?: Message) => void;
  setReplyToMessage: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  setTargetMessage: (messageId: string | null) => void;
  updateConversationE2EE: (conversationId: string, enabled: boolean) => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  pinnedMessages: {},
  replyToMessage: null,
  editingMessage: null,
  targetMessageId: null,

  reset: () =>
    set({
      conversations: [],
      activeConversationId: null,
      messages: {},
      typingUsers: {},
      pinnedMessages: {},
      replyToMessage: null,
      editingMessage: null,
      targetMessageId: null,
    }),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, message) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message],
        },
      };
    }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  updateMessageStatus: (conversationId, messageId, status) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.id === messageId ? { ...m, status } : m
          ),
        },
      };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      const updated = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      return {
        typingUsers: { ...state.typingUsers, [conversationId]: updated },
      };
    }),

  prependMessages: (conversationId, messages) =>
    set((state) => {
      const existing = state.messages[conversationId] || [];
      // Deduplicate by id
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = messages.filter((m) => !existingIds.has(m.id));
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...newMsgs, ...existing],
        },
      };
    }),

  replaceOptimisticMessage: (conversationId, tempId, realMessage) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.id === tempId ? realMessage : m
          ),
        },
      };
    }),

  updateConversationLastMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, last_message: message } : c
      ),
    })),

  incrementUnreadCount: (conversationId) =>
    set((state) => {
      if (get().activeConversationId === conversationId) return state;
      return {
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, unread_count: (c.unread_count ?? 0) + 1 }
            : c
        ),
      };
    }),

  resetUnreadCount: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      ),
    })),

  // Phase 2 actions
  addReaction: (conversationId, messageId, userId, emoji) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = [...(m.reactions || [])];
            const existing = reactions.find((r) => r.emoji === emoji);
            if (existing) {
              if (!existing.user_ids.includes(userId)) {
                existing.user_ids = [...existing.user_ids, userId];
                existing.count += 1;
              }
            } else {
              reactions.push({ emoji, count: 1, user_ids: [userId] });
            }
            return { ...m, reactions };
          }),
        },
      };
    }),

  removeReaction: (conversationId, messageId, userId, emoji) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = (m.reactions || [])
              .map((r) => {
                if (r.emoji !== emoji) return r;
                const user_ids = r.user_ids.filter((id) => id !== userId);
                return { ...r, user_ids, count: user_ids.length };
              })
              .filter((r) => r.count > 0);
            return { ...m, reactions };
          }),
        },
      };
    }),

  updateMessage: (conversationId, messageId, updates) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
        },
      };
    }),

  deleteMessage: (conversationId, messageId) =>
    set((state) => {
      const msgs = state.messages[conversationId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: msgs.filter((m) => m.id !== messageId),
        },
      };
    }),

  setPinnedMessages: (conversationId, messages) =>
    set((state) => ({
      pinnedMessages: { ...state.pinnedMessages, [conversationId]: messages },
    })),

  togglePinnedMessage: (conversationId, messageId, isPinned, message) =>
    set((state) => {
      const current = state.pinnedMessages[conversationId] || [];
      const pinned = isPinned
        ? message
          ? [...current, message]
          : current
        : current.filter((m) => m.id !== messageId);
      // Also update is_pinned on the message in the messages list
      const msgs = state.messages[conversationId];
      const updatedMsgs = msgs
        ? msgs.map((m) => (m.id === messageId ? { ...m, is_pinned: isPinned } : m))
        : msgs;
      return {
        pinnedMessages: { ...state.pinnedMessages, [conversationId]: pinned },
        messages: updatedMsgs
          ? { ...state.messages, [conversationId]: updatedMsgs }
          : state.messages,
      };
    }),

  setReplyToMessage: (message) => set({ replyToMessage: message }),

  setEditingMessage: (message) => set({ editingMessage: message }),

  setTargetMessage: (messageId) => set({ targetMessageId: messageId }),

  updateConversationE2EE: (conversationId, enabled) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, e2ee_enabled: enabled } : c
      ),
    })),
}));
