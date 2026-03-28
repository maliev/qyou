import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
