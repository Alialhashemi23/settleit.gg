import { io, type Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, { autoConnect: false });
  }
  return socket;
}

export function connect(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnect() {
  socket?.disconnect();
  socket = null;
}
