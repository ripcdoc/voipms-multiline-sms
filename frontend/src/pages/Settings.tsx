import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { didTag } from "../lib/didTag";
import { getCurrentSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../lib/push";

type PushStatus = "loading" | "unsupported" | "off" | "on";

function NotificationsSection() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    getCurrentSubscription().then((sub) => setStatus(sub ? "on" : "off"));
  }, []);

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      if (status === "on") {
        await unsubscribeFromPush();
        setStatus("off");
      } else {
        await subscribeToPush();
        setStatus("on");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6.5">
      <div className="eyebrow mb-2.5">Notifications</div>
      {status === "unsupported" && (
        <p className="text-sm text-fg-4">Push notifications aren't supported in this browser.</p>
      )}
      {(status === "on" || status === "off") && (
        <div className="flex items-center justify-between rounded-md border border-hairline-1 bg-white px-4 py-3.5 shadow-1">
          <span className="text-[13px] text-fg-1">Push notifications for new dispatches</span>
          <button
            onClick={handleToggle}
            disabled={busy}
            className="relative h-6 w-[42px] shrink-0 rounded-full disabled:opacity-50"
            style={{ background: status === "on" ? "var(--color-gold-500)" : "var(--color-steel-300)" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-200"
              style={{ left: status === "on" ? "20px" : "2px" }}
            />
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

export function Settings() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: dids } = useQuery({ queryKey: ["dids"], queryFn: api.listDids });
  const sync = useMutation({
    mutationFn: api.syncDids,
    onSuccess: (data) => queryClient.setQueryData(["dids"], data),
  });

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/dispatch-coin.png" alt="" className="h-[26px] w-[26px]" />
          <span className="font-display text-[17px] font-extrabold text-fg-1">Settings</span>
        </div>
        <NavLink to="/" className="text-[12.5px] text-fg-4">
          ← Back
        </NavLink>
      </div>

      <NotificationsSection />

      <section className="mb-6.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="eyebrow">Lines (DIDs)</div>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 rounded-full border border-hairline-1 bg-white px-3 py-1.5 text-[11px] font-semibold text-gold-600 disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {sync.isPending ? "Syncing…" : "Sync lines"}
          </button>
        </div>
        {sync.isError && <p className="mb-2 text-xs text-red-600">{(sync.error as Error).message}</p>}
        <div className="flex flex-col gap-2">
          {dids?.map((d) => {
            const tag = didTag(d);
            return (
              <div
                key={d.id}
                className="flex items-center gap-2.5 rounded-md border border-hairline-1 bg-white px-4 py-3 shadow-1"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag.fg }} />
                <span className="flex-1 text-[13px] font-semibold text-fg-1">{d.label}</span>
                <span className="font-mono text-xs text-fg-4">{d.did}</span>
              </div>
            );
          })}
          {dids?.length === 0 && (
            <p className="text-sm text-fg-4">No lines configured yet — click "Sync lines" to import them.</p>
          )}
        </div>
      </section>

      <button
        onClick={() => logout()}
        className="rounded-md border border-hairline-1 bg-white px-4.5 py-2.5 text-[13px] text-fg-3"
      >
        Sign out
      </button>
    </div>
  );
}
