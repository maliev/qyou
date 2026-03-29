import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "qyou-e2ee";
const DB_VERSION = 2;

const STORES = {
  identityKeys: "identityKeys",
  signedPreKeys: "signedPreKeys",
  oneTimePreKeys: "oneTimePreKeys",
  sessions: "sessions",
  meta: "meta",
  decryptedMessages: "decryptedMessages",
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.identityKeys)) {
          db.createObjectStore(STORES.identityKeys);
        }
        if (!db.objectStoreNames.contains(STORES.signedPreKeys)) {
          db.createObjectStore(STORES.signedPreKeys);
        }
        if (!db.objectStoreNames.contains(STORES.oneTimePreKeys)) {
          db.createObjectStore(STORES.oneTimePreKeys);
        }
        if (!db.objectStoreNames.contains(STORES.sessions)) {
          db.createObjectStore(STORES.sessions);
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta);
        }
        if (!db.objectStoreNames.contains(STORES.decryptedMessages)) {
          db.createObjectStore(STORES.decryptedMessages);
        }
      },
    });
  }
  return dbPromise;
}

// Identity key pair (private + public)
export async function saveIdentityKeyPair(keyPair: {
  publicKey: ArrayBuffer;
  privateKey: ArrayBuffer;
}): Promise<void> {
  const db = await getDB();
  await db.put(STORES.identityKeys, keyPair, "identityKeyPair");
}

export async function getIdentityKeyPair(): Promise<{
  publicKey: ArrayBuffer;
  privateKey: ArrayBuffer;
} | null> {
  const db = await getDB();
  return (await db.get(STORES.identityKeys, "identityKeyPair")) ?? null;
}

// Registration ID
export async function saveRegistrationId(id: number): Promise<void> {
  const db = await getDB();
  await db.put(STORES.meta, id, "registrationId");
}

export async function getRegistrationId(): Promise<number | null> {
  const db = await getDB();
  return (await db.get(STORES.meta, "registrationId")) ?? null;
}

// Signed prekeys
export async function saveSignedPreKey(
  keyId: number,
  keyPair: { publicKey: ArrayBuffer; privateKey: ArrayBuffer }
): Promise<void> {
  const db = await getDB();
  await db.put(STORES.signedPreKeys, keyPair, keyId);
}

export async function getSignedPreKey(
  keyId: number
): Promise<{ publicKey: ArrayBuffer; privateKey: ArrayBuffer } | null> {
  const db = await getDB();
  return (await db.get(STORES.signedPreKeys, keyId)) ?? null;
}

// One-time prekeys
export async function saveOneTimePreKey(
  keyId: number,
  keyPair: { publicKey: ArrayBuffer; privateKey: ArrayBuffer }
): Promise<void> {
  const db = await getDB();
  await db.put(STORES.oneTimePreKeys, keyPair, keyId);
}

export async function getOneTimePreKey(
  keyId: number
): Promise<{ publicKey: ArrayBuffer; privateKey: ArrayBuffer } | null> {
  const db = await getDB();
  const key = await db.get(STORES.oneTimePreKeys, keyId);
  if (key) {
    // One-time: delete after retrieval
    await db.delete(STORES.oneTimePreKeys, keyId);
  }
  return key ?? null;
}

// Session state per contact (Double Ratchet)
export async function saveSession(
  userId: string,
  sessionData: ArrayBuffer
): Promise<void> {
  const db = await getDB();
  await db.put(STORES.sessions, sessionData, userId);
}

export async function getSession(
  userId: string
): Promise<ArrayBuffer | null> {
  const db = await getDB();
  return (await db.get(STORES.sessions, userId)) ?? null;
}

export async function deleteSession(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORES.sessions, userId);
}

// Signed prekey ID counter
export async function saveSignedPreKeyId(id: number): Promise<void> {
  const db = await getDB();
  await db.put(STORES.meta, id, "signedPreKeyId");
}

export async function getSignedPreKeyId(): Promise<number> {
  const db = await getDB();
  return (await db.get(STORES.meta, "signedPreKeyId")) ?? 0;
}

// One-time prekey ID counter
export async function saveOneTimePreKeyCounter(counter: number): Promise<void> {
  const db = await getDB();
  await db.put(STORES.meta, counter, "oneTimePreKeyCounter");
}

export async function getOneTimePreKeyCounter(): Promise<number> {
  const db = await getDB();
  return (await db.get(STORES.meta, "oneTimePreKeyCounter")) ?? 0;
}

// Decrypted message cache — survives page reloads
export async function saveDecryptedContent(
  messageId: string,
  plaintext: string
): Promise<void> {
  const db = await getDB();
  await db.put(STORES.decryptedMessages, plaintext, messageId);
}

export async function getDecryptedContent(
  messageId: string
): Promise<string | null> {
  const db = await getDB();
  return (await db.get(STORES.decryptedMessages, messageId)) ?? null;
}

// Clear all keys (on logout)
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [
      STORES.identityKeys,
      STORES.signedPreKeys,
      STORES.oneTimePreKeys,
      STORES.sessions,
      STORES.meta,
      STORES.decryptedMessages,
    ],
    "readwrite"
  );
  await Promise.all([
    tx.objectStore(STORES.identityKeys).clear(),
    tx.objectStore(STORES.signedPreKeys).clear(),
    tx.objectStore(STORES.oneTimePreKeys).clear(),
    tx.objectStore(STORES.sessions).clear(),
    tx.objectStore(STORES.meta).clear(),
    tx.objectStore(STORES.decryptedMessages).clear(),
    tx.done,
  ]);
}

// Check if E2EE is initialized
export async function hasKeys(): Promise<boolean> {
  const keyPair = await getIdentityKeyPair();
  return keyPair !== null;
}
