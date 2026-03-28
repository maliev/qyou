import { create } from "zustand";

interface PresenceData {
  status: "online" | "offline";
  lastSeenAt: string;
}

interface PresenceState {
  presence: Record<string, PresenceData>;
  reset: () => void;
  setPresence: (userId: string, data: PresenceData) => void;
  getPresence: (userId: string) => PresenceData | undefined;
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  presence: {},

  reset: () => set({ presence: {} }),

  setPresence: (userId, data) =>
    set((state) => ({
      presence: { ...state.presence, [userId]: data },
    })),

  getPresence: (userId) => get().presence[userId],
}));
