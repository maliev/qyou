import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as messageService from "../services/messageService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { getIO } from "../realtime/index";

const ALLOWED_EMOJIS = ["❤️", "🔥", "😂", "👍", "👎", "😮"];

const toggleReactionSchema = z.object({
  emoji: z.string().refine((v) => ALLOWED_EMOJIS.includes(v), {
    message: "Invalid emoji",
  }),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

const deleteMessageSchema = z.object({
  deleteFor: z.enum(["self", "everyone"]),
});

const forwardMessageSchema = z.object({
  conversationId: z.string().uuid(),
});

export default async function messageRoutes(fastify: FastifyInstance) {
  // POST /messages/:id/reactions — Toggle reaction
  fastify.post(
    "/:id/reactions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = toggleReactionSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await messageService.toggleReaction(
        id,
        request.userId,
        parsed.data.emoji
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Emit WebSocket event
      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${result.conversationId}`).emit("message:reaction", {
            messageId: id,
            conversationId: result.conversationId,
            userId: request.userId,
            emoji: parsed.data.emoji,
            action: result.action,
          });
        }
      } catch {
        // Non-critical
      }

      return reply.status(200).send({
        action: result.action,
        reaction: result.reaction,
      });
    }
  );

  // DELETE /messages/:id/reactions/:emoji — Remove specific reaction
  fastify.delete(
    "/:id/reactions/:emoji",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, emoji } = request.params as { id: string; emoji: string };
      const decodedEmoji = decodeURIComponent(emoji);

      const result = await messageService.removeReaction(
        id,
        request.userId,
        decodedEmoji
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      return reply.status(200).send({ message: "Reaction removed" });
    }
  );

  // PATCH /messages/:id — Edit message
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = editMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await messageService.editMessage(
        id,
        request.userId,
        parsed.data.content
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Emit WebSocket event
      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${result.conversationId}`).emit("message:edited", {
            messageId: id,
            conversationId: result.conversationId,
            content: parsed.data.content,
            editedAt: result.message.edited_at,
          });
        }
      } catch {
        // Non-critical
      }

      return reply.status(200).send({ message: result.message });
    }
  );

  // DELETE /messages/:id — Delete message
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = deleteMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await messageService.deleteMessage(
        id,
        request.userId,
        parsed.data.deleteFor
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Emit WebSocket event
      try {
        const io = getIO();
        if (io) {
          if (result.deleteFor === "everyone") {
            io.to(`conversation:${result.conversationId}`).emit("message:deleted", {
              messageId: id,
              conversationId: result.conversationId,
              deleteFor: "everyone",
              userId: request.userId,
            });
          } else {
            // "self" — only notify the requesting user
            io.to(`user:${request.userId}`).emit("message:deleted", {
              messageId: id,
              conversationId: result.conversationId,
              deleteFor: "self",
              userId: request.userId,
            });
          }
        }
      } catch {
        // Non-critical
      }

      return reply.status(200).send({ message: "Message deleted" });
    }
  );

  // POST /messages/:id/pin — Toggle pin
  fastify.post(
    "/:id/pin",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await messageService.pinMessage(id, request.userId);

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Emit WebSocket event
      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${result.conversationId}`).emit("message:pinned", {
            messageId: id,
            conversationId: result.conversationId,
            isPinned: result.isPinned,
            pinnedBy: request.userId,
          });
        }
      } catch {
        // Non-critical
      }

      return reply.status(200).send({
        isPinned: result.isPinned,
        messageId: result.messageId,
        conversationId: result.conversationId,
      });
    }
  );

  // POST /messages/:id/forward — Forward message
  fastify.post(
    "/:id/forward",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = forwardMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await messageService.forwardMessage(
        id,
        request.userId,
        parsed.data.conversationId
      );

      if ("error" in result) {
        return sendError(reply, result.error!.status, result.error!.message);
      }

      // Emit as a new message to the target conversation
      try {
        const io = getIO();
        if (io) {
          io.to(`conversation:${result.targetConversationId}`).emit("message:new", {
            message: result.message,
            conversationId: result.targetConversationId,
          });
        }
      } catch {
        // Non-critical
      }

      return reply.status(201).send({ message: result.message });
    }
  );
}
