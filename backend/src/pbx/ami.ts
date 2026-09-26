import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { config } from "../config.js";

export function isAmiConfigured(): boolean {
  return Boolean(config.AMI_HOST && config.AMI_USERNAME && config.AMI_PASSWORD);
}

function parseAmiBlock(raw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

function describe(fields: Record<string, string>): string {
  return fields.Message ?? JSON.stringify(fields);
}

// One-way notification only: sends a PBX extension a SIP MESSAGE via AMI's
// MessageSend action when a text arrives on a DID mapped to it in
// AMI_NOTIFY_MAP (see webhooks/sms.ts, which resolves the DID -> extension
// before calling this). Connects fresh per call rather than holding a
// persistent AMI connection - notifications are infrequent enough that the
// extra round-trip doesn't matter, and it avoids reconnect/keepalive logic
// for a device on the other end of a VPN link (or similar) that may not
// always be up.
//
// Per Asterisk's MessageSend docs, "To" is a URI-style field (e.g.
// "sip:alice@atlanta.com"), NOT a channel-tech string - targeting a
// specific channel/endpoint technology is what "Destination" is for
// (format "<tech>:<endpoint>", e.g. "pjsip:400"). Most current-generation
// PBXes (including Grandstream's UCM63xx) address extensions via PJSIP,
// not legacy chan_sip.
export async function sendAmiMessage(text: string, extension: string): Promise<void> {
  if (!isAmiConfigured()) return;

  const loginActionId = randomUUID();
  const sendActionId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    let buffer = "";
    let stage: "banner" | "login" | "send" = "banner";

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("AMI connection timed out"));
    }, 8000);

    function finish(err?: Error) {
      clearTimeout(timeout);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    }

    // AMI is a shared connection - after login it can push unsolicited
    // Event: packets (other extensions registering, queue activity, etc.)
    // interleaved with the actual Response: to whatever action we sent. A
    // single TCP chunk can also contain multiple \r\n\r\n-terminated
    // packets, or only part of one, so packets have to be pulled off the
    // front of the buffer as they complete rather than treating "the
    // buffer contains \r\n\r\n" as "the buffer is one complete response".
    function drainPackets(): Record<string, string>[] {
      const packets: Record<string, string>[] = [];
      let idx: number;
      while ((idx = buffer.indexOf("\r\n\r\n")) !== -1) {
        packets.push(parseAmiBlock(buffer.slice(0, idx)));
        buffer = buffer.slice(idx + 4);
      }
      return packets;
    }

    socket.connect(config.AMI_PORT, config.AMI_HOST!, () => {
      // Banner line arrives immediately on connect; nothing to send yet,
      // just wait for it in the "banner" stage below.
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      if (stage === "banner") {
        const idx = buffer.indexOf("\r\n");
        if (idx === -1) return;
        buffer = buffer.slice(idx + 2);
        stage = "login";
        socket.write(
          `Action: Login\r\nActionID: ${loginActionId}\r\nUsername: ${config.AMI_USERNAME}\r\nSecret: ${config.AMI_PASSWORD}\r\n\r\n`
        );
        return;
      }

      if (stage === "login") {
        for (const fields of drainPackets()) {
          // Only a Response packet answers the Login action - anything
          // without a Response field is an unsolicited Event, and if it
          // does carry an ActionID it must be ours (nothing else has been
          // sent yet, but check anyway for consistency with the send stage).
          if (!fields.Response || (fields.ActionID && fields.ActionID !== loginActionId)) continue;
          if (fields.Response !== "Success") {
            finish(new Error(`AMI login failed: ${describe(fields)}`));
            return;
          }
          stage = "send";
          socket.write(
            `Action: MessageSend\r\nActionID: ${sendActionId}\r\nDestination: pjsip:${extension}\r\nFrom: Dispatch\r\nBody: ${text.replace(/\r?\n/g, " ")}\r\n\r\n`
          );
          break;
        }
        return;
      }

      if (stage === "send") {
        for (const fields of drainPackets()) {
          // Same deal: skip interleaved Events, and match on ActionID
          // when the packet has one so a stray Response to some other
          // action (shouldn't happen on this connection, but the shared
          // nature of AMI makes it cheap insurance) is never mistaken for
          // ours.
          if (!fields.Response || (fields.ActionID && fields.ActionID !== sendActionId)) continue;
          if (fields.Response !== "Success") {
            finish(new Error(`AMI MessageSend failed: ${describe(fields)}`));
            return;
          }
          finish();
          return;
        }
      }
    });

    socket.on("error", (err) => finish(err));
  });
}
