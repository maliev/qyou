/**
 * Utility to decrypt encrypted messages.
 * Uses IndexedDB cache to avoid re-decrypting (ratchet can't decrypt twice).
 * Used by useMessages (API load), useSocket (real-time + sync), etc.
 * Never throws — failed decryptions get placeholder text.
 */
import type { Message } from "@/types";
import * as keyStore from "./keyStore";
import * as signalProtocol from "./signalProtocol";

let _hasKeysCache: boolean | null = null;

async function checkHasKeys(): Promise<boolean> {
  if (_hasKeysCache !== null) return _hasKeysCache;
  _hasKeysCache = await keyStore.hasKeys();
  return _hasKeysCache;
}

export function resetKeysCache(): void {
  _hasKeysCache = null;
}

/**
 * Decrypt a single message if it's encrypted.
 * Checks IndexedDB cache first (for messages already decrypted by the ratchet).
 * On first decrypt, caches the plaintext so reloads work.
 */
export async function decryptMessageIfNeeded(msg: Message): Promise<Message> {
  if (!msg.is_encrypted) {
    return msg;
  }

  // Check cache first — ratchet can't decrypt the same message twice
  const cached = await keyStore.getDecryptedContent(msg.id);
  if (cached !== null) {
    return {
      ...msg,
      content: cached,
      encrypted_content: null,
    };
  }

  // No encrypted_content means we can't decrypt (and no cache hit)
  if (!msg.encrypted_content) {
    return msg;
  }

  const hasKeys = await checkHasKeys();
  if (!hasKeys) {
    return msg;
  }

  try {
    const parsed = JSON.parse(msg.encrypted_content) as {
      type: number;
      body: string;
    };
    const plaintext = await signalProtocol.decryptMessage(
      msg.sender_id,
      parsed
    );

    // Cache the decrypted content so page reloads work
    await keyStore.saveDecryptedContent(msg.id, plaintext);

    return {
      ...msg,
      content: plaintext,
      encrypted_content: null,
    };
  } catch (err) {
    console.error("[E2EE] Decryption failed for message", msg.id, err);
    return {
      ...msg,
      content: "[Decryption failed]",
      encrypted_content: null,
    };
  }
}

/**
 * Decrypt an array of messages. Returns new array with decrypted content.
 * Messages are processed sequentially to preserve Double Ratchet order.
 */
export async function decryptMessages(messages: Message[]): Promise<Message[]> {
  const hasEncrypted = messages.some((m) => m.is_encrypted);
  if (!hasEncrypted) return messages;

  const result: Message[] = [];
  for (const msg of messages) {
    result.push(await decryptMessageIfNeeded(msg));
  }
  return result;
}
