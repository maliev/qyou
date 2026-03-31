import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { config } from "../config";
import { isRedisAvailable } from "../redis";
import { socketAuthMiddleware } from "./middleware/authMiddleware";
import * as connectionHandler from "./handlers/connectionHandler";
import * as messageHandler from "./handlers/messageHandler";
import * as presenceHandler from "./handlers/presenceHandler";
import * as typingHandler from "./handlers/typingHandler";
import * as readHandler from "./handlers/readHandler";

let io: Server;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ORIGIN,
      credentials: true,
    },
    pingInterval: 20000,
    pingTimeout: 10000,
  });

  // Redis adapter for multi-node support — fall back to in-memory if unavailable
  if (isRedisAvailable()) {
    try {
      const redisAdapterOpts: import("ioredis").RedisOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 500, 2000);
        },
        reconnectOnError: () => false,
      };
      const pubClient = config.REDIS_URL
        ? new Redis(config.REDIS_URL, redisAdapterOpts)
        : new Redis({ host: config.REDIS_HOST, port: config.REDIS_PORT, ...redisAdapterOpts });
      const subClient = pubClient.duplicate();

      pubClient.on("error", (err) => {
        console.warn("[ws] Redis pub client error:", err.message);
      });
      subClient.on("error", (err) => {
        console.warn("[ws] Redis sub client error:", err.message);
      });

      io.adapter(createAdapter(pubClient, subClient));
      console.log("[ws] Socket.io initialized with Redis adapter");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ws] Redis adapter failed, using in-memory adapter: ${message}`);
    }
  } else {
    console.warn("[ws] Redis unavailable — Socket.io using in-memory adapter (no multi-node support)");
  }

  // Auth middleware
  io.use(socketAuthMiddleware);

  // Connection handler — registers all event handlers per socket
  io.on("connection", (socket) => {
    connectionHandler.register(io, socket);
    messageHandler.register(io, socket);
    presenceHandler.register(io, socket);
    typingHandler.register(io, socket);
    readHandler.register(io, socket);
  });

  console.log("[ws] Socket.io initialized");
  return io;
}

export function getIO(): Server {
  return io;
}
