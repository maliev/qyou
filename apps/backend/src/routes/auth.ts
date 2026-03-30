import { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import * as authService from "../services/authService";
import * as twoFactorService from "../services/twoFactorService";
import { sendError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { config } from "../config";
import { pool } from "../db";
import { safeRedisGet, safeRedisSet } from "../utils/gracefulRedis";

const LOGIN_MAX_ATTEMPTS = 10; // per 15 minutes
const LOGIN_RATE_WINDOW = 900; // 15 minutes in seconds
const LOGIN_DELAY_THRESHOLD = 5; // after 5 failures, add delay
const LOGIN_DELAY_MS = 30000; // 30 seconds

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

const totpVerifySchema = z.object({
  token: z.string().min(6).max(6),
});

const totpValidateSchema = z.object({
  userId: z.string().uuid(),
  token: z.string().min(1).max(8),
});

const totpDisableSchema = z.object({
  token: z.string().min(1).max(8),
  password: z.string().min(1),
});

const TEMP_TOKEN_EXPIRY = "5m";

function signTempToken(userId: string): string {
  return jwt.sign(
    { sub: userId, purpose: "2fa" },
    config.JWT_ACCESS_SECRET,
    { expiresIn: TEMP_TOKEN_EXPIRY }
  );
}

function verifyTempToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as {
      sub: string;
      purpose?: string;
    };
    if (decoded.purpose !== "2fa") return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid input");
    }

    const result = await authService.register(parsed.data);

    if ("error" in result) {
      return sendError(reply, result.error!.status, result.error!.message);
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

    // Login rate limiting by IP
    const clientIp = request.ip;
    const rateLimitKey = `ratelimit:login:${clientIp}`;
    const failCountStr = await safeRedisGet(rateLimitKey);
    const failCount = failCountStr ? parseInt(failCountStr, 10) : 0;

    if (failCount >= LOGIN_MAX_ATTEMPTS) {
      return reply.status(429).send({
        message: "Too many login attempts. Please try again later.",
        retryAfter: LOGIN_RATE_WINDOW,
      });
    }

    // After threshold failures, add delay
    if (failCount >= LOGIN_DELAY_THRESHOLD) {
      const delayKey = `ratelimit:login:delay:${clientIp}`;
      const lastAttempt = await safeRedisGet(delayKey);
      if (lastAttempt) {
        const elapsed = Date.now() - parseInt(lastAttempt, 10);
        if (elapsed < LOGIN_DELAY_MS) {
          const retryAfter = Math.ceil((LOGIN_DELAY_MS - elapsed) / 1000);
          return reply.status(429).send({
            message: "Too many failed attempts. Please wait before trying again.",
            retryAfter,
          });
        }
      }
      await safeRedisSet(delayKey, String(Date.now()), LOGIN_RATE_WINDOW);
    }

    const result = await authService.login(parsed.data);

    if ("error" in result) {
      // Track failed login attempts
      await safeRedisSet(rateLimitKey, String(failCount + 1), LOGIN_RATE_WINDOW);
      return sendError(reply, result.error!.status, result.error!.message);
    }

    // Check if 2FA is enabled
    const totpEnabled = await twoFactorService.isTOTPEnabled(result.userId);

    if (totpEnabled) {
      // Return temp token instead of real tokens
      const tempToken = signTempToken(result.userId);
      return reply.status(200).send({
        requires2FA: true,
        tempToken,
        userId: result.userId,
      });
    }

    const tokens = await authService.createTokenPair(fastify, result.userId);

    return reply.status(200).send({
      user: result.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  // POST /auth/2fa/validate — complete login with TOTP
  fastify.post("/2fa/validate", async (request, reply) => {
    const parsed = totpValidateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "Invalid input");
    }

    // Verify temp token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return sendError(reply, 401, "Unauthorized");
    }

    const tempToken = authHeader.slice(7);
    const tokenUserId = verifyTempToken(tempToken);
    if (!tokenUserId || tokenUserId !== parsed.data.userId) {
      return sendError(reply, 401, "Invalid or expired token");
    }

    const secret = await twoFactorService.getTOTPSecret(parsed.data.userId);
    if (!secret) {
      return sendError(reply, 400, "2FA not configured");
    }

    // Try TOTP first, then backup code
    let valid = twoFactorService.verifyToken(secret, parsed.data.token);
    if (!valid) {
      valid = await twoFactorService.verifyBackupCode(
        parsed.data.userId,
        parsed.data.token
      );
    }

    if (!valid) {
      return sendError(reply, 401, "Invalid 2FA code");
    }

    // Issue real tokens
    const user = await authService.getMe(parsed.data.userId);
    if (!user) {
      return sendError(reply, 401, "Unauthorized");
    }

    const tokens = await authService.createTokenPair(fastify, parsed.data.userId);

    return reply.status(200).send({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  // POST /auth/2fa/setup — generate TOTP secret + QR code
  fastify.post(
    "/2fa/setup",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      // Get username for the TOTP URI
      const userResult = await pool.query(
        `SELECT username, totp_enabled FROM users WHERE id = $1`,
        [request.userId]
      );
      if (userResult.rows.length === 0) {
        return sendError(reply, 401, "Unauthorized");
      }
      if (userResult.rows[0].totp_enabled) {
        return sendError(reply, 400, "2FA is already enabled");
      }

      const result = await twoFactorService.setupTOTP(
        request.userId,
        userResult.rows[0].username
      );

      return reply.status(200).send({
        secret: result.secret,
        qrCodeUrl: result.qrCodeUrl,
        backupCodes: result.backupCodes,
      });
    }
  );

  // POST /auth/2fa/verify-setup — confirm TOTP setup
  fastify.post(
    "/2fa/verify-setup",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = totpVerifySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      const secret = await twoFactorService.getTOTPSecret(request.userId);
      if (!secret) {
        return sendError(reply, 400, "2FA setup not initiated");
      }

      const valid = twoFactorService.verifyToken(secret, parsed.data.token);
      if (!valid) {
        return sendError(reply, 400, "Invalid verification code");
      }

      await twoFactorService.enableTOTP(request.userId);

      return reply.status(200).send({ success: true });
    }
  );

  // POST /auth/2fa/disable — disable 2FA
  fastify.post(
    "/2fa/disable",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = totpDisableSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "Invalid input");
      }

      // Verify password
      const userResult = await pool.query(
        `SELECT password_hash, totp_secret FROM users WHERE id = $1`,
        [request.userId]
      );
      if (userResult.rows.length === 0) {
        return sendError(reply, 401, "Unauthorized");
      }

      const passwordValid = await bcrypt.compare(
        parsed.data.password,
        userResult.rows[0].password_hash
      );
      if (!passwordValid) {
        return sendError(reply, 401, "Invalid password");
      }

      // Verify TOTP or backup code
      const secret = userResult.rows[0].totp_secret;
      let tokenValid = false;
      if (secret) {
        tokenValid = twoFactorService.verifyToken(secret, parsed.data.token);
        if (!tokenValid) {
          tokenValid = await twoFactorService.verifyBackupCode(
            request.userId,
            parsed.data.token
          );
        }
      }
      if (!tokenValid) {
        return sendError(reply, 401, "Invalid 2FA code");
      }

      await twoFactorService.disableTOTP(request.userId);

      return reply.status(200).send({ success: true });
    }
  );

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
      return sendError(reply, result.error!.status, result.error!.message);
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

      // Include totp_enabled in the response
      const totpResult = await pool.query(
        `SELECT totp_enabled FROM users WHERE id = $1`,
        [request.userId]
      );
      const userWithTotp = {
        ...user,
        totp_enabled: totpResult.rows[0]?.totp_enabled ?? false,
      };

      return reply.status(200).send({ user: userWithTotp });
    }
  );
}
