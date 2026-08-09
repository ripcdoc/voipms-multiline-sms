import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ComposeBox } from "../components/ComposeBox";
import { api, type Message, type Thread as ThreadT } from "../lib/api";
import { didTag } from "../lib/didTag";

// created_at is stored as SQLite's datetime('now'), which is UTC but has no
// timezone marker — append "Z" so the browser parses it as UTC instead of
// (incorrectly) assuming local time, then render in the viewer's timezone.
function formatMessageTime(createdAt: string): string {
  const date = new Date(`${createdAt.replace(" ", "T")}Z`);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(createdAt: string): string {
  const date = new Date(`${createdAt.replace(" ", "T")}Z`);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "YESTERDAY";
  return date.toLocaleDateString([], { weekday: "long" }).toUpperCase();
}

type Row = { kind: "divider"; key: string; label: string } | { kind: "message"; key: string; message: Message };

function withDayDividers(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let lastLabel: string | null = null;
  for (const m of messages) {
    const label = dayLabel(m.created_at);
    if (label !== lastLabel) {
      rows.push({ kind: "divider", key: `div-${m.id}`, label });
      lastLabel = label;
    }
    rows.push({ kind: "message", key: String(m.id), message: m });
  }
  return rows;
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-2.5 flex items-center gap-2.5">
      <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(193,152,72,0.4)_0px,rgba(193,152,72,0.4)_4px,transparent_4px,transparent_7px)]" />
      <span className="eyebrow text-[10px]">{label}</span>
      <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,rgba(193,152,72,0.4)_0px,rgba(193,152,72,0.4)_4px,transparent_4px,transparent_7px)]" />
    </div>
  );
}

function MessageStatus({ message, threadId }: { message: Message; threadId: number }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () =>
      api.sendMessage(threadId, message.body ?? "", message.media_urls ? JSON.parse(message.media_urls) : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  if (message.status === "failed") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-red-600">
        <span>{formatMessageTime(message.created_at)}</span>
        <span>·</span>
        <span>Failed to send</span>
        <button onClick={() => retry.mutate()} disabled={retry.isPending} className="underline">
          {retry.isPending ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  if (message.status === "sending") {
    return <div className="font-mono text-[10.5px] text-fg-4">Sending…</div>;
  }
  return (
    <div className="font-mono text-[10.5px] text-fg-4">
      {formatMessageTime(message.created_at)} · Sent
    </div>
  );
}

function DeleteMessageButton({ message, threadId }: { message: Message; threadId: number }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const del = useMutation({
    mutationFn: () => api.deleteMessage(message.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  // Negative ids are optimistic "sending" placeholders (see ComposeBox) that
  // don't exist server-side yet - nothing to delete until they're replaced
  // by the real message.
  if (message.id < 0) return null;

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px]">
        <button
          onClick={() => del.mutate()}
          disabled={del.isPending}
          className="text-red-600 underline"
        >
          {del.isPending ? "Deleting…" : "Confirm delete"}
        </button>
        <span className="text-fg-4">·</span>
        <button onClick={() => setConfirming(false)} className="text-fg-4 underline">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete message"
      className="opacity-0 transition-opacity group-hover:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-4 hover:text-red-600">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

// VoIP.ms's SMS webhook has no caller-name field (no SMS equivalent of
// CNAM), so contact names are manual/local only.
function ThreadHeader({ thread }: { thread: ThreadT }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(thread.display_name ?? "");
  const tag = didTag(thread);

  const rename = useMutation({
    mutationFn: (displayName: string | null) => api.setThreadDisplayName(thread.id, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setEditing(false);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    rename.mutate(name.trim() || null);
  }

  if (editing) {
    return (
      <form onSubmit={onSubmit} className="flex flex-1 items-center gap-2 text-sm">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={thread.contact_number}
          className="rounded border border-hairline-2 bg-white px-2.5 py-1.5 text-fg-1 outline-none"
        />
        <button type="submit" disabled={rename.isPending} className="text-xs font-semibold text-gold-600">
          {rename.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-fg-4">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2.5">
      <span className="text-[15px] font-bold text-fg-1">{thread.display_name || thread.contact_number}</span>
      {thread.display_name && <span className="font-mono text-xs text-fg-4">{thread.contact_number}</span>}
      <span
        className="rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wide"
        style={{ background: tag.bg, color: tag.fg, borderColor: tag.border }}
      >
        {tag.code}
      </span>
      <button
        onClick={() => {
          setName(thread.display_name ?? "");
          setEditing(true);
        }}
        className="text-[11.5px] text-fg-4 underline"
      >
        Edit
      </button>
    </div>
  );
}

export function Thread() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);

  const { data: messages } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => api.listMessages(threadId),
    enabled: Number.isInteger(threadId),
  });
  const { data: threads } = useQuery({ queryKey: ["threads"], queryFn: api.listThreads });
  const thread = threads?.find((t) => t.id === threadId);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Runs before paint (unlike useEffect) so the thread never visibly opens
  // at the top before jumping to the bottom - and re-runs on every new
  // message (send, receive, or reconciliation backfill), not just on open.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-hairline-1 px-5 py-4">
        <NavLink to="/" className="shrink-0 text-fg-4 md:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </NavLink>
        {thread && <ThreadHeader thread={thread} />}
        <span className="font-mono text-[10px] tracking-wide text-fg-4">CH. {threadId}</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-5">
        {messages &&
          withDayDividers(messages).map((row) =>
            row.kind === "divider" ? (
              <DayDivider key={row.key} label={row.label} />
            ) : (
              <div
                key={row.key}
                className={`group flex flex-col ${row.message.direction === "outbound" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[66%] rounded-[10px] px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-1 ${
                    row.message.direction === "outbound"
                      ? row.message.status === "failed"
                        ? "bubble-notch-out bg-red-100 text-red-600"
                        : row.message.status === "sending"
                          ? "bubble-notch-out bg-gold-500/60 text-navy-900"
                          : "bubble-notch-out bg-gold-500 text-navy-900"
                      : "bubble-notch-in bg-white text-fg-1"
                  }`}
                >
                  {row.message.body}
                  {row.message.media_urls &&
                    (JSON.parse(row.message.media_urls) as string[]).map((url) => (
                      <img key={url} src={url} alt="MMS attachment" className="mt-2 block max-w-full rounded-[6px]" />
                    ))}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {row.message.direction === "outbound" ? (
                    <>
                      <DeleteMessageButton message={row.message} threadId={threadId} />
                      <MessageStatus message={row.message} threadId={threadId} />
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-[10.5px] text-fg-4">{formatMessageTime(row.message.created_at)}</div>
                      <DeleteMessageButton message={row.message} threadId={threadId} />
                    </>
                  )}
                </div>
              </div>
            )
          )}
      </div>
      <ComposeBox threadId={threadId} />
    </div>
  );
}
