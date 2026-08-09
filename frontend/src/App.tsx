import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ThreadList } from "./components/ThreadList";
import { useAuth } from "./context/AuthContext";
import { api } from "./lib/api";
import { setAppBadgeCount } from "./lib/badge";
import { connectWs } from "./lib/ws";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Thread } from "./pages/Thread";

// Single WS connection for the whole authenticated app — keeps the thread
// list (and whichever thread is open) live without one socket per page.
function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return connectWs((evt) => {
      if (evt.event !== "message:new" && evt.event !== "message:deleted") return;
      const { threadId } = evt.payload as { threadId: number };
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
    });
  }, [queryClient]);
}

// Keeps the app/PWA icon badge in sync with unread threads while the app is
// open — the service worker's push handler covers the closed/backgrounded
// case using the unread count VoIP.ms webhook already computes server-side.
function useUnreadBadge() {
  const { data: threads } = useQuery({ queryKey: ["threads"], queryFn: api.listThreads });

  useEffect(() => {
    if (!threads) return;
    setAppBadgeCount(threads.filter((t) => t.unread).length);
  }, [threads]);

  // A push notification can set the badge from a server-computed count while
  // this tab is backgrounded; resync from live query data once it's focused
  // again so the badge never drifts from what's actually on screen.
  useEffect(() => {
    function onFocus() {
      if (threads) setAppBadgeCount(threads.filter((t) => t.unread).length);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [threads]);
}

function Shell() {
  useLiveUpdates();
  useUnreadBadge();
  const location = useLocation();
  // On mobile show one pane at a time: the list at "/", the detail pane
  // (thread or settings) once a route is picked. md+ always shows both.
  const showDetail = location.pathname !== "/";

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[340px_1fr]">
      <div className={`${showDetail ? "hidden" : "flex"} h-full min-h-0 bg-navy-950 md:flex`}>
        <ThreadList />
      </div>
      <div className={`${showDetail ? "flex" : "hidden"} h-full min-h-0 flex-col bg-bone-50 md:flex`}>
        <Outlet />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 text-navy-500/70">
      <img src="/dispatch-coin.png" alt="" className="h-14 w-14 opacity-40" />
      <p className="m-0 text-[13.5px]">Select a dispatch to open the wire</p>
    </div>
  );
}

export default function App() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-navy-900 text-navy-300">Loading…</div>;
  }

  if (!authenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<EmptyState />} />
        <Route path="thread/:id" element={<Thread />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
