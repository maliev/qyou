# Qyou — Shared TypeScript Types (Phases 1–2)

These are the canonical types. Both frontend and backend import from `packages/shared-types`.

---

## Enums

```ts
export enum ContactStatus {
  Pending = "pending",
  Accepted = "accepted",
  Blocked = "blocked",
}

export enum MessageDeliveryStatus {
  Sent = "sent",           // Message persisted on server
  Delivered = "delivered",  // Delivered to recipient's client
  Read = "read",           // Recipient opened the conversation
}

export enum PresenceStatus {
  Online = "online",
  Offline = "offline",
}
```

---

## Core Entity Types

### User (public-facing)

```ts
export interface User {
  id: string;              // UUID
  uin: number;             // Numeric user ID
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;  // ISO 3166-1 alpha-2
  last_seen_at: string;    // ISO 8601
  created_at: string;      // ISO 8601
}
```

### UserSelf (own profile — includes private fields)

```ts
export interface UserSelf extends User {
  email: string;
}
```

### Contact

```ts
export interface Contact {
  user: User;              // The contact's profile
  status: ContactStatus;
  created_at: string;      // ISO 8601
}
```

### Conversation

```ts
export interface Conversation {
  id: string;              // UUID
  participants: User[];
  last_message: Message | null;
  created_at: string;      // ISO 8601
}
```

### Message

```ts
export interface Message {
  id: string;              // UUID
  conversation_id: string; // UUID
  sender_id: string;       // UUID
  content: string;
  status: MessageDeliveryStatus;
  created_at: string;      // ISO 8601
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
```

### MessageReplyPreview

```ts
export interface MessageReplyPreview {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;     // display_name or username
}
```

### MessageForwardPreview

```ts
export interface MessageForwardPreview {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
}
```

### MessageReaction

```ts
export interface MessageReaction {
  id: string;              // UUID
  message_id: string;      // UUID
  user_id: string;         // UUID
  emoji: string;
  created_at: string;      // ISO 8601
}
```

### ReactionGroup

```ts
export interface ReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
}
```

---

## API Request Types

### Auth

```ts
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

export interface LoginRequest {
  login: string;           // email or username
  password: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface RefreshRequest {
  refreshToken: string;
}
```

### Users

```ts
export interface UserSearchParams {
  q: string;
  country?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateProfileRequest {
  display_name?: string;
  bio?: string;
  country?: string;
  username?: string;
}
```

### Contacts

```ts
export interface AddContactRequest {
  userId: string;          // UUID
}

export interface UpdateContactRequest {
  status: "accepted" | "blocked";
}
```

### Messages

```ts
export interface SendMessageRequest {
  content: string;
}

export interface GetMessagesParams {
  before?: string;         // ISO 8601 timestamp
  limit?: number;
}
```

### Messages (Phase 2)

```ts
export interface ToggleReactionRequest {
  emoji: string;
}

export interface EditMessageRequest {
  content: string;
}

export interface DeleteMessageRequest {
  deleteFor: "self" | "everyone";
}

export interface ForwardMessageRequest {
  conversationId: string;
}
```

---

## API Response Types

### Auth Responses

```ts
export interface AuthResponse {
  user: User | UserSelf;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: UserSelf;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  user: UserSelf;
}
```

### User Responses

```ts
export interface UserSearchResponse {
  users: User[];
  total: number;
}

export interface UserProfileResponse {
  user: User;
}

export interface UpdateProfileResponse {
  user: UserSelf;
}

export interface AvatarUploadResponse {
  avatar_url: string;
}
```

### Contact Responses

```ts
export interface ContactListResponse {
  contacts: Contact[];
}

export interface ContactResponse {
  contact: Contact;
}

export interface ContactRemovedResponse {
  message: "Contact removed";
}
```

### Conversation Responses

```ts
export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface ConversationResponse {
  conversation: Conversation;
}

export interface MessageListResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface SendMessageResponse {
  message: Message;
}
```

### Message Responses (Phase 2)

```ts
export interface ToggleReactionResponse {
  action: "add" | "remove";
  reaction: {
    messageId: string;
    userId: string;
    emoji: string;
  };
}

export interface EditMessageResponse {
  message: Message;
}

export interface DeleteMessageResponse {
  message: "Message deleted";
}

export interface PinMessageResponse {
  isPinned: boolean;
  messageId: string;
  conversationId: string;
}

export interface ForwardMessageResponse {
  message: Message;
}

export interface PinnedMessagesResponse {
  messages: Message[];
}
```

---

## WebSocket Payload Types

### Client → Server

```ts
export interface WsMessageSend {
  conversationId: string;
  content: string;
  tempId: string;
}

export interface WsMessageRead {
  conversationId: string;
  messageIds: string[];
}

export interface WsTypingStart {
  conversationId: string;
}

export interface WsTypingStop {
  conversationId: string;
}

export interface WsPresenceGet {
  userIds: string[];
}
```

### Server → Client

```ts
export interface WsMessageNew {
  message: Message;
  conversationId: string;
}

export interface WsMessageDelivered {
  messageId: string;
  conversationId: string;
  userId: string;
  deliveredAt: string;
}

export interface WsMessageReadNotify {
  conversationId: string;
  messageIds: string[];
  userId: string;
  readAt: string;
}

export interface WsTyping {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface WsPresenceUpdate {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
}

export interface WsPresenceGetResponse {
  presences: Array<{
    userId: string;
    status: PresenceStatus;
    lastSeenAt: string;
  }>;
}
```

### Acknowledgements

```ts
export interface WsMessageSendAck {
  success: boolean;
  message?: Message;
  tempId: string;
  error?: string;
}

export interface WsMessageReadAck {
  success: boolean;
}
```

### Server → Client (Phase 2)

```ts
export interface WsMessageReaction {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
  action: "add" | "remove";
}

export interface WsMessageEdited {
  messageId: string;
  conversationId: string;
  content: string;
  editedAt: string;
}

export interface WsMessageDeleted {
  messageId: string;
  conversationId: string;
  deleteFor: "self" | "everyone";
  userId: string;
}

export interface WsMessagePinned {
  messageId: string;
  conversationId: string;
  isPinned: boolean;
  pinnedBy: string;
}
```

### Error

```ts
export interface WsError {
  code: string;
  message: string;
  event?: string;
}
```

---

## Phase 3 Types

### Search

```ts
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

export interface SearchParams {
  q: string;
  type?: "messages" | "users" | "all";
  conversationId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  messages: MessageSearchResult[];
  users: User[];
}
```

### WebSocket (Phase 3)

```ts
export interface WsSyncRequired {
  conversationIds: string[];
  since: string;
}
```

---

## Phase 4 Types

### E2EE

```ts
export interface SignedPreKey {
  keyId: number;
  publicKey: string;        // base64 encoded
  signature: string;        // base64 encoded
}

export interface OneTimePreKey {
  keyId: number;
  publicKey: string;        // base64 encoded
}

export interface KeyBundle {
  identityKey: string;      // base64 encoded
  registrationId: number;
  signedPreKey: SignedPreKey;
  oneTimePreKey: OneTimePreKey | null;
}

export interface EncryptedMessage {
  type: number;             // Signal message type
  body: string;             // base64 encoded ciphertext
}

export interface E2EEStatus {
  initialized: boolean;
  oneTimePreKeyCount: number;
}
```

### WebSocket (Phase 4)

```ts
export interface WsMessageSend {
  conversationId: string;
  content: string;
  tempId: string;
  encrypted_content?: string;
  is_encrypted?: boolean;
}
```
