import { db } from "./index.js";

export interface Did {
  id: number;
  did: string;
  label: string;
  voipms_account: string;
  enabled: number;
  created_at: string;
}

export interface Thread {
  id: number;
  did_id: number;
  contact_number: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
}

export interface Message {
  id: number;
  thread_id: number;
  direction: "inbound" | "outbound";
  body: string | null;
  media_urls: string | null;
  status: string;
  voipms_message_id: string | null;
  error_detail: string | null;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export function listDids(): Did[] {
  return db.prepare("SELECT * FROM dids WHERE enabled = 1 ORDER BY label").all() as unknown as Did[];
}

export function findDidByNumber(did: string): Did | undefined {
  return db.prepare("SELECT * FROM dids WHERE did = ?").get(did) as unknown as Did | undefined;
}

export function upsertDid(params: {
  did: string;
  label: string;
  voipmsAccount: string;
  enabled: boolean;
}): Did {
  db.prepare(
    `INSERT INTO dids (did, label, voipms_account, enabled)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(did) DO UPDATE SET
       label = excluded.label,
       voipms_account = excluded.voipms_account,
       enabled = excluded.enabled`
  ).run(params.did, params.label, params.voipmsAccount, params.enabled ? 1 : 0);
  return db.prepare("SELECT * FROM dids WHERE did = ?").get(params.did) as unknown as Did;
}

// A DID ported away or removed from the VoIP.ms account still sits in this
// table (enabled=1) forever unless explicitly disabled - left enabled, the
// reconciliation poll keeps querying it every cycle and VoIP.ms just errors
// (invalid_did) instead of ever coming back healthy on its own.
export function disableDidsNotIn(currentDids: string[]): void {
  if (currentDids.length === 0) {
    db.prepare("UPDATE dids SET enabled = 0").run();
    return;
  }
  const placeholders = currentDids.map(() => "?").join(", ");
  db.prepare(`UPDATE dids SET enabled = 0 WHERE did NOT IN (${placeholders})`).run(...currentDids);
}

export function getOrCreateThread(didId: number, contactNumber: string): Thread {
  const existing = db
    .prepare("SELECT * FROM threads WHERE did_id = ? AND contact_number = ?")
    .get(didId, contactNumber) as unknown as Thread | undefined;
  if (existing) return existing;

  const result = db
    .prepare("INSERT INTO threads (did_id, contact_number) VALUES (?, ?)")
    .run(didId, contactNumber);
  return db.prepare("SELECT * FROM threads WHERE id = ?").get(result.lastInsertRowid) as unknown as Thread;
}

export function touchThread(threadId: number): void {
  db.prepare("UPDATE threads SET updated_at = datetime('now') WHERE id = ?").run(threadId);
}

export function markThreadRead(threadId: number): void {
  db.prepare("UPDATE threads SET last_read_at = datetime('now') WHERE id = ?").run(threadId);
}

export function setThreadDisplayName(threadId: number, displayName: string | null): Thread | undefined {
  db.prepare("UPDATE threads SET display_name = ? WHERE id = ?").run(displayName, threadId);
  return db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as unknown as Thread | undefined;
}

export function listThreads(): (Thread & {
  did: string;
  label: string;
  last_message: string | null;
  unread: number;
})[] {
  return db
    .prepare(
      `SELECT t.*, d.did, d.label,
        (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (CASE WHEN EXISTS (
          SELECT 1 FROM messages m2
          WHERE m2.thread_id = t.id
            AND m2.direction = 'inbound'
            AND m2.created_at > COALESCE(t.last_read_at, '')
        ) THEN 1 ELSE 0 END) AS unread
       FROM threads t
       JOIN dids d ON d.id = t.did_id
       ORDER BY t.updated_at DESC`
    )
    .all() as unknown as (Thread & { did: string; label: string; last_message: string | null; unread: number })[];
}

export function countUnreadThreads(): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM threads t
       WHERE EXISTS (
         SELECT 1 FROM messages m
         WHERE m.thread_id = t.id
           AND m.direction = 'inbound'
           AND m.created_at > COALESCE(t.last_read_at, '')
       )`
    )
    .get() as unknown as { count: number };
  return row.count;
}

export function listMessages(threadId: number): Message[] {
  return db
    .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
    .all(threadId) as unknown as Message[];
}

export function getMessage(id: number): Message | undefined {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as Message | undefined;
}

export function findMessageByVoipmsId(voipmsMessageId: string): Message | undefined {
  return db.prepare("SELECT * FROM messages WHERE voipms_message_id = ?").get(voipmsMessageId) as unknown as
    | Message
    | undefined;
}

export function deleteMessage(id: number): void {
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

export function updateMessageStatus(params: {
  id: number;
  status: string;
  voipmsMessageId: string | null;
}): Message {
  db.prepare("UPDATE messages SET status = ?, voipms_message_id = ? WHERE id = ?").run(
    params.status,
    params.voipmsMessageId,
    params.id
  );
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(params.id) as unknown as Message;
}

export function insertMessage(params: {
  threadId: number;
  direction: "inbound" | "outbound";
  body: string | null;
  mediaUrls: string[] | null;
  status: string;
  voipmsMessageId: string | null;
  errorDetail?: string | null;
}): Message {
  const result = db
    .prepare(
      `INSERT INTO messages (thread_id, direction, body, media_urls, status, voipms_message_id, error_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.threadId,
      params.direction,
      params.body,
      params.mediaUrls ? JSON.stringify(params.mediaUrls) : null,
      params.status,
      params.voipmsMessageId,
      params.errorDetail ?? null
    );
  touchThread(params.threadId);
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(result.lastInsertRowid) as unknown as Message;
}

export function addPushSubscription(params: { endpoint: string; p256dh: string; auth: string }): void {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(params.endpoint, params.p256dh, params.auth);
}

export function removePushSubscription(endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function listPushSubscriptions(): PushSubscriptionRow[] {
  return db.prepare("SELECT * FROM push_subscriptions").all() as unknown as PushSubscriptionRow[];
}
