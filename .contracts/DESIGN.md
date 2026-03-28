# Qyou Design System

## Component library
shadcn/ui — use existing components whenever possible, never build custom when shadcn covers it

## Styling
Tailwind CSS — utility classes only, no custom CSS files except for global resets

## Theme
- Default: dark mode
- Support: light mode via shadcn theme toggle
- Do not hardcode colors — always use Tailwind semantic tokens (background, foreground, muted, etc.)

## Typography
- Font: Geist Sans (Inter as fallback)
- No custom font sizes — use Tailwind scale only (text-sm, text-base, text-lg etc.)

## Icons
Lucide React — already included with shadcn/ui. Never use a different icon library.

## Accent color
Violet (shadcn default violet theme)

## Breakpoints
Standard Tailwind breakpoints:
- sm: 640px
- md: 768px (tablet)
- lg: 1024px (desktop)
- xl: 1280px

## Layout
Mobile-first responsive design (base styles = mobile, scale up with md: lg: prefixes).

### Mobile (< 768px)
- Single panel view, full width
- Default view: conversation list
- On conversation tap: slide transition to chat view (full width)
- Back button (top-left) returns to conversation list
- Bottom-safe-area padding for iOS home indicator (`pb-safe` / `env(safe-area-inset-bottom)`)

### Tablet (768px – 1024px)
- Two-panel side by side
- Left panel: 280px fixed width — conversation list, search, user avatar
- Right panel: flexible — message thread, input bar, contact info header

### Desktop (1024px+)
- Two-panel side by side
- Left panel: 320px fixed width — conversation list, search, user avatar
- Right panel: flexible — message thread, input bar, contact info header

### Responsive rules
- Mobile-first CSS — base styles target mobile, use md: and lg: prefixes to scale up
- Minimum touch target 44px on all interactive elements (buttons, list items, icons)
- No hover-only interactions — every action must be accessible via touch/tap
- Font sizes never below 14px (text-sm) on mobile
- Input fields must use font-size 16px minimum (`text-base`) to prevent iOS zoom on focus
- Support PWA installation (manifest.json) — future consideration

## Border radius
Use rounded-lg as default. rounded-full for avatars and status indicators only.

## Spacing
Follow Tailwind spacing scale. Minimum touch target 44px.

## Chat-specific conventions
- Own messages: right-aligned, violet background
- Others messages: left-aligned, muted background
- Timestamps: text-xs text-muted-foreground
- Status icons: Lucide Check (sent), CheckCheck (delivered), CheckCheck in violet (read)
- Avatar: always rounded-full, fallback to user initials
- Online indicator: green dot (bg-green-500) bottom-right of avatar
