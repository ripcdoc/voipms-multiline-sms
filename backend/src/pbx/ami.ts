import { Socket } from "node:net";
import { config } from "../config.js";

export function isAmiConfigured(): boolean {
  return Boolean(
    config.AMI_HOST && config.AMI_USERNAME && config.AMI_PASSWORD && config.AMI_NOTIFY_DID && config.AMI_NOTIFY_EXTENSION
  );
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

// One-way notification only: sends a UCM6301 extension a SIP MESSAGE via
// AMI's MessageSend action when a text arrives on the DID configured in
// AMI_NOTIFY_DID. Connects fresh per call rather than holding a persistent
// AMI connection - notifications are infrequent enough that the extra
// round-trip doesn't matter, and it avoids reconnect/keepalive logic for a
// device on the other end of a VPN link (or similar) that may not always
// be up.
//
// The MessageSend "To" field format (SIP/<ext> below) is the standard
// Asterisk convention, but other Grandstream UCM63xx firmware versions
// could differ. If this fails, also check the AMI user's permission scope
// in the UCM's admin portal - some manager-user templates don't grant
// MessageSend by default.
export async function sendAmiMessage(text: string): Promise<void> {
  if (!isAmiConfigured()) return;

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

    socket.connect(config.AMI_PORT, config.AMI_HOST!, () => {
      // Banner line arrives immediately on connect; nothing to send yet,
      // just wait for it in the "banner" stage below.
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      if (stage === "banner" && buffer.includes("\r\n")) {
        stage = "login";
        buffer = "";
        socket.write(`Action: Login\r\nUsername: ${config.AMI_USERNAME}\r\nSecret: ${config.AMI_PASSWORD}\r\n\r\n`);
        return;
      }

      if (stage === "login" && buffer.includes("\r\n\r\n")) {
        const fields = parseAmiBlock(buffer);
        buffer = "";
        if (fields.Response !== "Success") {
          finish(new Error(`AMI login failed: ${fields.Message ?? "no message"}`));
          return;
        }
        stage = "send";
        socket.write(
          `Action: MessageSend\r\nTo: SIP/${config.AMI_NOTIFY_EXTENSION}\r\nFrom: Dispatch\r\nBody: ${text.replace(/\r?\n/g, " ")}\r\n\r\n`
        );
        return;
      }

      if (stage === "send" && buffer.includes("\r\n\r\n")) {
        const fields = parseAmiBlock(buffer);
        if (fields.Response !== "Success") {
          finish(new Error(`AMI MessageSend failed: ${fields.Message ?? "no message"}`));
          return;
        }
        finish();
      }
    });

    socket.on("error", (err) => finish(err));
  });
}
