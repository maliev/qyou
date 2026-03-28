import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/authService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(64).optional(),
});

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid input");
    }

    const result = await authService.register(parsed.data);

    if ("error" in result) {
      return sendError(reply, result.error.status, result.error.message);
    }

    const tokens = await authService.createTokenPair(fastify, result.userId);

    return reply.status(201).send({
      user: result.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  // POST /auth/login
  fastify.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid input");
    }

    const result = await authService.login(parsed.data);

    if ("error" in result) {
      return sendError(reply, result.error.status, result.error.message);
    }

    const tokens = await authService.createTokenPair(fastify, result.userId);

    return reply.status(200).send({
      user: result.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  // POST /auth/logout
  fastify.post(
    "/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = logoutSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      await authService.logout(parsed.data.refreshToken);

      return reply.status(200).send({ message: "Logged out" });
    }
  );

  // POST /auth/refresh
  fastify.post("/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid input");
    }

    const result = await authService.refreshTokens(
      fastify,
      parsed.data.refreshToken
    );

    if ("error" in result) {
      return sendError(reply, result.error.status, result.error.message);
    }

    return reply.status(200).send({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  });

  // GET /auth/me
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = await authService.getMe(request.userId);

      if (!user) {
        return sendError(reply, 401, "Unauthorized");
      }

      return reply.status(200).send({ user });
    }
  );
}
