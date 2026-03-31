import { useCallback, useRef } from "react";
import sodium from "libsodium-wrappers-sumo";
import * as keyStore from "@/lib/e2ee/keyStore";
import * as signalProtocol from "@/lib/e2ee/signalProtocol";
import { resetKeysCache } from "@/lib/e2ee/decryptMessages";
import api from "@/lib/api";
import type { KeyBundle } from "@/types";

async function ensureSodium() {
  await sodium.ready;
}

const ONE_TIME_PREKEY_BATCH = 100;
const ONE_TIME_PREKEY_THRESHOLD = 10;

export function useE2EE() {
  const initializingRef = useRef(false);

  const initializeE2EE = useCallback(async (): Promise<boolean> => {
    if (initializingRef.current) return false;
    initializingRef.current = true;

    try {
      const hasExistingKeys = await keyStore.hasKeys();

      if (hasExistingKeys) {
        // Keys exist in IndexedDB — ensure server has them too
        try {
          const { data } = await api.get<{ oneTimePreKeyCount: number }>(
            "/e2ee/keys/status"
          );
          if (data.oneTimePreKeyCount < ONE_TIME_PREKEY_THRESHOLD) {
            await replenishOneTimePreKeys();
          }
        } catch (err: unknown) {
          // If server returns 404 (keys not found), re-upload from IndexedDB
          if (err && typeof err === "object" && "response" in err) {
            const axiosErr = err as { response?: { status?: number } };
            if (axiosErr.response?.status === 404) {
              await reuploadKeysFromIndexedDB();
            }
          }
        }
        return true;
      }

      // Generate full key bundle
      const identity = await signalProtocol.generateIdentityKeyPair();
      const registrationId = await signalProtocol.generateRegistrationId();
      const signedPreKey = await signalProtocol.generateSignedPreKey(
        identity.privateKey,
        0
      );
      const oneTimePreKeys = await signalProtocol.generateOneTimePreKeys(
        0,
        ONE_TIME_PREKEY_BATCH
      );

      // Upload public keys to server (NEVER private keys)
      await api.post("/e2ee/keys", {
        identityKey: identity.publicKeyBase64,
        registrationId,
        signedPreKey: {
          keyId: signedPreKey.keyId,
          publicKey: signedPreKey.publicKeyBase64,
          signature: signedPreKey.signatureBase64,
        },
        oneTimePreKeys: oneTimePreKeys.map((k) => ({
          keyId: k.keyId,
          publicKey: k.publicKeyBase64,
        })),
      });

      resetKeysCache();
      return true;
    } catch (err) {
      console.error("[E2EE] Initialization failed:", err);
      return false;
    } finally {
      initializingRef.current = false;
    }
  }, []);

  const reuploadKeysFromIndexedDB = useCallback(async () => {
    const identityKeyPair = await keyStore.getIdentityKeyPair();
    if (!identityKeyPair) return;

    const registrationId = (await keyStore.getRegistrationId()) ?? 0;
    const signedPreKeyId = await keyStore.getSignedPreKeyId();
    const signedPreKeyPair = await keyStore.getSignedPreKey(signedPreKeyId);
    if (!signedPreKeyPair) return;

    // Re-derive public key base64 from stored key pair
    await ensureSodium();
    const identityPubBase64 = sodium.to_base64(
      new Uint8Array(identityKeyPair.publicKey),
      sodium.base64_variants.ORIGINAL
    );
    const signedPubBase64 = sodium.to_base64(
      new Uint8Array(signedPreKeyPair.publicKey),
      sodium.base64_variants.ORIGINAL
    );

    // Re-sign the signed prekey
    const identityPriv = new Uint8Array(identityKeyPair.privateKey);
    const edKeyPair = sodium.crypto_sign_seed_keypair(identityPriv.slice(0, 32));
    const signature = sodium.crypto_sign_detached(
      new Uint8Array(signedPreKeyPair.publicKey),
      edKeyPair.privateKey
    );
    const signatureBase64 = sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);

    // Generate fresh one-time prekeys
    const counter = await keyStore.getOneTimePreKeyCounter();
    const oneTimePreKeys = await signalProtocol.generateOneTimePreKeys(
      counter,
      ONE_TIME_PREKEY_BATCH
    );

    await api.post("/e2ee/keys", {
      identityKey: identityPubBase64,
      registrationId,
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPubBase64,
        signature: signatureBase64,
      },
      oneTimePreKeys: oneTimePreKeys.map((k) => ({
        keyId: k.keyId,
        publicKey: k.publicKeyBase64,
      })),
    });
  }, []);

  const replenishOneTimePreKeys = useCallback(async () => {
    const counter = await keyStore.getOneTimePreKeyCounter();
    const identityKeyPair = await keyStore.getIdentityKeyPair();
    if (!identityKeyPair) return;

    const newKeys = await signalProtocol.generateOneTimePreKeys(
      counter,
      ONE_TIME_PREKEY_BATCH
    );

    await api.post("/e2ee/keys", {
      identityKey: "", // Server will skip if already exists
      registrationId: (await keyStore.getRegistrationId()) ?? 0,
      signedPreKey: {
        keyId: await keyStore.getSignedPreKeyId(),
        publicKey: "", // Server will skip if already exists
        signature: "",
      },
      oneTimePreKeys: newKeys.map((k) => ({
        keyId: k.keyId,
        publicKey: k.publicKeyBase64,
      })),
    });
  }, []);

  const encryptMessageForUser = useCallback(
    async (
      recipientId: string,
      content: string
    ): Promise<{ encryptedContent: string; isEncrypted: true } | null> => {
      try {
        const hasExistingSession = await signalProtocol.hasSession(recipientId);

        if (!hasExistingSession) {
          // Fetch prekey bundle from server and establish session (X3DH)
          const { data: bundle } = await api.get<KeyBundle>(
            `/e2ee/keys/${recipientId}`
          );

          await signalProtocol.initializeSession(recipientId, bundle);
        }

        // Encrypt using Double Ratchet
        const encrypted = await signalProtocol.encryptMessage(
          recipientId,
          content
        );

        return {
          encryptedContent: JSON.stringify(encrypted),
          isEncrypted: true,
        };
      } catch (err) {
        console.error("[E2EE] Encryption failed, falling back to plaintext:", err);
        return null;
      }
    },
    []
  );

  const decryptMessageContent = useCallback(
    async (
      senderId: string,
      encryptedContent: string
    ): Promise<string> => {
      try {
        const parsed = JSON.parse(encryptedContent) as {
          type: number;
          body: string;
        };
        return await signalProtocol.decryptMessage(senderId, parsed);
      } catch (err) {
        console.error("[E2EE] Decryption failed:", err);
        return "[Decryption failed]";
      }
    },
    []
  );

  const isE2EEEnabled = useCallback(async (): Promise<boolean> => {
    return keyStore.hasKeys();
  }, []);

  return {
    initializeE2EE,
    encryptMessageForUser,
    decryptMessageContent,
    isE2EEEnabled,
  };
}
