import { FastifyInstance } from "fastify";
import { z } from "zod";
import { saveSubscription, removeSubscription } from "../services/pushService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { config } from "../config";

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
}
