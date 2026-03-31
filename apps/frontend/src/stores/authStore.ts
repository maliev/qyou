import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSelf } from "@/types";
import { disconnect } from "@/lib/socket";
import { setCurrentUserId } from "@/lib/e2ee/keyStore";
import { useChatStore } from "./chatStore";
import { usePresenceStore } from "./presenceStore";
import { useContactStore } from "./contactStore";
import { useSocketStore } from "./socketStore";

interface AuthState {
  user: UserSelf | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: UserSelf, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        setCurrentUserId(user.id);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      logout: () => {
        disconnect();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        useChatStore.getState().reset();
        usePresenceStore.getState().reset();
        useContactStore.getState().reset();
        useSocketStore.getState().reset();
      },
    }),
    {
      name: "qyou-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.user?.id) {
          setCurrentUserId(state.user.id);
        }
      },
    }
  )
);
