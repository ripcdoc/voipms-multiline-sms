import { config } from "../config.js";

const API_BASE = "https://voip.ms/api/v1/rest.php";

// VoIP.ms sends phone numbers as "+15551234567" on inbound webhooks and in
// getSMS records; DIDs and contact numbers elsewhere in this app (VoIP.ms's
// own getDIDsInfo, and numbers typed into the New Conversation dialog) are
// stored as bare 10-digit strings. Without normalizing, a webhook or
// reconciliation record would fail to match its DID/thread and land in a
// separate thread from the rest of that contact's messages.
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export class VoipMsError extends Error {
  constructor(public status: string, message: string) {
    super(message);
    this.name = "VoipMsError";
  }
}

async function call<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE);
  url.searchParams.set("api_username", config.VOIPMS_API_USERNAME);
  url.searchParams.set("api_password", config.VOIPMS_API_PASSWORD);
  url.searchParams.set("method", method);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new VoipMsError("http_error", `VoIP.ms API HTTP ${res.status}`);
  }

  const data = (await res.json()) as { status: string; [key: string]: unknown };
  if (data.status !== "success") {
    throw new VoipMsError(data.status, `VoIP.ms API error: ${data.status}`);
  }
  return data as T;
}

// https://voip.ms/m/apidocs.php#sendSMS
export async function sendSms(params: {
  did: string;
  dst: string;
  message: string;
}): Promise<{ sms: string }> {
  return call("sendSMS", {
    did: params.did,
    dst: params.dst,
    message: params.message,
  });
}

// https://voip.ms/m/apidocs.php#sendMMS
export async function sendMms(params: {
  did: string;
  dst: string;
  message: string;
  mediaUrls: string[];
}): Promise<{ mms: string }> {
  return call("sendMMS", {
    did: params.did,
    dst: params.dst,
    message: params.message,
    media1: params.mediaUrls[0] ?? "",
    media2: params.mediaUrls[1] ?? "",
    media3: params.mediaUrls[2] ?? "",
  });
}

// https://voip.ms/m/apidocs.php#deleteSMS
export async function deleteSms(id: string): Promise<void> {
  await call("deleteSMS", { id });
}

// https://voip.ms/m/apidocs.php#deleteMMS
export async function deleteMms(id: string): Promise<void> {
  await call("deleteMMS", { id });
}

// https://voip.ms/m/apidocs.php#getSMS — used for reconciliation / local dev
// polling until an inbound webhook is reachable.
//
// Like several of VoIP.ms's get* endpoints, a query that's valid but simply
// finds nothing comes back as status "no_sms" rather than "success" with an
// empty array - call() treats that as an error since it's the right default
// for the send/delete methods, so it's special-cased back to zero results
// here instead of propagating as a real failure.
export async function getSms(params: {
  did?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  limit?: number;
}): Promise<{ sms: VoipMsSmsRecord[] }> {
  try {
    return await call("getSMS", {
      ...(params.did ? { did: params.did } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      limit: String(params.limit ?? 100),
    });
  } catch (err) {
    if (err instanceof VoipMsError && err.status === "no_sms") {
      return { sms: [] };
    }
    throw err;
  }
}

export interface VoipMsSmsRecord {
  id: string;
  did: string;
  contact: string;
  message: string;
  type: string; // "1" = received, "0" = sent (per VoIP.ms docs)
  date: string;
}

// https://voip.ms/m/apidocs.php#getDIDsInfo — used to discover which DIDs
// are SMS/MMS-capable during setup.
export async function getDidsInfo(): Promise<{ dids: VoipMsDidRecord[] }> {
  return call("getDIDsInfo", {});
}

export interface VoipMsDidRecord {
  did: string;
  description: string;
  note: string; // user-editable in the VoIP.ms portal, unlike description — used as the label
  sms_available: number; // 1 | 0
  routing: string; // e.g. "account:123456_subaccount" — identifies the sub-account/business
}
