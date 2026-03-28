import { create } from "zustand";
import type { User } from "@/types";

export interface PendingContactRequest {
  fromUser: {
    id: string;
    uin: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  contactId: string;
}

interface ContactState {
  pendingRequests: PendingContactRequest[];
  reset: () => void;
  addPendingRequest: (request: PendingContactRequest) => void;
  removePendingRequest: (contactId: string) => void;
  setPendingRequests: (requests: PendingContactRequest[]) => void;
}

export const useContactStore = create<ContactState>()((set) => ({
  pendingRequests: [],

  reset: () => set({ pendingRequests: [] }),

  addPendingRequest: (request) =>
    set((state) => {
      if (state.pendingRequests.some((r) => r.contactId === request.contactId)) {
        return state;
      }
      return { pendingRequests: [request, ...state.pendingRequests] };
    }),

  removePendingRequest: (contactId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter(
        (r) => r.contactId !== contactId
      ),
    })),

  setPendingRequests: (requests) => set({ pendingRequests: requests }),
}));
