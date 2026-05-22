import { io, type Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";
const SESSION_KEY = "settleit_session";

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

export function saveSession(roomCode: string, playerId: string, nickname: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId, nickname }));
}

export function clearSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): { roomCode: string; playerId: string; nickname: string } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
