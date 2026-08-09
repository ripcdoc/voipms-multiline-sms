const BASE = "/api";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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
  did: string;
  label: string;
  contact_number: string;
  display_name: string | null;
  last_message: string | null;
  created_at: string;
  updated_at: string;
  unread: number;
}

export interface Message {
  id: number;
  thread_id: number;
  direction: "inbound" | "outbound";
  body: string | null;
  media_urls: string | null;
  status: string;
  voipms_message_id: string | null;
  created_at: string;
}

export const api = {
  login: (password: string) => request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ authenticated: boolean }>("/auth/me"),
  listDids: () => request<Did[]>("/dids"),
  syncDids: () => request<Did[]>("/dids/sync", { method: "POST" }),
  listThreads: () => request<Thread[]>("/threads"),
  listMessages: (threadId: number) => request<Message[]>(`/threads/${threadId}/messages`),
  createThread: (did: string, contactNumber: string) =>
    request<Thread>("/threads", { method: "POST", body: JSON.stringify({ did, contactNumber }) }),
  setThreadDisplayName: (threadId: number, displayName: string | null) =>
    request<Thread>(`/threads/${threadId}`, { method: "PATCH", body: JSON.stringify({ displayName }) }),
  sendMessage: (threadId: number, body: string, mediaUrls?: string[]) =>
    request<Message>("/messages/send", { method: "POST", body: JSON.stringify({ threadId, body, mediaUrls }) }),
  deleteMessage: (messageId: number) =>
    request<{ ok: true; voipmsDeleted: boolean }>(`/messages/${messageId}`, { method: "DELETE" }),
  uploadMedia: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    // Not routed through request() - it sets Content-Type: application/json
    // unconditionally when a body is present, which would break the
    // multipart boundary the browser needs to set itself for FormData.
    const res = await fetch(`${BASE}/uploads`, { method: "POST", credentials: "include", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error ?? `Upload failed: ${res.status}`);
    }
    return res.json();
  },
  getVapidPublicKey: () => request<{ key: string | null }>("/push/vapid-public-key"),
  subscribePush: (subscription: PushSubscriptionJSON) =>
    request<{ ok: true }>("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: true }>("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
};

export { ApiError };
