import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as e2eeService from "../services/e2eeService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";

const uploadKeysSchema = z.object({
  identityKey: z.string().min(1),
  registrationId: z.number().int().min(1).max(16380),
  signedPreKey: z.object({
    keyId: z.number().int().min(0),
    publicKey: z.string().min(1),
    signature: z.string().min(1),
  }),
  oneTimePreKeys: z.array(
    z.object({
      keyId: z.number().int().min(0),
      publicKey: z.string().min(1),
    })
  ),
});

export default async function e2eeRoutes(fastify: FastifyInstance) {
  // POST /e2ee/keys — Upload key bundle
  fastify.post(
    "/keys",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = uploadKeysSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      try {
        const userId = (request as any).userId as string;
        await e2eeService.uploadKeys(userId, parsed.data);
        return reply.status(200).send({ success: true });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );

  // GET /e2ee/keys/status — Check one-time prekey count
  fastify.get(
    "/keys/status",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const userId = (request as any).userId as string;
        const count = await e2eeService.getOneTimePreKeyCount(userId);
        return reply.status(200).send({ oneTimePreKeyCount: count });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );

  // GET /e2ee/keys/:userId — Fetch another user's prekey bundle
  fastify.get(
    "/keys/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { userId: targetUserId } = request.params as { userId: string };

      if (!targetUserId || typeof targetUserId !== "string") {
        return sendError(reply, 400, "Invalid input");
      }

      try {
        const requestingUserId = (request as any).userId as string;
        const result = await e2eeService.getPreKeyBundle(
          requestingUserId,
          targetUserId
        );

        if ("error" in result) {
          return sendError(reply, result.error!.status, result.error!.message);
        }

        return reply.status(200).send(result.bundle);
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );

  // DELETE /e2ee/session/:conversationId — Reset E2EE session
  fastify.delete(
    "/session/:conversationId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { conversationId } = request.params as {
        conversationId: string;
      };

      if (!conversationId || typeof conversationId !== "string") {
        return sendError(reply, 400, "Invalid input");
      }

      try {
        const userId = (request as any).userId as string;
        const result = await e2eeService.deleteSession(conversationId, userId);

        if ("error" in result) {
          return sendError(reply, result.error!.status, result.error!.message);
        }

        return reply.status(200).send({ success: true });
      } catch (err) {
        request.log.error(err);
        return sendError(reply, 500, "Internal server error");
      }
    }
  );
}
