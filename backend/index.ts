import { createServer } from "http";
import { Server } from "socket.io";
import "./db"; // initialize DB + cleanup interval
import { registerRoomHandlers } from "./handlers/room";
import { registerQuestionHandlers } from "./handlers/question";
import { registerResponseHandlers } from "./handlers/response";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  registerRoomHandlers(io, socket);
  registerQuestionHandlers(io, socket);
  registerResponseHandlers(io, socket);
});

httpServer.listen(PORT, () => {
  console.log(`settleit backend running on :${PORT}`);
});
