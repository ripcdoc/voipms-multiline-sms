import cookie from "@fastify/cookie";
import session from "@fastify/session";
import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";

declare module "@fastify/session" {
  interface FastifySessionObject {
    authenticated?: boolean;
  }
}

const loginSchema = z.object({
  password: z.string().min(1),
});

// Single-user app, typically exposed to the internet, so failed logins get
// throttled per IP rather than left unlimited. In-memory is fine at this
// traffic scale - no need for a shared store across restarts/instances.
const FAILURE_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failuresByIp = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const entry = failuresByIp.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    failuresByIp.delete(ip);
    return false;
  }
  return entry.count >= FAILURE_LIMIT;
}

function recordFailure(ip: string): void {
  const entry = failuresByIp.get(ip);
  if (!entry || Date.now() - entry.windowStart > WINDOW_MS) {
    failuresByIp.set(ip, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: config.SESSION_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  });

  app.post("/api/auth/login", async (req, reply) => {
    if (isRateLimited(req.ip)) {
      return reply.code(429).send({ error: "Too many failed attempts. Try again in a few minutes." });
    }

    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Password required" });
    }

    const valid = bcrypt.compareSync(body.data.password, config.APP_PASSWORD_HASH);
    if (!valid) {
      recordFailure(req.ip);
      return reply.code(401).send({ error: "Invalid password" });
    }

    failuresByIp.delete(req.ip);
    req.session.authenticated = true;
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await req.session.destroy();
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    return { authenticated: req.session.authenticated === true };
  });
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.authenticated) {
    reply.code(401).send({ error: "Not authenticated" });
  }
}
