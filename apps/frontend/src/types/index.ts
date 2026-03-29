export const ContactStatus = {
  Pending: "pending",
  Accepted: "accepted",
  Blocked: "blocked",
} as const;
export type ContactStatus = (typeof ContactStatus)[keyof typeof ContactStatus];

export const MessageDeliveryStatus = {
  Sent: "sent",
  Delivered: "delivered",
  Read: "read",
} as const;
export type MessageDeliveryStatus = (typeof MessageDeliveryStatus)[keyof typeof MessageDeliveryStatus];

export const PresenceStatus = {
  Online: "online",
  Offline: "offline",
} as const;
export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

export interface User {
  id: string;
  uin: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  last_seen_at: string;
  created_at: string;
}

export interface UserSelf extends User {
  email: string;
}

export interface Contact {
  user: User;
  status: ContactStatus;
  created_at: string;
}

export interface MessageReplyPreview {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
}

export interface MessageForwardPreview {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: {
    id: string;
    uin: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  content: string;
  status: MessageDeliveryStatus;
  created_at: string;
  edited_at: string | null;
  // Phase 2 fields
  reply_to_id: string | null;
  reply_to: MessageReplyPreview | null;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned: boolean;
  forwarded_from_id: string | null;
  forwarded_from: MessageForwardPreview | null;
  reactions: ReactionGroup[];
  // Phase 4 E2EE fields
  is_encrypted?: boolean;
  encrypted_content?: string | null;
}

export interface Conversation {
  id: string;
  participants: User[];
  last_message: Message | null;
  unread_count?: number;
  created_at: string;
}

// Phase 3 types
export interface MessageSearchResult {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
  other_participant_name: string;
  other_participant_avatar_url: string | null;
}

export interface SearchResponse {
  messages: MessageSearchResult[];
  users: User[];
}

export interface PendingQueueMessage {
  tempId: string;
  conversationId: string;
  content: string;
  replyToId?: string;
  attempts: number;
  createdAt: string;
  status: "pending" | "failed";
}

// Phase 4 E2EE types
export interface SignedPreKey {
  keyId: number;
  publicKey: string;
  signature: string;
}

export interface OneTimePreKey {
  keyId: number;
  publicKey: string;
}

export interface KeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: SignedPreKey;
  oneTimePreKey: OneTimePreKey | null;
}

export interface EncryptedMessage {
  type: number;
  body: string;
}

export interface E2EEStatus {
  initialized: boolean;
  oneTimePreKeyCount: number;
}
