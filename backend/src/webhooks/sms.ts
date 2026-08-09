import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { countUnreadThreads, findDidByNumber, findMessageByVoipmsId, getOrCreateThread, insertMessage } from "../db/queries.js";
import { sendAmiMessage } from "../pbx/ami.js";
import { sendPushToAll } from "../push/index.js";
import { normalizePhoneNumber } from "../voipms/client.js";
import { broadcast } from "../ws/index.js";

// Real shape confirmed from live production logs — nested event payload,
// differs substantially from VoIP.ms's documented flat SMS URL Callback
// format (id/did/contact/message/media1..5). The shared secret is a query
// param on the callback URL, NOT a field in the JSON body — the body is
// exactly { data: { payload: {...} } }, nothing else. An earlier version
// of this schema wrongly required a top-level "secret" body field (based
// on a manually-relayed payload description that turned out not to match
// the real raw request), which caused every real delivery to fail
// validation and get silently dropped — confirmed via the server's Fastify
// request logs showing "Rejected inbound SMS webhook payload" on every
// inbound message. If your callback URL is being hit but nothing shows up,
// check your own logs for that same rejection message first.
const inboundSchema = z.object({
  data: z.object({
    payload: z.object({
      id: z.union([z.string(), z.number()]).optional(),
      from: z.object({ phone_number: z.string() }),
      to: z.array(z.object({ phone_number: z.string() })).min(1),
      text: z.string().optional().default(""),
      media: z.array(z.string()).optional().default([]),
    }),
  }),
});

export async function registerSmsWebhook(app: FastifyInstance): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/webhooks/voipms/sms",
    handler: async (req, reply) => {
      const query = req.query as Record<string, string>;
      if (query.secret !== config.VOIPMS_WEBHOOK_SECRET) {
        return reply.code(401).send({ error: "Invalid webhook secret" });
      }

      const parsed = inboundSchema.safeParse(req.body);
      if (!parsed.success) {
        req.log.warn({ body: req.body }, "Rejected inbound SMS webhook payload");
        return reply.code(400).send({ error: "Invalid payload" });
      }
      const { data } = parsed.data;

      const didNumber = normalizePhoneNumber(data.payload.to[0].phone_number);
      const contactNumber = normalizePhoneNumber(data.payload.from.phone_number);

      const did = findDidByNumber(didNumber);
      if (!did) {
        req.log.warn({ did: didNumber }, "Inbound SMS for unknown DID");
        return reply.code(200).send({ ok: true }); // ack so VoIP.ms doesn't retry
      }

      // VoIP.ms retries webhook delivery on a non-2xx/timeout, and the same
      // message could also show up via the reconciliation poll - dedupe on
      // its message id so a retry or overlapping poll never double-inserts.
      const voipmsMessageId = data.payload.id != null ? String(data.payload.id) : null;
      if (voipmsMessageId && findMessageByVoipmsId(voipmsMessageId)) {
        return reply.code(200).send({ ok: true });
      }

      const thread = getOrCreateThread(did.id, contactNumber);
      const message = insertMessage({
        threadId: thread.id,
        direction: "inbound",
        body: data.payload.text || null,
        mediaUrls: data.payload.media.length > 0 ? data.payload.media : null,
        status: "received",
        voipmsMessageId,
      });

      broadcast("message:new", { threadId: thread.id, message });

      // Fire-and-forget: don't hold up the webhook ack on push delivery.
      sendPushToAll({
        title: thread.display_name || contactNumber,
        body: message.body || (message.media_urls ? "📎 New attachment" : "New message"),
        url: `/thread/${thread.id}`,
        unreadCount: countUnreadThreads(),
      }).catch((err) => req.log.error(err, "Failed to send push notifications"));

      // Fire-and-forget, same as push above. One-way notify only, and only
      // for the single DID/extension pair configured (see config.ts).
      if (config.AMI_NOTIFY_DID === didNumber) {
        sendAmiMessage(`${thread.display_name || contactNumber}: ${message.body || "[MMS attachment]"}`).catch((err) =>
          req.log.error(err, "Failed to send AMI desk-phone notification")
        );
      }

      return { ok: true };
    },
  });
}
