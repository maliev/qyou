import { pool } from "../db";

interface SignedPreKeyInput {
  keyId: number;
  publicKey: string;
  signature: string;
}

interface OneTimePreKeyInput {
  keyId: number;
  publicKey: string;
}

interface KeyBundleInput {
  identityKey: string;
  registrationId: number;
  signedPreKey: SignedPreKeyInput;
  oneTimePreKeys: OneTimePreKeyInput[];
}

export async function uploadKeys(userId: string, bundle: KeyBundleInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert identity key
    await client.query(
      `INSERT INTO identity_keys (user_id, public_key, registration_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET public_key = EXCLUDED.public_key,
             registration_id = EXCLUDED.registration_id`,
      [userId, bundle.identityKey, bundle.registrationId]
    );

    // Upsert signed prekey
    await client.query(
      `INSERT INTO signed_prekeys (user_id, key_id, public_key, signature)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, key_id) DO UPDATE
         SET public_key = EXCLUDED.public_key,
             signature = EXCLUDED.signature`,
      [
        userId,
        bundle.signedPreKey.keyId,
        bundle.signedPreKey.publicKey,
        bundle.signedPreKey.signature,
      ]
    );

    // Insert one-time prekeys (skip conflicts — already uploaded)
    for (const otpk of bundle.oneTimePreKeys) {
      await client.query(
        `INSERT INTO one_time_prekeys (user_id, key_id, public_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key_id) DO NOTHING`,
        [userId, otpk.keyId, otpk.publicKey]
      );
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getPreKeyBundle(
  requestingUserId: string,
  targetUserId: string
) {
  // Get identity key
  const identityResult = await pool.query(
    `SELECT public_key, registration_id FROM identity_keys WHERE user_id = $1`,
    [targetUserId]
  );
  if (identityResult.rows.length === 0) {
    return { error: { status: 404, message: "E2EE keys not found for user" } };
  }

  // Get most recent signed prekey
  const signedResult = await pool.query(
    `SELECT key_id, public_key, signature FROM signed_prekeys
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [targetUserId]
  );
  if (signedResult.rows.length === 0) {
    return { error: { status: 404, message: "Signed prekey not found for user" } };
  }

  // Get and consume one one-time prekey (atomic delete + return)
  const otpkResult = await pool.query(
    `DELETE FROM one_time_prekeys
     WHERE id = (
       SELECT id FROM one_time_prekeys
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1
     )
     RETURNING key_id, public_key`,
    [targetUserId]
  );

  const identity = identityResult.rows[0];
  const signed = signedResult.rows[0];

  return {
    bundle: {
      identityKey: identity.public_key,
      registrationId: identity.registration_id,
      signedPreKey: {
        keyId: signed.key_id,
        publicKey: signed.public_key,
        signature: signed.signature,
      },
      oneTimePreKey:
        otpkResult.rows.length > 0
          ? {
              keyId: otpkResult.rows[0].key_id,
              publicKey: otpkResult.rows[0].public_key,
            }
          : null,
    },
  };
}

export async function getOneTimePreKeyCount(userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM one_time_prekeys WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0].count;
}

export async function hasE2eeSession(conversationId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM e2ee_sessions WHERE conversation_id = $1`,
    [conversationId]
  );
  return result.rows.length > 0;
}

export async function markSessionEstablished(
  conversationId: string,
  initiatorId: string
) {
  await pool.query(
    `INSERT INTO e2ee_sessions (conversation_id, initiator_id)
     VALUES ($1, $2)
     ON CONFLICT (conversation_id) DO NOTHING`,
    [conversationId, initiatorId]
  );
}

export async function deleteSession(
  conversationId: string,
  userId: string
) {
  // Verify user is a participant
  const partCheck = await pool.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (partCheck.rows.length === 0) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  await pool.query(
    `DELETE FROM e2ee_sessions WHERE conversation_id = $1`,
    [conversationId]
  );

  return { success: true };
}
