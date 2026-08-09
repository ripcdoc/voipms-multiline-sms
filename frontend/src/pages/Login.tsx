import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect password");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many failed attempts. Try again in a few minutes.");
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-dots-navy relative flex h-full items-center justify-center overflow-hidden bg-navy-900">
      {/* Decorative gold ring behind the logo, echoing a clock/dial face. */}
      <div
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full"
        style={{
          top: "calc(50% - 210px - 60px)",
          left: "calc(50% - 210px)",
          background:
            "repeating-conic-gradient(from 0deg, rgba(193,152,72,0.28) 0deg 1deg, transparent 1deg 7.5deg)",
          WebkitMaskImage: "radial-gradient(circle, black 42%, transparent 70%)",
          maskImage: "radial-gradient(circle, black 42%, transparent 70%)",
        }}
      />

      <form onSubmit={onSubmit} className="relative flex w-[380px] flex-col items-center gap-4.5">
        <img
          src="/dispatch-coin.png"
          alt="Multiline"
          className="h-[118px] w-[118px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        />
        <div className="text-center">
          <div className="font-display text-2xl font-extrabold tracking-tight text-white">Multiline</div>
          <div className="mt-2.5 font-mono text-xs tracking-wide text-navy-300">ONE INBOX · EVERY LINE</div>
        </div>

        <div className="flex w-full flex-col gap-3.5 rounded-lg border border-gold-500/20 bg-navy-800 p-7 shadow-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border border-navy-600 bg-navy-900 px-3.5 py-3 text-sm text-white outline-none"
          />
          {error && <p className="m-0 text-[13px] text-[#e08a7a]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold-500 py-3 text-sm font-bold text-navy-900 shadow-gold disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <div className="font-mono text-[10px] tracking-wide text-navy-500">v{__APP_VERSION__}</div>
      </form>
    </div>
  );
}
