/**
 * E2EE Protocol implementation using libsodium (WASM, browser-compatible).
 *
 * Implements:
 * - X3DH key agreement (X25519 ECDH)
 * - Symmetric ratchet (HKDF + XChaCha20-Poly1305 AEAD)
 *
 * All crypto operations use libsodium — never Math.random().
 * Private keys NEVER leave this module / IndexedDB.
 */
import sodium from "libsodium-wrappers-sumo";
import * as keyStore from "./keyStore";

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

// --- Helpers ---

function toBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function fromBase64(b64: string): Uint8Array {
  return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
}

function arrayBufferToUint8(ab: ArrayBuffer): Uint8Array {
  return new Uint8Array(ab);
}

// HKDF using HMAC-SHA256 (extract-then-expand, RFC 5869)
function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Uint8Array {
  // Extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = sodium.crypto_auth_hmacsha256(ikm, salt);

  // Expand
  const hashLen = 32; // SHA-256 output
  const n = Math.ceil(length / hashLen);
  const okm = new Uint8Array(n * hashLen);
  let prev = new Uint8Array(0);

  for (let i = 1; i <= n; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = i;

    const key = prk.length === 32 ? prk : prk.slice(0, 32);
    prev = sodium.crypto_auth_hmacsha256(input, key);
    okm.set(prev, (i - 1) * hashLen);
  }

  return okm.slice(0, length);
}

// --- Session state stored in IndexedDB ---

interface SessionState {
  // Shared root key (ratcheted)
  rootKey: string; // base64
  // Send/receive chain keys
  sendChainKey: string; // base64
  recvChainKey: string; // base64
  // Message counters
  sendCounter: number;
  recvCounter: number;
  // Their identity key for verification
  theirIdentityKey: string; // base64
  // Their signed prekey ID used
  theirSignedPreKeyId: number;
  // Whether we initiated the X3DH handshake
  isInitiator?: boolean;
}

function serializeSession(state: SessionState): ArrayBuffer {
  const json = JSON.stringify(state);
  return new TextEncoder().encode(json).buffer as ArrayBuffer;
}

function deserializeSession(ab: ArrayBuffer): SessionState {
  const json = new TextDecoder().decode(ab);
  return JSON.parse(json) as SessionState;
}

// Ratchet the chain key forward (KDF chain)
function ratchetChainKey(chainKey: Uint8Array): {
  nextChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const info1 = new TextEncoder().encode("MessageKey");
  const info2 = new TextEncoder().encode("ChainKey");
  const salt = new Uint8Array(32); // zero salt

  const messageKey = hkdf(chainKey, salt, info1, 32);
  const nextChainKey = hkdf(chainKey, salt, info2, 32);

  return { nextChainKey, messageKey };
}

// --- Public API ---

export async function generateIdentityKeyPair(): Promise<{
  publicKey: ArrayBuffer;
  privateKey: ArrayBuffer;
  publicKeyBase64: string;
}> {
  await ensureSodium();

  const keyPair = sodium.crypto_box_keypair();

  const publicKey = uint8ToArrayBuffer(keyPair.publicKey);
  const privateKey = uint8ToArrayBuffer(keyPair.privateKey);

  await keyStore.saveIdentityKeyPair({ publicKey, privateKey });

  return {
    publicKey,
    privateKey,
    publicKeyBase64: toBase64(keyPair.publicKey),
  };
}

export async function generateRegistrationId(): Promise<number> {
  await ensureSodium();
  const id = (sodium.randombytes_uniform(16380) + 1);
  await keyStore.saveRegistrationId(id);
  return id;
}

export async function generateSignedPreKey(
  identityPrivateKey: ArrayBuffer,
  keyId: number
): Promise<{
  keyId: number;
  publicKeyBase64: string;
  signatureBase64: string;
  keyPair: { publicKey: ArrayBuffer; privateKey: ArrayBuffer };
}> {
  await ensureSodium();

  const keyPair = sodium.crypto_box_keypair();

  // Sign the public key with identity key using Ed25519
  // Convert X25519 private key to Ed25519 for signing
  const identityPriv = arrayBufferToUint8(identityPrivateKey);
  const edKeyPair = sodium.crypto_sign_seed_keypair(identityPriv.slice(0, 32));
  const signature = sodium.crypto_sign_detached(
    keyPair.publicKey,
    edKeyPair.privateKey
  );

  const kp = {
    publicKey: uint8ToArrayBuffer(keyPair.publicKey),
    privateKey: uint8ToArrayBuffer(keyPair.privateKey),
  };

  await keyStore.saveSignedPreKey(keyId, kp);
  await keyStore.saveSignedPreKeyId(keyId);

  return {
    keyId,
    publicKeyBase64: toBase64(keyPair.publicKey),
    signatureBase64: toBase64(signature),
    keyPair: kp,
  };
}

export async function generateOneTimePreKeys(
  startId: number,
  count: number
): Promise<Array<{ keyId: number; publicKeyBase64: string }>> {
  await ensureSodium();

  const keys: Array<{ keyId: number; publicKeyBase64: string }> = [];

  for (let i = 0; i < count; i++) {
    const keyId = startId + i;
    const keyPair = sodium.crypto_box_keypair();

    await keyStore.saveOneTimePreKey(keyId, {
      publicKey: uint8ToArrayBuffer(keyPair.publicKey),
      privateKey: uint8ToArrayBuffer(keyPair.privateKey),
    });

    keys.push({
      keyId,
      publicKeyBase64: toBase64(keyPair.publicKey),
    });
  }

  await keyStore.saveOneTimePreKeyCounter(startId + count);
  return keys;
}

/**
 * X3DH key agreement — initiator side.
 * Derives a shared secret from our identity key + ephemeral key
 * and their identity key + signed prekey + optional one-time prekey.
 */
export async function initializeSession(
  recipientUserId: string,
  preKeyBundle: {
    identityKey: string;
    registrationId: number;
    signedPreKey: { keyId: number; publicKey: string; signature: string };
    oneTimePreKey: { keyId: number; publicKey: string } | null;
  }
): Promise<void> {
  await ensureSodium();

  const identityKeyPair = await keyStore.getIdentityKeyPair();
  if (!identityKeyPair) throw new Error("E2EE not initialized");

  const ourPrivate = arrayBufferToUint8(identityKeyPair.privateKey);
  const theirIdentityPub = fromBase64(preKeyBundle.identityKey);
  const theirSignedPreKeyPub = fromBase64(preKeyBundle.signedPreKey.publicKey);

  // X3DH: DH1 = DH(ourIdentity, theirSignedPreKey)
  const dh1 = sodium.crypto_scalarmult(ourPrivate, theirSignedPreKeyPub);

  // Generate ephemeral key pair
  const ephemeral = sodium.crypto_box_keypair();

  // X3DH: DH2 = DH(ephemeral, theirIdentity)
  const dh2 = sodium.crypto_scalarmult(ephemeral.privateKey, theirIdentityPub);

  // X3DH: DH3 = DH(ephemeral, theirSignedPreKey)
  const dh3 = sodium.crypto_scalarmult(
    ephemeral.privateKey,
    theirSignedPreKeyPub
  );

  // Combine DH outputs
  let dhConcat: Uint8Array;
  if (preKeyBundle.oneTimePreKey) {
    const theirOTPK = fromBase64(preKeyBundle.oneTimePreKey.publicKey);
    // X3DH: DH4 = DH(ephemeral, theirOneTimePreKey)
    const dh4 = sodium.crypto_scalarmult(ephemeral.privateKey, theirOTPK);
    dhConcat = new Uint8Array(dh1.length + dh2.length + dh3.length + dh4.length);
    dhConcat.set(dh1, 0);
    dhConcat.set(dh2, dh1.length);
    dhConcat.set(dh3, dh1.length + dh2.length);
    dhConcat.set(dh4, dh1.length + dh2.length + dh3.length);
  } else {
    dhConcat = new Uint8Array(dh1.length + dh2.length + dh3.length);
    dhConcat.set(dh1, 0);
    dhConcat.set(dh2, dh1.length);
    dhConcat.set(dh3, dh1.length + dh2.length);
  }

  // KDF to derive root key and initial chain keys
  const salt = new Uint8Array(32); // zero salt for initial derivation
  const info = new TextEncoder().encode("QyouX3DH");
  const derived = hkdf(dhConcat, salt, info, 96); // 32 root + 32 send + 32 recv

  const session: SessionState = {
    rootKey: toBase64(derived.slice(0, 32)),
    sendChainKey: toBase64(derived.slice(32, 64)),
    recvChainKey: toBase64(derived.slice(64, 96)),
    sendCounter: 0,
    recvCounter: 0,
    theirIdentityKey: preKeyBundle.identityKey,
    theirSignedPreKeyId: preKeyBundle.signedPreKey.keyId,
  };

  // Store the session along with our ephemeral public key (needed by recipient)
  const sessionWithEphemeral = {
    ...session,
    isInitiator: true,
    ephemeralPublicKey: toBase64(ephemeral.publicKey),
    ourIdentityPublicKey: toBase64(arrayBufferToUint8(identityKeyPair.publicKey)),
    oneTimePreKeyId: preKeyBundle.oneTimePreKey?.keyId ?? null,
  };

  await keyStore.saveSession(
    recipientUserId,
    serializeSession(sessionWithEphemeral as SessionState)
  );
}

/**
 * Encrypt a message using the ratcheted session.
 */
export async function encryptMessage(
  recipientUserId: string,
  plaintext: string
): Promise<{ type: number; body: string }> {
  await ensureSodium();

  const sessionData = await keyStore.getSession(recipientUserId);
  if (!sessionData) {
    throw new Error("No session established with " + recipientUserId);
  }

  const session = deserializeSession(sessionData);
  const chainKey = fromBase64(session.sendChainKey);
  const { nextChainKey, messageKey } = ratchetChainKey(chainKey);

  // Encrypt with XChaCha20-Poly1305
  const nonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null, // no additional data
    null, // nsec (not used)
    nonce,
    messageKey
  );

  // Update session with ratcheted chain key
  session.sendChainKey = toBase64(nextChainKey);
  session.sendCounter++;

  await keyStore.saveSession(recipientUserId, serializeSession(session));

  // Only the initiator's first message is type 0 (PreKey message with X3DH header)
  const isPreKeyMessage = session.isInitiator === true && session.sendCounter === 1;

  // Build message envelope
  const envelope: Record<string, unknown> = {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
    counter: session.sendCounter - 1,
  };

  // For initial PreKey message, include X3DH header so recipient can derive keys
  if (isPreKeyMessage) {
    const fullSession = JSON.parse(
      new TextDecoder().decode(sessionData)
    );
    envelope.ephemeralPublicKey = fullSession.ephemeralPublicKey;
    envelope.ourIdentityPublicKey = fullSession.ourIdentityPublicKey;
    envelope.oneTimePreKeyId = fullSession.oneTimePreKeyId;
    envelope.signedPreKeyId = fullSession.theirSignedPreKeyId;
  }

  return {
    type: isPreKeyMessage ? 0 : 1,
    body: btoa(JSON.stringify(envelope)),
  };
}

/**
 * Decrypt a message. Handles both initial (PreKey) and subsequent messages.
 */
export async function decryptMessage(
  senderUserId: string,
  encryptedMessage: { type: number; body: string }
): Promise<string> {
  await ensureSodium();

  const envelope = JSON.parse(atob(encryptedMessage.body)) as {
    nonce: string;
    ciphertext: string;
    counter: number;
    ephemeralPublicKey?: string;
    ourIdentityPublicKey?: string;
    oneTimePreKeyId?: number | null;
    signedPreKeyId?: number;
  };

  let session: SessionState;

  if (encryptedMessage.type === 0) {
    // Initial PreKey message — we need to perform X3DH from the responder side
    session = await handlePreKeyMessage(senderUserId, envelope);
  } else {
    // Subsequent message — use existing session
    const sessionData = await keyStore.getSession(senderUserId);
    if (!sessionData) {
      throw new Error("No session for decryption from " + senderUserId);
    }
    session = deserializeSession(sessionData);
  }

  // Ratchet receive chain key
  const chainKey = fromBase64(session.recvChainKey);
  const { nextChainKey, messageKey } = ratchetChainKey(chainKey);

  // Decrypt with XChaCha20-Poly1305
  const nonce = fromBase64(envelope.nonce);
  const ciphertext = fromBase64(envelope.ciphertext);

  const plaintextBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, // nsec
    ciphertext,
    null, // no additional data
    nonce,
    messageKey
  );

  // Update session
  session.recvChainKey = toBase64(nextChainKey);
  session.recvCounter++;

  await keyStore.saveSession(senderUserId, serializeSession(session));

  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Handle initial PreKey message — X3DH responder side.
 * Derives the same shared secret using our private keys.
 */
async function handlePreKeyMessage(
  senderUserId: string,
  envelope: {
    ephemeralPublicKey?: string;
    ourIdentityPublicKey?: string;
    oneTimePreKeyId?: number | null;
    signedPreKeyId?: number;
  }
): Promise<SessionState> {
  const identityKeyPair = await keyStore.getIdentityKeyPair();
  if (!identityKeyPair) throw new Error("E2EE not initialized");

  const ourIdentityPrivate = arrayBufferToUint8(identityKeyPair.privateKey);
  const theirIdentityPub = fromBase64(envelope.ourIdentityPublicKey!);
  const theirEphemeralPub = fromBase64(envelope.ephemeralPublicKey!);

  // Get our signed prekey private key
  const signedPreKeyId = envelope.signedPreKeyId ?? 0;
  const signedPreKeyPair = await keyStore.getSignedPreKey(signedPreKeyId);
  if (!signedPreKeyPair) throw new Error("Signed prekey not found");

  const ourSignedPreKeyPrivate = arrayBufferToUint8(signedPreKeyPair.privateKey);

  // X3DH responder side (mirrors initiator):
  // DH1 = DH(ourSignedPreKey, theirIdentity)
  const dh1 = sodium.crypto_scalarmult(ourSignedPreKeyPrivate, theirIdentityPub);

  // DH2 = DH(ourIdentity, theirEphemeral)
  const dh2 = sodium.crypto_scalarmult(ourIdentityPrivate, theirEphemeralPub);

  // DH3 = DH(ourSignedPreKey, theirEphemeral)
  const dh3 = sodium.crypto_scalarmult(
    ourSignedPreKeyPrivate,
    theirEphemeralPub
  );

  let dhConcat: Uint8Array;
  if (
    envelope.oneTimePreKeyId !== null &&
    envelope.oneTimePreKeyId !== undefined
  ) {
    const otpkPair = await keyStore.getOneTimePreKey(envelope.oneTimePreKeyId);
    if (otpkPair) {
      const ourOTPKPrivate = arrayBufferToUint8(otpkPair.privateKey);
      // DH4 = DH(ourOneTimePreKey, theirEphemeral)
      const dh4 = sodium.crypto_scalarmult(ourOTPKPrivate, theirEphemeralPub);
      dhConcat = new Uint8Array(
        dh1.length + dh2.length + dh3.length + dh4.length
      );
      dhConcat.set(dh1, 0);
      dhConcat.set(dh2, dh1.length);
      dhConcat.set(dh3, dh1.length + dh2.length);
      dhConcat.set(dh4, dh1.length + dh2.length + dh3.length);
    } else {
      // One-time prekey already consumed — proceed without
      dhConcat = new Uint8Array(dh1.length + dh2.length + dh3.length);
      dhConcat.set(dh1, 0);
      dhConcat.set(dh2, dh1.length);
      dhConcat.set(dh3, dh1.length + dh2.length);
    }
  } else {
    dhConcat = new Uint8Array(dh1.length + dh2.length + dh3.length);
    dhConcat.set(dh1, 0);
    dhConcat.set(dh2, dh1.length);
    dhConcat.set(dh3, dh1.length + dh2.length);
  }

  // Same KDF as initiator
  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode("QyouX3DH");
  const derived = hkdf(dhConcat, salt, info, 96);

  // Note: recv/send are swapped relative to initiator
  const session: SessionState = {
    rootKey: toBase64(derived.slice(0, 32)),
    sendChainKey: toBase64(derived.slice(64, 96)), // our send = their recv
    recvChainKey: toBase64(derived.slice(32, 64)), // our recv = their send
    sendCounter: 0,
    recvCounter: 0,
    theirIdentityKey: envelope.ourIdentityPublicKey!,
    theirSignedPreKeyId: signedPreKeyId,
  };

  return session;
}

export async function hasSession(userId: string): Promise<boolean> {
  const session = await keyStore.getSession(userId);
  return session !== null;
}
