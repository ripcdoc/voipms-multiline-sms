import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { registerApiRoutes } from "./api/routes.js";
import { registerAuth } from "./auth/index.js";
import { config } from "./config.js";
import "./db/index.js";
import { startReconciliationPoll } from "./voipms/reconcile.js";
import { registerSmsWebhook } from "./webhooks/sms.js";
import { registerWsRoute } from "./ws/index.js";

const app = Fastify({ logger: true, trustProxy: true });

// In production this typically runs single-origin behind a reverse proxy,
// so CORS can be locked to that domain via PUBLIC_ORIGIN. Local dev needs
// the wide-open default since the Vite dev server (localhost:5173) calls
// the backend (localhost:3001) cross-origin.
const corsOrigin = process.env.NODE_ENV === "production" ? config.PUBLIC_ORIGIN || true : true;
await app.register(cors, { origin: corsOrigin, credentials: true });
await app.register(websocket);
// 15MB cap - comfortably above what VoIP.ms's MMS carriers will actually
// deliver/accept, without letting an upload run unbounded.
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

app.get("/health", async () => ({ ok: true }));

await registerAuth(app);
await registerSmsWebhook(app);
registerWsRoute(app);
await app.register(registerApiRoutes);

// Uploaded MMS attachments (see /api/uploads) - served under their own
// prefix, separate from the frontend's static build below.
const uploadsDir = resolve(config.UPLOADS_DIR);
mkdirSync(uploadsDir, { recursive: true });
await app.register(staticFiles, { root: uploadsDir, prefix: "/uploads/", decorateReply: false });

// In the container build, the frontend's built static assets are copied to
// ../public next to this compiled file (see Dockerfile). Serve them here so
// the whole app runs behind one reverse-proxied origin — nothing to serve in
// local dev, where the Vite dev server handles the frontend instead.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public");
if (existsSync(publicDir)) {
  await app.register(staticFiles, { root: publicDir });
  app.setNotFoundHandler((req, reply) => {
    if (
      req.raw.url?.startsWith("/api") ||
      req.raw.url?.startsWith("/ws") ||
      req.raw.url?.startsWith("/webhooks") ||
      req.raw.url?.startsWith("/uploads")
    ) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

// Backfills messages sent outside the app (VoIP.ms portal, or a missed
// webhook) - every 5 minutes is frequent enough to feel "live" without
// hammering VoIP.ms's API once per DID on every tick.
startReconciliationPoll(5 * 60 * 1000);

app.listen({ port: config.PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
