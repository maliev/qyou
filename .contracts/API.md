# Qyou — REST API Contract (Phases 1–2)

Base URL: `/api/v1`

All request/response bodies are JSON (`Content-Type: application/json`) unless noted otherwise.

Auth header format: `Authorization: Bearer <access_token>`

---

## Auth

### POST /auth/register

Create a new user account.

**Auth required:** No

**Request body:**
```ts
{
  username: string     // 3–32 chars, alphanumeric + underscores only
  email: string        // valid email
  password: string     // 8–128 chars
  display_name?: string // 1–64 chars
}
```

**Success response:** `201 Created`
```ts
{
  user: User
  accessToken: string
  refreshToken: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 409 | `"Username already taken"` | Username exists |
| 409 | `"Email already registered"` | Email exists |

---

### POST /auth/login

Authenticate with email/username and password.

**Auth required:** No

**Request body:**
```ts
{
  login: string    // email or username
  password: string
}
```

**Success response:** `200 OK`
```ts
{
  user: UserSelf
  accessToken: string
  refreshToken: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Invalid credentials"` | Wrong email/username or password |

---

### POST /auth/logout

Revoke the current refresh token.

**Auth required:** Yes

**Request body:**
```ts
{
  refreshToken: string
}
```

**Success response:** `200 OK`
```ts
{
  message: "Logged out"
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### POST /auth/refresh

Exchange a refresh token for a new access/refresh token pair.

**Auth required:** No

**Request body:**
```ts
{
  refreshToken: string
}
```

**Success response:** `200 OK`
```ts
{
  accessToken: string
  refreshToken: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Invalid or expired refresh token"` | Token invalid, expired, or revoked |

---

### GET /auth/me

Get the authenticated user's own profile.

**Auth required:** Yes

**Success response:** `200 OK`
```ts
{
  user: UserSelf
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

## Users

### GET /users/search

Search for users by username or UIN. Supports optional country filter.

**Auth required:** Yes

**Query parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| q | string | Yes | Search query (username partial match or exact UIN) |
| country | string | No | ISO 3166-1 alpha-2 country code filter |
| limit | number | No | Max results (default 20, max 50) |
| offset | number | No | Pagination offset (default 0) |

**Success response:** `200 OK`
```ts
{
  users: User[]
  total: number
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Query param validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### GET /users/:uin

Get a user's public profile by UIN.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| uin | number | Numeric user ID |

**Success response:** `200 OK`
```ts
{
  user: User
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"User not found"` | No user with that UIN |

---

### PATCH /users/me

Update the authenticated user's profile.

**Auth required:** Yes

**Request body:** (all fields optional, at least one required)
```ts
{
  display_name?: string  // 1–64 chars
  bio?: string           // 0–500 chars
  country?: string       // ISO 3166-1 alpha-2
  username?: string      // 3–32 chars, alphanumeric + underscores
}
```

**Success response:** `200 OK`
```ts
{
  user: UserSelf
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 409 | `"Username already taken"` | New username already exists |

---

### POST /users/me/avatar

Upload or update the authenticated user's avatar.

**Auth required:** Yes

**Request:** `Content-Type: multipart/form-data`
| Field | Type | Description |
|---|---|---|
| avatar | File | Image file (JPEG, PNG, WebP). Max 5MB. |

**Success response:** `200 OK`
```ts
{
  avatar_url: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid file type"` | Not JPEG/PNG/WebP |
| 400 | `"File too large"` | Exceeds 5MB |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

## Contacts

### GET /contacts

List all contacts for the authenticated user.

**Auth required:** Yes

**Query parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| status | string | No | Filter by status: `pending`, `accepted`, `blocked` (default: all) |

**Success response:** `200 OK`
```ts
{
  contacts: Contact[]
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### POST /contacts

Send a contact request.

**Auth required:** Yes

**Request body:**
```ts
{
  userId: string   // UUID of the user to add
}
```

**Success response:** `201 Created`
```ts
{
  contact: Contact
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 400 | `"Cannot add yourself"` | userId is the authenticated user |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"User not found"` | Target user doesn't exist |
| 409 | `"Contact request already exists"` | Duplicate request |

---

### PATCH /contacts/:userId

Accept, reject, or block a contact.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| userId | string | UUID of the contact |

**Request body:**
```ts
{
  status: "accepted" | "blocked"
}
```

**Success response:** `200 OK`
```ts
{
  contact: Contact
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"Contact not found"` | No contact relationship exists |

---

### DELETE /contacts/:userId

Remove a contact.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| userId | string | UUID of the contact to remove |

**Success response:** `200 OK`
```ts
{
  message: "Contact removed"
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"Contact not found"` | No contact relationship exists |

---

## Conversations

### GET /conversations

List all conversations for the authenticated user, ordered by most recent message.

**Auth required:** Yes

**Query parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| limit | number | No | Max results (default 20, max 50) |
| offset | number | No | Pagination offset (default 0) |

**Success response:** `200 OK`
```ts
{
  conversations: Conversation[]
  total: number
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### GET /conversations/:id

Get a single conversation by ID.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the conversation |

**Success response:** `200 OK`
```ts
{
  conversation: Conversation
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant |
| 404 | `"Conversation not found"` | Doesn't exist |

---

### GET /conversations/:id/messages

Get paginated messages for a conversation (newest first).

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the conversation |

**Query parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| before | string | No | ISO 8601 timestamp cursor — return messages before this time |
| limit | number | No | Max results (default 50, max 100) |

**Success response:** `200 OK`
```ts
{
  messages: Message[]
  hasMore: boolean
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant |
| 404 | `"Conversation not found"` | Doesn't exist |

---

## Messages

### POST /conversations/:id/messages

Send a message in a conversation.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the conversation |

**Request body:**
```ts
{
  content: string   // 1–5000 chars
}
```

**Success response:** `201 Created`
```ts
{
  message: Message
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails (empty or too long) |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant |
| 404 | `"Conversation not found"` | Doesn't exist |

---

### GET /conversations/:id/pinned

Get pinned messages for a conversation.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the conversation |

**Success response:** `200 OK`
```ts
{
  messages: Message[]
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant |
| 404 | `"Conversation not found"` | Doesn't exist |

---

## Messages (Phase 2)

### POST /messages/:id/reactions

Toggle a reaction on a message. Adds if not exists, removes if exists.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message |

**Request body:**
```ts
{
  emoji: string   // One of: ❤️ 🔥 😂 👍 👎 😮
}
```

**Success response:** `200 OK`
```ts
{
  action: "add" | "remove"
  reaction: {
    messageId: string
    userId: string
    emoji: string
  }
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Invalid emoji or missing fields |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant in the message's conversation |
| 404 | `"Message not found"` | Message doesn't exist |

---

### DELETE /messages/:id/reactions/:emoji

Remove a specific reaction from a message.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message |
| emoji | string | The emoji to remove (URL-encoded) |

**Success response:** `200 OK`
```ts
{
  message: "Reaction removed"
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"Reaction not found"` | Reaction doesn't exist |

---

### PATCH /messages/:id

Edit a message's content. Only the sender can edit, within 24 hours.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message |

**Request body:**
```ts
{
  content: string   // 1–5000 chars
}
```

**Success response:** `200 OK`
```ts
{
  message: Message
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | Not the sender or edit window expired (24h) |
| 404 | `"Message not found"` | Message doesn't exist or is deleted |

---

### DELETE /messages/:id

Delete a message for self or for everyone.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message |

**Request body:**
```ts
{
  deleteFor: "self" | "everyone"
}
```

**Success response:** `200 OK`
```ts
{
  message: "Message deleted"
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Invalid deleteFor value |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | deleteFor=everyone but not the sender |
| 404 | `"Message not found"` | Message doesn't exist |

---

### POST /messages/:id/pin

Toggle pin status of a message in its conversation.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message |

**Success response:** `200 OK`
```ts
{
  isPinned: boolean
  messageId: string
  conversationId: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant in the conversation |
| 404 | `"Message not found"` | Message doesn't exist |

---

## Search (Phase 3)

### GET /search

Search for users and/or messages.

**Auth required:** Yes

**Query parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| q | string | Yes | Search query (min 2 chars) |
| type | string | No | `"messages"` \| `"users"` \| `"all"` (default `"all"`) |
| conversationId | string | No | Scope message search to one conversation |
| limit | number | No | Max results (default 20, max 20) |
| offset | number | No | Pagination offset (default 0) |

**Success response:** `200 OK`
```ts
{
  messages: MessageSearchResult[]
  users: User[]
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Query param validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### POST /messages/:id/forward

Forward a message to another conversation.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| id | string | UUID of the message to forward |

**Request body:**
```ts
{
  conversationId: string   // UUID of the target conversation
}
```

**Success response:** `201 Created`
```ts
{
  message: Message
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Missing conversationId |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | Not a participant in source or target conversation |
| 404 | `"Message not found"` | Source message doesn't exist |
| 404 | `"Conversation not found"` | Target conversation doesn't exist |

---

## E2EE (Phase 4)

### POST /e2ee/keys

Upload E2EE key bundle (identity key, signed prekey, one-time prekeys).

**Auth required:** Yes

**Request body:**
```ts
{
  identityKey: string        // base64 encoded public key
  registrationId: number     // 1-16380
  signedPreKey: {
    keyId: number
    publicKey: string        // base64 encoded
    signature: string        // base64 encoded
  }
  oneTimePreKeys: Array<{
    keyId: number
    publicKey: string        // base64 encoded
  }>
}
```

**Success response:** `200 OK`
```ts
{
  success: true
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### GET /e2ee/keys/:userId

Fetch another user's prekey bundle to initiate an E2EE session.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| userId | string | UUID of the target user |

**Success response:** `200 OK`
```ts
{
  identityKey: string
  registrationId: number
  signedPreKey: { keyId: number, publicKey: string, signature: string }
  oneTimePreKey: { keyId: number, publicKey: string } | null
}
```

**Note:** Consuming a one-time prekey DELETES it from the database (single use by design).

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"E2EE keys not found for user"` | User has not uploaded keys |

---

### GET /e2ee/keys/status

Check how many one-time prekeys remain for the authenticated user.

**Auth required:** Yes

**Success response:** `200 OK`
```ts
{
  oneTimePreKeyCount: number
}
```

**Note:** Client should upload more one-time prekeys when count < 10.

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### DELETE /e2ee/session/:conversationId

Reset the E2EE session for a conversation (re-key).

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| conversationId | string | UUID of the conversation |

**Success response:** `200 OK`
```ts
{
  success: true
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 403 | `"Forbidden"` | User is not a participant |

---

## Two-Factor Authentication (Phase 4)

### POST /auth/2fa/setup

Generate TOTP secret and QR code for authenticator app setup.

**Auth required:** Yes

**Success response:** `200 OK`
```ts
{
  secret: string
  qrCodeUrl: string       // data URL of QR code image
  backupCodes: string[]   // 10 codes, shown once
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"2FA is already enabled"` | User already has 2FA active |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### POST /auth/2fa/verify-setup

Confirm user scanned QR code and authenticator app works.

**Auth required:** Yes

**Request body:**
```ts
{
  token: string   // 6-digit TOTP code
}
```

**Success response:** `200 OK`
```ts
{
  success: true
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 400 | `"2FA setup not initiated"` | No TOTP secret found |
| 400 | `"Invalid verification code"` | TOTP code doesn't match |
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### POST /auth/2fa/disable

Disable 2FA. Requires both TOTP code and password.

**Auth required:** Yes

**Request body:**
```ts
{
  token: string     // 6-digit TOTP code or backup code
  password: string  // account password
}
```

**Success response:** `200 OK`
```ts
{
  success: true
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 401 | `"Invalid password"` | Wrong password |
| 401 | `"Invalid 2FA code"` | TOTP/backup code doesn't match |

---

### POST /auth/2fa/validate

Validate TOTP during login flow. Completes login when 2FA is enabled.

**Auth required:** No (uses temp token from login response)

**Request body:**
```ts
{
  userId: string   // UUID
  token: string    // 6-digit TOTP code or backup code
}
```

**Headers:** `Authorization: Bearer <tempToken>`

**Success response:** `200 OK`
```ts
{
  user: UserSelf
  accessToken: string
  refreshToken: string
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 400 | `"Invalid input"` | Validation fails |
| 401 | `"Unauthorized"` | Missing or invalid temp token |
| 401 | `"Invalid or expired token"` | Temp token expired or userId mismatch |
| 401 | `"Invalid 2FA code"` | TOTP/backup code doesn't match |

---

## Block Users (Phase 4)

### GET /contacts/blocked

List users blocked by the authenticated user.

**Auth required:** Yes

**Success response:** `200 OK`
```ts
{
  contacts: Contact[]
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |

---

### DELETE /contacts/block/:userId

Unblock a user.

**Auth required:** Yes

**URL params:**
| Param | Type | Description |
|---|---|---|
| userId | string | UUID of the user to unblock |

**Success response:** `200 OK`
```ts
{
  message: "User unblocked"
}
```

**Error responses:**
| Code | Message | When |
|---|---|---|
| 401 | `"Unauthorized"` | Missing or invalid access token |
| 404 | `"Block not found"` | User is not blocked |
