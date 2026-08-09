export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-navy-950/55"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80%] w-[420px] overflow-y-auto rounded-lg border border-gold-500/20 bg-navy-800 p-6 shadow-4"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="eyebrow eyebrow--on-dark">Help</span>
          <button onClick={onClose} className="text-lg leading-none text-navy-300 hover:text-white">
            ×
          </button>
        </div>
        <p className="mb-4 text-xs text-navy-300">Plain-English notes on how Dispatch works.</p>

        <div className="mb-4">
          <div className="mb-1 text-sm font-bold text-white">Threads &amp; search</div>
          <p className="text-[12.5px] leading-relaxed text-navy-300">
            Each conversation is a thread, sorted by most recent wire. Use the search bar to find a
            thread by name or contact number. A gold dot means unread.
          </p>
        </div>
        <div className="mb-4">
          <div className="mb-1 text-sm font-bold text-white">Lines (DIDs)</div>
          <p className="text-[12.5px] leading-relaxed text-navy-300">
            The colored tag on each thread shows which of your phone lines it's on. Re-sync your
            lines from Settings if you add or rename one in VoIP.ms.
          </p>
        </div>
        <div className="mb-4">
          <div className="mb-1 text-sm font-bold text-white">Compose &amp; attachments</div>
          <p className="text-[12.5px] leading-relaxed text-navy-300">
            Type a message and hit Send. Use the paperclip to pick an image from your device to send
            as an MMS. A message under way shows "Sending…"; a failed one shows a Retry link. The
            counter under the input shows how many SMS segments your message will use.
          </p>
        </div>
        <div>
          <div className="mb-1 text-sm font-bold text-white">Settings</div>
          <p className="text-[12.5px] leading-relaxed text-navy-300">
            Turn push notifications on or off, review your lines, or sign out. The Sync lines button
            pulls the latest numbers from your account.
          </p>
        </div>
      </div>
      <div className="mt-5 text-center font-mono text-[10px] tracking-wide text-navy-500">v{__APP_VERSION__}</div>
    </div>
  );
}
