import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  APP_PASSWORD_HASH: z.string().min(1, "APP_PASSWORD_HASH is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  VOIPMS_API_USERNAME: z.string().min(1, "VOIPMS_API_USERNAME is required"),
  VOIPMS_API_PASSWORD: z.string().min(1, "VOIPMS_API_PASSWORD is required"),
  VOIPMS_WEBHOOK_SECRET: z.string().min(1, "VOIPMS_WEBHOOK_SECRET is required"),
  DB_PATH: z.string().default("./data/sms-app.db"),
  // Lives under the same /app/data VOLUME as DB_PATH, so uploaded MMS
  // attachments survive container rebuilds without a separate bind mount.
  UPLOADS_DIR: z.string().default("./data/uploads"),
  // Locks CORS to a single origin in production (see index.ts) - set this
  // to your deployed domain, e.g. https://sms.example.com.
  PUBLIC_ORIGIN: z.string().optional(),
  // Optional: push notifications are simply disabled (not a startup failure)
  // until both are set, so deploying this feature doesn't require updating
  // production env vars in lockstep with the code.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  // Optional, same pattern as VAPID above: a UCM-style PBX desk-phone
  // notify feature is disabled until all of these are set. Plaintext AMI
  // is only safe if the path to your PBX is already encrypted some other
  // way (e.g. a VPN) - don't expose AMI directly to the internet.
  // AMI_NOTIFY_DID/EXTENSION is a single DID->extension pair - inbound
  // messages on that DID get pushed to that extension as a one-way SIP
  // MESSAGE notification.
  AMI_HOST: z.string().optional(),
  AMI_PORT: z.coerce.number().default(7777),
  AMI_USERNAME: z.string().optional(),
  AMI_PASSWORD: z.string().optional(),
  AMI_NOTIFY_DID: z.string().optional(),
  AMI_NOTIFY_EXTENSION: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
