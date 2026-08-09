# Multiline

A self-hosted, single-user unified SMS/MMS inbox for people juggling multiple VoIP.ms DIDs (personal, business, whatever) who want one place to read and send texts instead of switching numbers in the VoIP.ms portal.

Not a multi-tenant SaaS — this is built for one person to run for themselves, behind whatever access control (VPN, reverse-proxy auth, etc.) they choose to put in front of it.

![License: MIT](https://img.shields.io/badge/license-MIT-14233f)
![Backend](https://img.shields.io/badge/backend-Fastify%20%2B%20TypeScript-14233f)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-14233f)

## Contents

- [Features](#features)
- [Stack](#stack)
- [Setup](#setup)
- [Run (dev)](#run-dev)
- [Build](#build)
- [Deploy](#deploy)
- [License](#license)

## Features

- **Unified inbox** across every SMS/MMS-capable DID on your VoIP.ms account, synced automatically from your account (no manual DID entry).
- **Send and receive SMS and MMS** — attach an image via a real file picker, not a pasted URL.
- **Live updates over WebSocket** — new messages and status changes show up without a refresh.
- **Installable PWA** with Web Push notifications and an app-icon unread badge.
- **Per-message delete** (local + best-effort delete on VoIP.ms's side).
- **Reconciliation poll** that backfills messages sent from the VoIP.ms portal directly, or lost to a missed webhook delivery.
- **Desk-phone notify (optional)** — notify a UCM-style PBX extension by SIP MESSAGE (via AMI) when a text arrives on a given line, if you also have a desk phone on it.
- **Login rate limiting**, GSM-7/Unicode-aware segment counter on compose, responsive mobile layout.

## Stack

| | |
|---|---|
| **Backend** — `backend/` | Fastify + TypeScript, Node's built-in `node:sqlite` for storage, a VoIP.ms REST API client, WebSocket for live updates. |
| **Frontend** — `frontend/` | React + Vite + TypeScript, Tailwind CSS, installable PWA (`vite-plugin-pwa`). |

Not an npm-workspaces monorepo — `backend/` and `frontend/` each install and run independently. (Workspaces need symlinks in `node_modules`, which can fail on some network-mounted checkouts; running each sub-project standalone sidesteps that.)

## Setup

```bash
npm run install:all
```

Then copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Notes |
|---|---|
| `APP_PASSWORD_HASH` | Bcrypt hash for the single-user login password. Generate with: `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"` |
| `SESSION_SECRET` | Any random string, 32+ characters. |
| `VOIPMS_API_USERNAME` / `VOIPMS_API_PASSWORD` | From the VoIP.ms portal (Account → API Control). |
| `VOIPMS_WEBHOOK_SECRET` | Any random string; appended as a query param (`?secret=...`) on the callback URL you register in the VoIP.ms portal for inbound SMS/MMS. VoIP.ms's actual webhook body doesn't match their documented flat format — the secret is a query param, not a body field, and the real body shape is `{ data: { payload: {...} } }`. See `backend/src/webhooks/sms.ts` for details, and check your own server logs for a "Rejected inbound SMS webhook payload" warning if deliveries aren't showing up. |

Everything else in `.env.example` (uploads, push, AMI desk-phone notify) is optional and disabled until configured.

DIDs sync from VoIP.ms automatically: Settings page → "Sync lines", or `POST /api/dids/sync`. Start a new conversation from the "+" button in the thread list (picks a DID + contact number).

> **DID labels come from the VoIP.ms "Note" field**, not "Description" — Description is VoIP.ms-assigned (e.g. a rate-center code) and can't be edited from the portal, but Note can. To control what a DID shows as in this app, edit its Note under VoIP.ms portal → Main Menu → DID Numbers → Manage DIDs → (select DID). If Note is empty, the label falls back to Description, then to the bare DID number.

## Run (dev)

```bash
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173, proxies /api and /ws to the backend
```

## Build

```bash
npm run build
```

## Deploy

Multi-stage `Dockerfile` at the repo root builds the frontend and backend into a single `node:24-alpine` image; the backend serves the built frontend statically. Binds `0.0.0.0`; `DB_PATH` and `UPLOADS_DIR` both default under `/app/data`, declared as a `VOLUME` — bind-mount it so your data survives rebuilds.

docker-compose / actual deployment config is intentionally not in this repo, since that's specific to wherever you host it.

## License

MIT — see [LICENSE](./LICENSE).
