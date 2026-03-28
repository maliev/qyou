import { usePresenceStore } from "@/stores/presenceStore";

export function usePresence(userId: string) {
  const presence = usePresenceStore((s) => s.presence[userId]);
  return presence ?? { status: "offline" as const, lastSeenAt: "" };
}
