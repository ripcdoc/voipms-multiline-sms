import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { requireAuth } from "../auth/index.js";
import { db } from "../db/index.js";
import {
  addPushSubscription,
  deleteMessage,
  disableDidsNotIn,
  findDidByNumber,
  getMessage,
  getOrCreateThread,
  insertMessage,
  listDids,
  listMessages,
  listThreads,
  markThreadRead,
  removePushSubscription,
  setThreadDisplayName,
  upsertDid,
  type Did,
} from "../db/queries.js";
import { isPushConfigured } from "../push/index.js";
import { deleteMms, deleteSms, getDidsInfo, sendMms, sendSms, VoipMsError } from "../voipms/client.js";
import { broadcast } from "../ws/index.js";

const sendMessageSchema = z
  .object({
    threadId: z.number().int().positive(),
    body: z.string().max(1600).default(""),
    mediaUrls: z.array(z.string().url()).max(3).optional(),
  })
  .refine((data) => data.body.trim().length > 0 || (data.mediaUrls?.length ?? 0) > 0, {
    message: "Message body or media URL is required",
  });

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/dids", async () => {
    return listDids();
  });

  // Pull the current DID list from VoIP.ms and upsert into the local table.
  app.post("/api/dids/sync", async () => {
    const { dids } = await getDidsInfo();
    for (const d of dids) {
      // routing looks like "account:123456_subaccount" — the part after
      // the underscore identifies which sub-account owns this DID.
      const subAccount = d.routing.match(/^account:\d+_(.+)$/)?.[1];
      // "note" is user-editable in the VoIP.ms portal; "description" isn't
      // (VoIP.ms assigns it, e.g. a rate-center code), so prefer note for
      // the label and only fall back to description/did if note is unset.
      upsertDid({
        did: d.did,
        label: d.note || d.description || d.did,
        voipmsAccount: subAccount ?? config.VOIPMS_API_USERNAME,
        enabled: d.sms_available === 1,
      });
    }
    // A DID VoIP.ms no longer lists (ported away, removed from the account)
    // won't come back through the loop above - disable it explicitly so the
    // reconciliation poll stops querying it every cycle.
    disableDidsNotIn(dids.map((d) => d.did));
    return listDids();
  });

  app.get("/api/threads", async () => {
    return listThreads();
  });

  app.get<{ Params: { id: string } }>("/api/threads/:id/messages", async (req, reply) => {
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) {
      return reply.code(400).send({ error: "Invalid thread id" });
    }
    const messages = listMessages(threadId);
    markThreadRead(threadId);
    return messages;
  });

  app.post("/api/messages/send", async (req, reply) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { threadId, body, mediaUrls } = parsed.data;

    const thread = db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as unknown as
      | { id: number; did_id: number; contact_number: string }
      | undefined;
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }
    const did = db.prepare("SELECT * FROM dids WHERE id = ?").get(thread.did_id) as unknown as Did | undefined;
    if (!did) {
      return reply.code(404).send({ error: "DID not found" });
    }

    let voipmsMessageId: string | null = null;
    let status: "sent" | "failed" = "sent";
    let errorDetail: string | null = null;
    try {
      if (mediaUrls && mediaUrls.length > 0) {
        const result = await sendMms({ did: did.did, dst: thread.contact_number, message: body, mediaUrls });
        voipmsMessageId = result.mms;
      } else {
        const result = await sendSms({ did: did.did, dst: thread.contact_number, message: body });
        voipmsMessageId = result.sms;
      }
    } catch (err) {
      req.log.error(err, "Failed to send via VoIP.ms");
      status = "failed";
      // VoipMsError.status is VoIP.ms's own error code (e.g. "invalid_dst",
      // "insufficient_funds") - surface that instead of a generic message so
      // a failed send is self-explanatory in the UI rather than a dead end.
      errorDetail = err instanceof VoipMsError ? `${err.status}: ${err.message}` : "Network error contacting VoIP.ms";
    }

    const message = insertMessage({
      threadId,
      direction: "outbound",
      body: body || null,
      mediaUrls: mediaUrls ?? null,
      status,
      voipmsMessageId,
      errorDetail,
    });

    broadcast("message:new", { threadId, message });
    return message;
  });

  const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

  // Picking a file locally can't hand VoIP.ms's sendMMS a fetchable URL by
  // itself (it only takes raw bytes) - this stores the file and returns a
  // public URL under this same origin for sendMMS to use, same as if the
  // user had pasted a link to an already-hosted image.
  app.post(
    "/api/uploads",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const file = await req.file();
      if (!file) {
        return reply.code(400).send({ error: "No file provided" });
      }
      if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) {
        return reply.code(400).send({ error: "Unsupported file type" });
      }

      const filename = `${randomUUID()}${extname(file.filename) || ""}`;
      const uploadsDir = resolve(config.UPLOADS_DIR);
      const destPath = join(uploadsDir, filename);

      try {
        await pipeline(file.file, createWriteStream(destPath));
      } catch (err) {
        req.log.error(err, "Failed to save upload");
        return reply.code(500).send({ error: "Failed to save upload" });
      }
      // @fastify/multipart aborts the stream (rather than erroring the promise)
      // when a file exceeds the configured size limit - check for that after
      // the fact and clean up the partial write.
      if (file.file.truncated) {
        return reply.code(413).send({ error: "File too large" });
      }

      const url = `${req.protocol}://${req.hostname}/uploads/${filename}`;
      return { url };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/messages/:id", async (req, reply) => {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId)) {
      return reply.code(400).send({ error: "Invalid message id" });
    }
    const message = getMessage(messageId);
    if (!message) {
      return reply.code(404).send({ error: "Message not found" });
    }

    // Without a captured voipms_message_id (messages sent before that field
    // existed, or where the send call itself failed) there's nothing to
    // delete on VoIP.ms's side — only the local copy goes away.
    let voipmsDeleted = false;
    if (message.voipms_message_id) {
      try {
        if (message.media_urls) {
          await deleteMms(message.voipms_message_id);
        } else {
          await deleteSms(message.voipms_message_id);
        }
        voipmsDeleted = true;
      } catch (err) {
        req.log.error(err, "Failed to delete message via VoIP.ms");
      }
    }

    deleteMessage(messageId);
    broadcast("message:deleted", { threadId: message.thread_id, messageId });
    return { ok: true, voipmsDeleted };
  });

  // Manually start a thread with a new contact on a given DID.
  const startThreadSchema = z.object({
    did: z.string().min(1),
    contactNumber: z.string().min(1),
  });

  app.post("/api/threads", async (req, reply) => {
    const parsed = startThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const did = findDidByNumber(parsed.data.did);
    if (!did) {
      return reply.code(404).send({ error: "Unknown DID" });
    }
    const thread = getOrCreateThread(did.id, parsed.data.contactNumber);
    return thread;
  });

  // Local-only contact naming — VoIP.ms's SMS webhook doesn't include a
  // caller name (no CNAM equivalent for SMS), so this is manual.
  const setDisplayNameSchema = z.object({
    displayName: z.string().max(100).nullable(),
  });

  app.patch<{ Params: { id: string } }>("/api/threads/:id", async (req, reply) => {
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) {
      return reply.code(400).send({ error: "Invalid thread id" });
    }
    const parsed = setDisplayNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const displayName = parsed.data.displayName?.trim() || null;
    const thread = setThreadDisplayName(threadId, displayName);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }
    return thread;
  });

  app.get("/api/push/vapid-public-key", async () => {
    return { key: isPushConfigured() ? config.VAPID_PUBLIC_KEY : null };
  });

  const pushSubscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  });

  app.post("/api/push/subscribe", async (req, reply) => {
    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    addPushSubscription({
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    return { ok: true };
  });

  const unsubscribeSchema = z.object({ endpoint: z.string().url() });

  app.post("/api/push/unsubscribe", async (req, reply) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    removePushSubscription(parsed.data.endpoint);
    return { ok: true };
  });
}
