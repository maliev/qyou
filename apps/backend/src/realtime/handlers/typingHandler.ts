import { Server, Socket } from "socket.io";

// Track auto-stop timers per socket per conversation
const typingTimers = new Map<string, NodeJS.Timeout>();

function timerKey(socketId: string, conversationId: string) {
  return `${socketId}:${conversationId}`;
}

export function register(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on("typing:start", (payload) => {
    const { conversationId } = payload || {};
    if (!conversationId) return;

    // Emit to conversation room (excluding sender)
    socket.to(`conversation:${conversationId}`).emit("typing", {
      conversationId,
      userId,
      isTyping: true,
    });

    // Auto-stop after 5 seconds
    const key = timerKey(socket.id, conversationId);
    const existing = typingTimers.get(key);
    if (existing) clearTimeout(existing);

    typingTimers.set(
      key,
      setTimeout(() => {
        socket.to(`conversation:${conversationId}`).emit("typing", {
          conversationId,
          userId,
          isTyping: false,
        });
        typingTimers.delete(key);
      }, 5000)
    );
  });

  socket.on("typing:stop", (payload) => {
    const { conversationId } = payload || {};
    if (!conversationId) return;

    // Clear auto-stop timer
    const key = timerKey(socket.id, conversationId);
    const existing = typingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      typingTimers.delete(key);
    }

    socket.to(`conversation:${conversationId}`).emit("typing", {
      conversationId,
      userId,
      isTyping: false,
    });
  });

  // Clean up timers on disconnect
  socket.on("disconnect", () => {
    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(socket.id + ":")) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
  });
}
