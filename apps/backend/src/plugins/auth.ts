import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { config } from "../config";

export default fp(async (fastify) => {
  await fastify.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
    },
  });

  fastify.decorate("authenticate", async (request: any, reply: any) => {
    try {
      const decoded = await request.jwtVerify();
      request.userId = decoded.sub;
    } catch {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
