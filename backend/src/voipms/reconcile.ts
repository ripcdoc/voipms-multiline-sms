import { findMessageByVoipmsId, getOrCreateThread, insertMessage, listDids } from "../db/queries.js";
import { broadcast } from "../ws/index.js";
import { getSms, normalizePhoneNumber } from "./client.js";

// Overlaps intentionally with the previous poll's window - findMessageByVoipmsId
// dedupes, so re-checking a day we've already seen is cheap insurance against
// a missed poll (process restart, transient VoIP.ms API error) losing a message.
const LOOKBACK_DAYS = 2;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Backfills messages the app never recorded on its own: ones sent from the
// VoIP.ms portal directly (no webhook fires for those - only inbound SMS
// triggers a callback) or a webhook delivery that was missed. MMS isn't
// covered - VoIP.ms's getMMS endpoint isn't wired up here, only getSMS.
export async function reconcileMessages(): Promise<void> {
  const dids = listDids();
  const to = formatDate(new Date());
  const from = formatDate(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));

  for (const did of dids) {
    let records;
    try {
      records = (await getSms({ did: did.did, from, to, limit: 500 })).sms;
    } catch (err) {
      console.error(`[reconcile] Failed to fetch SMS for DID ${did.did}:`, err);
      continue;
    }

    for (const record of records) {
      if (findMessageByVoipmsId(record.id)) continue;

      const contactNumber = normalizePhoneNumber(record.contact);
      const thread = getOrCreateThread(did.id, contactNumber);
      const message = insertMessage({
        threadId: thread.id,
        direction: record.type === "1" ? "inbound" : "outbound",
        body: record.message || null,
        mediaUrls: null,
        status: record.type === "1" ? "received" : "sent",
        voipmsMessageId: record.id,
      });

      broadcast("message:new", { threadId: thread.id, message });
    }
  }
}

export function startReconciliationPoll(intervalMs: number): NodeJS.Timeout {
  reconcileMessages().catch((err) => console.error("[reconcile] Initial poll failed:", err));
  return setInterval(() => {
    reconcileMessages().catch((err) => console.error("[reconcile] Poll failed:", err));
  }, intervalMs);
}
