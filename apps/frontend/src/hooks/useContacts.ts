import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useContactStore } from "@/stores/contactStore";
import type { Contact } from "@/types";

export function useContacts() {
  return useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data } = await api.get("/contacts?status=accepted");
      return data.contacts;
    },
  });
}

export function usePendingContacts() {
  const setPendingRequests = useContactStore((s) => s.setPendingRequests);

  const query = useQuery<Contact[]>({
    queryKey: ["contacts", "pending"],
    queryFn: async () => {
      const { data } = await api.get("/contacts/pending");
      return data.contacts;
    },
  });

  // Sync pending contacts from API to the contact store
  useEffect(() => {
    if (query.data) {
      const requests = query.data.map((contact) => ({
        fromUser: {
          id: contact.user.id,
          uin: contact.user.uin,
          username: contact.user.username,
          display_name: contact.user.display_name,
          avatar_url: contact.user.avatar_url,
        },
        contactId: contact.user.id,
      }));
      setPendingRequests(requests);
    }
  }, [query.data, setPendingRequests]);

  return query;
}

/**
 * Fetches all pending contacts and filters to only outgoing requests
 * (contacts the current user sent that haven't been accepted yet).
 */
export function useOutgoingPendingContacts() {
  const incomingRequests = useContactStore((s) => s.pendingRequests);

  const query = useQuery<Contact[]>({
    queryKey: ["contacts", "all-pending"],
    queryFn: async () => {
      const { data } = await api.get("/contacts?status=pending");
      return data.contacts;
    },
  });

  const outgoing = useMemo(() => {
    if (!query.data) return [];
    const incomingIds = new Set(incomingRequests.map((r) => r.contactId));
    return query.data.filter((c) => !incomingIds.has(c.user.id));
  }, [query.data, incomingRequests]);

  return { outgoing, isLoading: query.isLoading };
}

export function useSendContactRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post("/contacts", { userId });
      return data.contact as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useRespondToContact() {
  const queryClient = useQueryClient();
  const removePendingRequest = useContactStore((s) => s.removePendingRequest);

  return useMutation({
    mutationFn: async ({
      userId,
      status,
    }: {
      userId: string;
      status: "accepted" | "rejected" | "blocked";
    }) => {
      const { data } = await api.patch(`/contacts/${userId}`, { status });
      return data.contact as Contact;
    },
    onSuccess: (_data, variables) => {
      removePendingRequest(variables.userId);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/contacts/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
