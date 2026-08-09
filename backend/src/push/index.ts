import webpush from "web-push";
import { config } from "../config.js";
import { listPushSubscriptions, removePushSubscription } from "../db/queries.js";

export function isPushConfigured(): boolean {
  return Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
}

if (isPushConfigured()) {
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
}

// Sends to every stored subscription (desktop + any installed PWA devices).
// Subscriptions the push service reports as gone (404/410 - uninstalled,
// permission revoked, etc.) are pruned so we stop wasting requests on them.
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url: string;
  unreadCount: number;
}): Promise<void> {
  if (!isPushConfigured()) return;

  const subscriptions = listPushSubscriptions();
  const data = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data
        );
      } catch (err) {
        const statusCode = err instanceof webpush.WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          removePushSubscription(sub.endpoint);
        } else {
          console.error("Failed to send push notification:", err);
        }
      }
    })
  );
}
