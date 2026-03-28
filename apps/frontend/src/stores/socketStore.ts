import { create } from "zustand";

interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  reset: () => void;
  setConnected: (val: boolean) => void;
  setConnecting: (val: boolean) => void;
}

export const useSocketStore = create<SocketState>()((set) => ({
  isConnected: false,
  isConnecting: false,
  reset: () => set({ isConnected: false, isConnecting: false }),
  setConnected: (val) => set({ isConnected: val }),
  setConnecting: (val) => set({ isConnecting: val }),
}));
