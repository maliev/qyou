import { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchMessages } from "../services/searchService";
import { searchUsers } from "../services/userService";
import { requireAuth } from "../middleware/requireAuth";

const searchQuerySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
  type: z.enum(["messages", "users", "all"]).default("all"),
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = searchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid input" });
      }

      const { q, type, conversationId, limit, offset } = parsed.data;
      const userId = request.user.sub;

      let messages: Awaited<ReturnType<typeof searchMessages>> = [];
      let users: { id: string }[] = [];

      if (type === "messages" || type === "all") {
        messages = await searchMessages(userId, q, conversationId, limit, offset);
      }

      if (type === "users" || type === "all") {
        const userResult = await searchUsers(q, userId, undefined, limit, offset);
        users = userResult.users;
      }

      return reply.send({ messages, users });
    }
  );
}
