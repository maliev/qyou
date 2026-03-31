import webpush from "web-push";
import { pool } from "../db";
import { config } from "../config";

/** Initialize web-push with VAPID keys (call once at startup) */
export function initWebPush(): void {
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:noreply@qyou.app",
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY
    );
  }
}

/** Save push subscription for a user */
export async function saveSubscription(
  userId: string,
  subscription: string
): Promise<void> {
  await pool.query(
    `INSERT INTO push_tokens (user_id, token, platform)
     VALUES ($1, $2, 'web')
     ON CONFLICT (user_id, token) DO NOTHING`,
    [userId, subscription]
  );
}

/** Remove push subscription by endpoint */
export async function removeSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  // The token column stores full JSON subscription, so match by endpoint prefix
  await pool.query(
    `DELETE FROM push_tokens WHERE user_id = $1 AND token LIKE $2`,
    [userId, `%${endpoint}%`]
  );
}

/** Send push notification to all of a user's subscriptions */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  const result = await pool.query(
    `SELECT id, token FROM push_tokens WHERE user_id = $1 AND platform = 'web'`,
    [userId]
  );

  const payloadStr = JSON.stringify(payload);

  for (const row of result.rows) {
    try {
      const subscription = JSON.parse(row.token) as webpush.PushSubscription;
      await webpush.sendNotification(subscription, payloadStr);
    } catch (err: any) {
      // If subscription is expired or invalid (410 Gone, 404), delete it
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query(`DELETE FROM push_tokens WHERE id = $1`, [row.id]);
      }
      // Silently ignore other push errors
    }
  }
}
