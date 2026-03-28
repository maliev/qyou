import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connecting = false;

export function connect(token: string): Socket {
  // Return existing socket if connected or still connecting
  if (socket && (socket.connected || socket.active)) return socket;

  // Prevent double-connect from React StrictMode double-invoke
  if (connecting && socket) return socket;

  // Clean up any stale disconnected socket
  if (socket) {
    socket.removeAllListeners();
    socket = null;
  }

  connecting = true;

  socket = io(import.meta.env.VITE_WS_URL, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.once("connect", () => {
    connecting = false;
  });

  socket.once("connect_error", () => {
    connecting = false;
  });

  return socket;
}

export function disconnect() {
  connecting = false;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
