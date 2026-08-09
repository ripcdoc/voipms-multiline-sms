import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { HelpDialog } from "./HelpDialog";
import { api } from "../lib/api";
import { didTag } from "../lib/didTag";
import { NewThreadDialog } from "./NewThreadDialog";

// updated_at is stored as SQLite's datetime('now') — UTC with no timezone
// marker — same "append Z before parsing" handling as Thread.tsx.
function formatThreadTime(updatedAt: string): string {
  const date = new Date(`${updatedAt.replace(" ", "T")}Z`);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ThreadList() {
  const { data: threads, isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: api.listThreads,
  });
  const [showNewThread, setShowNewThread] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.trim().toLowerCase();
  const visibleThreads = threads?.filter((t) => {
    if (!q) return true;
    const name = (t.display_name || t.contact_number).toLowerCase();
    return name.includes(q) || t.label.toLowerCase().includes(q) || t.contact_number.includes(q);
  });

  return (
    <nav className="flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-gold-500/[0.08]">
      <div className="flex flex-col gap-3 p-[18px] pb-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/dispatch-coin.png" alt="" className="h-[30px] w-[30px]" />
            <div className="font-display text-sm font-extrabold tracking-wide text-white">MULTILINE</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowNewThread(true)}
              title="New dispatch"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-navy-800 text-gold-400"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <NavLink
              to="/settings"
              title="Settings"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-navy-800 text-navy-300"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </NavLink>
            <button
              onClick={() => setShowHelp(true)}
              title="Help"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-navy-800 text-navy-300"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7" />
                <path d="M12 17.2h.01" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-navy-300)"
            strokeWidth="2"
            strokeLinecap="round"
            className="absolute left-2.5 top-2.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dispatches…"
            className="w-full rounded-full border border-navy-700 bg-navy-800 py-2 pl-8 pr-3 text-[12.5px] text-white outline-none"
          />
        </div>
      </div>

      <div className="h-px bg-[repeating-linear-gradient(90deg,rgba(193,152,72,0.35)_0px,rgba(193,152,72,0.35)_5px,transparent_5px,transparent_9px)]" />

      {showNewThread && <NewThreadDialog onClose={() => setShowNewThread(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-navy-300">Loading…</p>}
        {threads?.length === 0 && <p className="p-4 text-sm text-navy-300">No dispatches yet.</p>}
        {visibleThreads?.length === 0 && threads && threads.length > 0 && (
          <p className="p-6 text-center text-[12.5px] text-navy-300">No dispatches match "{searchQuery}".</p>
        )}
        {visibleThreads?.map((t) => {
          const tag = didTag(t);
          return (
            <NavLink
              key={t.id}
              to={`/thread/${t.id}`}
              className={({ isActive }) =>
                `block border-b border-gold-500/[0.08] px-4 py-2.5 ${isActive ? "bg-navy-800" : "hover:bg-navy-900"}`
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {t.unread === 1 && (
                    <span className="animate-pulse-gold h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" title="Unread" />
                  )}
                  <span className="truncate text-[13.5px] font-semibold text-white">
                    {t.display_name || t.contact_number}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-navy-300">{formatThreadTime(t.updated_at)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className={`m-0 max-w-[230px] truncate text-[12.5px] ${t.unread === 1 ? "text-[#e9ecf2]" : "text-navy-300"}`}>
                  {t.last_message ?? "…"}
                </p>
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wide"
                  style={{ background: tag.bg, color: tag.fg, borderColor: tag.border }}
                >
                  {tag.code}
                </span>
              </div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
