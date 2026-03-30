import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { config } from "../config";

export default fp(async (fastify) => {
  await fastify.register(cors, {
    origin:
      config.NODE_ENV === "production"
        ? config.CORS_ORIGIN
        : true,
    credentials: true,
  });
});
