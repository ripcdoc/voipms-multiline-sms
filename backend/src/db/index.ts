import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

mkdirSync(dirname(config.DB_PATH), { recursive: true });

// Uses Node's built-in node:sqlite (stable API surface, still flagged
// "experimental" in Node 24 docs) instead of better-sqlite3 — avoids
// requiring a native build toolchain (Python + VS Build Tools) just to
// install dependencies on a fresh machine.
export const db = new DatabaseSync(config.DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS dids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    did TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    voipms_account TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    did_id INTEGER NOT NULL REFERENCES dids(id) ON DELETE CASCADE,
    contact_number TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_read_at TEXT,
    UNIQUE (did_id, contact_number)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    body TEXT,
    media_urls TEXT,
    status TEXT NOT NULL DEFAULT 'received',
    voipms_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_threads_did ON threads(did_id);
  -- Partial (NULLs excluded) so outbound messages that never got a VoIP.ms
  -- id (e.g. a failed send) don't collide with each other. Backstops the
  -- check-then-insert dedupe in the webhook and reconciliation poll.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_voipms_id ON messages(voipms_message_id) WHERE voipms_message_id IS NOT NULL;
`);

// last_read_at and display_name were added after the initial schema —
// CREATE TABLE IF NOT EXISTS above won't retrofit them onto a database
// that already exists.
const threadColumns = db.prepare("PRAGMA table_info(threads)").all() as unknown as { name: string }[];
for (const column of ["last_read_at", "display_name"]) {
  if (!threadColumns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE threads ADD COLUMN ${column} TEXT`);
  }
}
