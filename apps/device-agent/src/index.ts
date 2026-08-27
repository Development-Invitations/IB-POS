import { WebSocketServer } from "ws";

const PORT = 8765;

const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", agent: "ib-pos-device-agent", version: "0.0.0" }));

  socket.on("message", (raw) => {
    // Этап 4: обработка команд сканера/регистратора/денежного ящика/дисплея.
    socket.send(JSON.stringify({ type: "ack", received: raw.toString() }));
  });
});

console.log(`[device-agent] listening on ws://127.0.0.1:${PORT}`);
