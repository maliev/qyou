import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as contactService from "../services/contactService";
import * as conversationService from "../services/conversationService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { getIO } from "../realtime/index";
import { pool } from "../db";
import { safeRedisGet, safeRedisSet } from "../utils/gracefulRedis";

const CONTACT_RATE_LIMIT = 20; // requests per hour
const CONTACT_RATE_WINDOW = 3600; // 1 hour in seconds

const addContactSchema = z.object({
  userId: z.string().uuid(),
});

const updateContactSchema = z.object({
  status: z.enum(["accepted", "rejected", "blocked"]),
});

export default async function contactRoutes(fastify: FastifyInstance) {
  // GET /contacts
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { status } = request.query as { status?: string };
      const validStatuses = ["pending", "accepted", "blocked"];

      if (status && !validStatuses.includes(status)) {
        return sendError(reply, 400, "Invalid input");
      }

      const contacts = await contactService.getContacts(
        request.userId,
        status
      );
      return reply.status(200).send({ contacts });
    }
  );

  // GET /contacts/pending
  fastify.get(
    "/pending",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const contacts = await contactService.getPendingRequests(request.userId);
      return reply.status(200).send({ contacts });
    }
  );

  // POST /contacts
  fastify.post(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = addContactSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      // Rate limit: max 20 contact requests per hour
      const rateLimitKey = `ratelimit:contacts:${request.userId}`;
      const current = await safeRedisGet(rateLimitKey);
      const count = current ? parseInt(current, 10) : 0;
      if (count >= CONTACT_RATE_LIMIT) {
        return sendError(reply, 429, "Too many contact requests. Please try again later.");
      }
      await safeRedisSet(rateLimitKey, String(count + 1), CONTACT_RATE_WINDOW);

      const result = await contactService.sendContactRequest(
        request.userId,
        parsed.data.userId
      );

      if ("error" in result) {
        return sendError(reply, result.error.status, result.error.message);
      }

      // Emit contact:request to the target user via WebSocket
      try {
        const io = getIO();
        if (io) {
          // Get the requester's profile for the notification
          const requesterResult = await pool.query(
            `SELECT id, uin, username, display_name, avatar_url FROM users WHERE id = $1`,
            [request.userId]
          );
          if (requesterResult.rows.length > 0) {
            const fromUser = requesterResult.rows[0];
            io.to(`user:${parsed.data.userId}`).emit("contact:request", {
              fromUser: {
                id: fromUser.id,
                uin: fromUser.uin,
                username: fromUser.username,
                display_name: fromUser.display_name,
                avatar_url: fromUser.avatar_url,
              },
              contactId: request.userId,
            });
          }
        }
      } catch {
        // Non-critical — don't fail the request if realtime notification fails
      }

      return reply.status(201).send(result);
    }
  );

  // PATCH /contacts/:userId
  fastify.patch(
    "/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const parsed = updateContactSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      let result;
      if (parsed.data.status === "accepted") {
        result = await contactService.acceptContactRequest(
          request.userId,
          userId
        );

        if (!("error" in result)) {
          // Auto-create conversation between the two users
          try {
            const convResult = await conversationService.getOrCreateConversation(
              request.userId,
              userId
            );

            if (convResult && !("error" in convResult) && convResult.conversation) {
              const io = getIO();
              if (io) {
                const convRoom = `conversation:${convResult.conversation.id}`;
                // Join both participants' sockets to the new conversation room
                const targetSockets = await io.in(`user:${userId}`).fetchSockets();
                for (const s of targetSockets) {
                  s.join(convRoom);
                }
                const mySockets = await io.in(`user:${request.userId}`).fetchSockets();
                for (const s of mySockets) {
                  s.join(convRoom);
                }
                // Notify both users about the new conversation
                io.to(`user:${userId}`).emit("conversation:new", {
                  conversation: convResult.conversation,
                });
                io.to(`user:${request.userId}`).emit("conversation:new", {
                  conversation: convResult.conversation,
                });
              }
            }
          } catch {
            // Non-critical — conversation creation failure doesn't fail the contact accept
          }
        }
      } else if (parsed.data.status === "rejected") {
        result = await contactService.rejectContactRequest(
          request.userId,
          userId
        );
      } else {
        result = await contactService.blockUser(request.userId, userId);
      }

      if ("error" in result) {
        return sendError(reply, result.error.status, result.error.message);
      }

      return reply.status(200).send(result);
    }
  );

  // GET /contacts/blocked
  fastify.get(
    "/blocked",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const contacts = await contactService.getBlockedUsers(request.userId);
      return reply.status(200).send({ contacts });
    }
  );

  // DELETE /contacts/block/:userId — unblock
  fastify.delete(
    "/block/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };

      const result = await contactService.unblockUser(request.userId, userId);

      if ("error" in result) {
        return sendError(reply, result.error.status, result.error.message);
      }

      return reply.status(200).send({ message: "User unblocked" });
    }
  );

  // DELETE /contacts/:userId
  fastify.delete(
    "/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };

      const result = await contactService.removeContact(
        request.userId,
        userId
      );

      if ("error" in result) {
        return sendError(reply, result.error.status, result.error.message);
      }

      return reply.status(200).send({ message: "Contact removed" });
    }
  );
}
