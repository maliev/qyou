import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as conversationService from "../services/conversationService";
import * as messageService from "../services/messageService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { pool } from "../db";
import { getIO } from "../realtime/index";
import { isBlocked } from "../services/contactService";

function validateMessageContent(content: string): string | null {
  if (content.trim().length === 0) return "Message cannot be empty";
  if (content.length > 4000) return "Message too long (max 4000 characters)";
  if (/(.)\1{49,}/.test(content)) return "Message contains spam-like content";
  const urlCount = (content.match(/https?:\/\//gi) || []).length;
  if (urlCount > 10) return "Too many URLs in message";
  return null;
}

const createConversationSchema = z.object({
  uin: z.number().int().positive(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

const getMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export default async function conversationRoutes(fastify: FastifyInstance) {
  // GET /conversations
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = listConversationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await conversationService.getConversations(
        request.userId,
        parsed.data.limit,
        parsed.data.offset
      );

      return reply.status(200).send(result);
    }
  );

  // POST /conversations
  fastify.post(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = createConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      // Find target user by UIN
      const targetResult = await pool.query(
        `SELECT id FROM users WHERE uin = $1`,
        [parsed.data.uin]
      );
      if (targetResult.rows.length === 0) {
        return sendError(reply, 404, "User not found");
      }
      const targetId = targetResult.rows[0].id;

      if (targetId === request.userId) {
        return sendError(reply, 400, "Cannot create conversation with yourself");
      }

      // Check for block in either direction
      const blockCheck = await pool.query(
        `SELECT 1 FROM contacts
         WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
           AND status = 'blocked'
         LIMIT 1`,
        [request.userId, targetId]
      );
      if (blockCheck.rows.length > 0) {
        return sendError(reply, 400, "Cannot create conversation with this user");
      }

      const result = await conversationService.getOrCreateConversation(
        request.userId,
        targetId
      );

      if (result && "error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Notify the other participant via WebSocket and join them to the conversation room
      try {
        const io = getIO();
        if (io && result.conversation) {
          const convRoom = `conversation:${result.conversation.id}`;
          // Join both participants' sockets to the new conversation room
          const sockets = await io.in(`user:${targetId}`).fetchSockets();
          for (const s of sockets) {
            s.join(convRoom);
          }
          const mySockets = await io.in(`user:${request.userId}`).fetchSockets();
          for (const s of mySockets) {
            s.join(convRoom);
          }
          // Notify the other user
          io.to(`user:${targetId}`).emit("conversation:new", {
            conversation: result.conversation,
          });
        }
      } catch {
        // Non-critical — don't fail the request if realtime notification fails
      }

      return reply.status(201).send(result);
    }
  );

  // GET /conversations/:id
  fastify.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await conversationService.getConversationById(
        id,
        request.userId
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      return reply.status(200).send(result);
    }
  );

  // GET /conversations/:id/pinned
  fastify.get(
    "/:id/pinned",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await messageService.getPinnedMessages(id, request.userId);

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      return reply.status(200).send(result);
    }
  );

  // GET /conversations/:id/messages
  fastify.get(
    "/:id/messages",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = getMessagesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await conversationService.getMessages(
        id,
        request.userId,
        parsed.data.before,
        parsed.data.limit
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      return reply.status(200).send(result);
    }
  );

  // POST /conversations/:id/messages
  fastify.post(
    "/:id/messages",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = sendMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      // Content validation
      const contentError = validateMessageContent(parsed.data.content);
      if (contentError) {
        return sendError(reply, 400, contentError);
      }

      // Block check
      const participants = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [id, request.userId]
      );
      for (const row of participants.rows) {
        const blocked = await isBlocked(request.userId, row.user_id);
        if (blocked) {
          return sendError(reply, 403, "Cannot send message to blocked user");
        }
      }

      const result = await conversationService.createMessage(
        id,
        request.userId,
        parsed.data.content
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      return reply.status(201).send(result);
    }
  );
}
