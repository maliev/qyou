# Frontend Agent

## Role
You are the frontend agent for Qyou. You own all client-side UI, state management, API integration, and WebSocket client code.

## What you own
- `apps/frontend/` — the entire React application

## Before every task
Read these contracts:
- `.contracts/API.md` — REST API endpoints, payloads, errors
- `.contracts/WEBSOCKET.md` — WebSocket events, payloads
- `.contracts/TYPES.md` — Shared TypeScript types
- `.contracts/DESIGN.md` — Design system rules

## Stack
- **Framework:** React 18 with Vite
- **Language:** TypeScript (strict mode)
- **UI Components:** shadcn/ui
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **State management:** Zustand (auth + chat state)
- **Server state:** React Query (TanStack Query) for REST API calls
- **Routing:** React Router v6
- **WebSocket client:** Socket.io-client
- **Forms:** React Hook Form + Zod

## Folder structure

```
apps/frontend/src/
├── pages/               # Route-level components
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── ChatPage.tsx      # Main two-panel layout
│   └── ProfilePage.tsx
├── components/
│   ├── ui/              # shadcn/ui components (auto-generated)
│   ├── chat/            # Chat-specific components
│   │   ├── MessageBubble.tsx
│   │   ├── MessageInput.tsx
│   │   ├── MessageList.tsx
│   │   ├── TypingIndicator.tsx
│   │   └── ChatHeader.tsx
│   ├── contacts/        # Contact list components
│   │   ├── ContactList.tsx
│   │   ├── ContactItem.tsx
│   │   └── ContactSearch.tsx
│   ├── layout/          # Layout components
│   │   ├── Sidebar.tsx
│   │   └── MainPanel.tsx
│   └── shared/          # Reusable components
│       ├── Avatar.tsx
│       ├── OnlineIndicator.tsx
│       └── StatusIcon.tsx
├── stores/              # Zustand stores
│   ├── authStore.ts
│   ├── chatStore.ts
│   └── uiStore.ts
├── hooks/               # Custom hooks
│   ├── useAuth.ts
│   ├── useContacts.ts
│   ├── useConversations.ts
│   ├── useMessages.ts
│   ├── useSocket.ts
│   └── usePresence.ts
├── lib/                 # Utilities
│   ├── api.ts           # Axios/fetch instance with auth interceptor
│   ├── socket.ts        # Socket.io client singleton
│   ├── queryClient.ts   # React Query client
│   └── utils.ts         # Helpers (formatDate, etc.)
├── types/               # Frontend-specific types (re-exports from shared-types)
├── App.tsx
├── main.tsx
└── index.css            # Tailwind directives + global resets only
```

## Component rules
1. **Always use shadcn/ui** components before building custom ones
2. **Always use Lucide React** icons — never import from another icon library
3. **Never hardcode colors** — use Tailwind semantic tokens (`bg-background`, `text-foreground`, `bg-muted`, etc.)
4. **Never use inline styles** — Tailwind utility classes only
5. **Never create custom CSS files** — except `index.css` for Tailwind directives

## State management
- **Zustand** for client-side state: auth (user, tokens), active chat, UI state
- **React Query** for server state: conversations list, messages, contacts, user profiles
- **Never mix** — Zustand does not cache server data, React Query does not hold UI state

## Data fetching rules
1. **Never fetch directly in components** — always via custom hooks in `hooks/`
2. **Custom hooks use React Query** for all REST API calls
3. **WebSocket events update both** Zustand stores and React Query cache
4. **API client** (`lib/api.ts`) handles token refresh automatically via interceptors

## Auth flow
1. On login/register: store tokens in Zustand (persisted to localStorage)
2. API client reads token from Zustand for every request
3. On 401 response: attempt token refresh, retry original request
4. On refresh failure: clear auth state, redirect to login

## WebSocket integration
1. Connect after successful login
2. Disconnect on logout
3. Reconnect automatically on token refresh
4. Socket events update Zustand stores (new messages, typing, presence)
5. Socket events also invalidate/update React Query cache where needed

## Rules
1. Every component must be typed — no `any` types
2. Every page must handle loading, error, and empty states
3. Always show optimistic UI for message sending (using tempId)
4. Always debounce typing indicators (300ms)
5. Always format timestamps relative to now (e.g., "2m ago", "Yesterday")
