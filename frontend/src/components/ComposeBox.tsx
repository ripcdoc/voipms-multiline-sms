import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { api, type Message } from "../lib/api";
import { computeSmsSegments } from "../lib/sms";

let nextTempId = -1;

export function ComposeBox({ threadId }: { threadId: number }) {
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadMedia(file),
    onSuccess: (result, file) => setAttachment({ url: result.url, name: file.name }),
    onError: (err) => setUploadError((err as Error).message),
  });

  const send = useMutation({
    mutationFn: (params: { text: string; mediaUrls?: string[] }) =>
      api.sendMessage(threadId, params.text, params.mediaUrls),
    onMutate: (params) => {
      const tempMessage: Message = {
        id: nextTempId--,
        thread_id: threadId,
        direction: "outbound",
        body: params.text || null,
        media_urls: params.mediaUrls ? JSON.stringify(params.mediaUrls) : null,
        status: "sending",
        voipms_message_id: null,
        error_detail: null,
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      };
      queryClient.setQueryData<Message[]>(["messages", threadId], (old) => [...(old ?? []), tempMessage]);
    },
    onSuccess: () => {
      setBody("");
      setAttachment(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again after removing it
    if (!file) return;
    setUploadError(null);
    upload.mutate(file);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedBody = body.trim();
    if ((!trimmedBody && !attachment) || send.isPending || upload.isPending) return;
    send.mutate({ text: trimmedBody, mediaUrls: attachment ? [attachment.url] : undefined });
  }

  const segments = computeSmsSegments(body);
  const showSegmentCounter = body.length > 0 && !attachment;

  return (
    <div className="border-t border-hairline-1 px-5 py-3.5">
      {send.isError && <p className="mb-2 text-xs text-red-600">{(send.error as Error).message}</p>}
      {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={onFileSelected}
        className="hidden"
      />
      {upload.isPending && <p className="mb-2 text-xs text-fg-4">Uploading…</p>}
      {attachment && (
        <div className="mb-2.5 flex items-center gap-2">
          <img src={attachment.url} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="flex-1 truncate text-xs text-fg-3">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} className="text-[11.5px] text-fg-4">
            Remove
          </button>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          title="Attach an image"
          className={`flex shrink-0 items-center p-1.5 disabled:opacity-50 ${attachment ? "text-gold-600" : "text-fg-4"}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <div className="flex-1">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Wire your message…"
            className="w-full rounded-full border border-hairline-2 bg-white px-4 py-2.5 text-[13.5px] text-fg-1 outline-none"
          />
          {showSegmentCounter && (
            <div className="mt-1 px-1 font-mono text-[10px] text-fg-4">
              {segments.length}/{segments.perSegmentLimit} · {segments.segments} segment{segments.segments === 1 ? "" : "s"}
              {segments.encoding === "Unicode" && " · Unicode"}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={send.isPending || upload.isPending || (!body.trim() && !attachment)}
          className="flex items-center gap-1.5 rounded-full bg-gold-500 px-4.5 py-2.5 text-[13px] font-bold text-navy-900 disabled:opacity-50"
        >
          Send
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
