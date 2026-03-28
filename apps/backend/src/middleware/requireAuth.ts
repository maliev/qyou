import { FastifyRequest, FastifyReply } from "fastify";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  return request.server.authenticate(request, reply);
}
