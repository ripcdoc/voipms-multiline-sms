import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";

const clients = new Set<WebSocket>();

export function registerWsRoute(app: FastifyInstance): void {
  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });
}

export function broadcast(event: string, payload: unknown): void {
  const data = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}
