import { useRef, useCallback } from "react";
import type { PendingQueueMessage } from "@/types";

const MAX_RETRIES = 3;
const SEND_TIMEOUT = 5000;

export function useMessageQueue() {
  const queueRef = useRef<Map<string, PendingQueueMessage>>(new Map());

  const addToQueue = useCallback(
    (msg: Omit<PendingQueueMessage, "attempts" | "status">) => {
      queueRef.current.set(msg.tempId, {
        ...msg,
        attempts: 0,
        status: "pending",
      });
    },
    []
  );

  const removeFromQueue = useCallback((tempId: string) => {
    queueRef.current.delete(tempId);
  }, []);

  const markFailed = useCallback((tempId: string) => {
    const item = queueRef.current.get(tempId);
    if (item) {
      item.status = "failed";
    }
  }, []);

  const getQueueItem = useCallback((tempId: string) => {
    return queueRef.current.get(tempId) ?? null;
  }, []);

  const canRetry = useCallback((tempId: string) => {
    const item = queueRef.current.get(tempId);
    return item ? item.attempts < MAX_RETRIES : false;
  }, []);

  const incrementAttempts = useCallback((tempId: string) => {
    const item = queueRef.current.get(tempId);
    if (item) {
      item.attempts += 1;
      item.status = "pending";
    }
  }, []);

  const sendWithRetry = useCallback(
    async (
      tempId: string,
      sendFn: () => Promise<unknown>
    ): Promise<boolean> => {
      const item = queueRef.current.get(tempId);
      if (!item) return false;

      incrementAttempts(tempId);

      try {
        await Promise.race([
          sendFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Send timeout")), SEND_TIMEOUT)
          ),
        ]);
        removeFromQueue(tempId);
        return true;
      } catch {
        if (!canRetry(tempId)) {
          markFailed(tempId);
        }
        return false;
      }
    },
    [incrementAttempts, removeFromQueue, canRetry, markFailed]
  );

  return {
    addToQueue,
    removeFromQueue,
    markFailed,
    getQueueItem,
    canRetry,
    incrementAttempts,
    sendWithRetry,
  };
}
