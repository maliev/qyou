import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../../config";

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication failed"));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub: string };
    socket.data.userId = decoded.sub;
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
}
