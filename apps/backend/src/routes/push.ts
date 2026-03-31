import { FastifyInstance } from "fastify";
import { z } from "zod";
import { saveSubscription, removeSubscription, sendPushToUser } from "../services/pushService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { config } from "../config";
import { pool } from "../db";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
    expirationTime: z.union([z.number(), z.null()]).optional(),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export default async function pushRoutes(fastify: FastifyInstance) {
  // POST /push/subscribe — Save push subscription
  fastify.post(
    "/subscribe",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = subscribeSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      try {
        const userId = (request as any).userId as string;
        const subscriptionJson = JSON.stringify(parsed.data.subscription);
        await saveSubscription(userId, subscriptionJson);
        return reply.status(200).send({ success: true });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );

  // DELETE /push/subscribe — Remove push subscription
  fastify.delete(
    "/subscribe",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = unsubscribeSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      try {
        const userId = (request as any).userId as string;
        await removeSubscription(userId, parsed.data.endpoint);
        return reply.status(200).send({ success: true });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );

  // GET /push/vapid-public-key — Return the VAPID public key (no auth)
  fastify.get("/vapid-public-key", async (_request, reply) => {
    return reply.status(200).send({
      publicKey: config.VAPID_PUBLIC_KEY || null,
    });
  });

  // GET /push/status — Check push subscription status for current user
  fastify.get(
    "/status",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId as string;
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM push_tokens WHERE user_id = $1`,
        [userId]
      );
      return reply.status(200).send({
        subscriptions: result.rows[0].count,
      });
    }
  );

  // POST /push/test — Send a test push notification to yourself
  fastify.post(
    "/test",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = (request as any).userId as string;
      try {
        await sendPushToUser(userId, {
          title: "Qyou Test",
          body: "Push notifications are working!",
          data: {},
        });
        return reply.status(200).send({ success: true });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Push test failed");
      }
    }
  );
}
