import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as userService from "../services/userService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";

const searchSchema = z.object({
  q: z.string().min(1),
  country: z.string().length(2).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const updateProfileSchema = z
  .object({
    display_name: z.string().min(1).max(64).optional(),
    bio: z.string().min(0).max(500).optional(),
    country: z.string().length(2).optional(),
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

const VALID_AVATAR_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

export default async function userRoutes(fastify: FastifyInstance) {
  // GET /users/search
  fastify.get(
    "/search",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = searchSchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const { q, country, limit, offset } = parsed.data;
      const result = await userService.searchUsers(
        q,
        request.userId,
        country,
        limit,
        offset
      );

      return reply.status(200).send(result);
    }
  );

  // GET /users/:uin
  fastify.get(
    "/:uin",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { uin } = request.params as { uin: string };
      const uinNum = parseInt(uin, 10);

      if (isNaN(uinNum)) {
        return sendError(reply, 400, "Invalid input");
      }

      const user = await userService.getUserByUin(uinNum);
      if (!user) {
        return sendError(reply, 404, "User not found");
      }

      return reply.status(200).send({ user });
    }
  );

  // PATCH /users/me
  fastify.patch(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = updateProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const result = await userService.updateProfile(
        request.userId,
        parsed.data
      );

      if (!result) {
        return sendError(reply, 404, "User not found");
      }
      if ("error" in result) {
        return sendError(reply, result.error.status, result.error.message);
      }

      return reply.status(200).send(result);
    }
  );

  // POST /users/me/avatar
  fastify.post(
    "/me/avatar",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = request.body as { avatar?: string } | null;

      if (!body || typeof body.avatar !== "string") {
        return sendError(reply, 400, "Invalid input");
      }

      const { avatar } = body;

      // Validate mime type
      const isValid = VALID_AVATAR_PREFIXES.some((prefix) =>
        avatar.startsWith(prefix)
      );
      if (!isValid) {
        return sendError(reply, 400, "Invalid file type");
      }

      // Validate size (base64 is ~4/3 of original)
      const base64Data = avatar.split(",")[1];
      if (!base64Data) {
        return sendError(reply, 400, "Invalid input");
      }
      const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
      if (sizeBytes > MAX_AVATAR_SIZE) {
        return sendError(reply, 400, "File too large");
      }

      const result = await userService.updateAvatar(request.userId, avatar);
      if (!result) {
        return sendError(reply, 404, "User not found");
      }

      return reply.status(200).send(result);
    }
  );
}
