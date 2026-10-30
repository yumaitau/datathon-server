# MyMob server

Elder-governed community hub for Aboriginal and Torres Strait Islander
communities (datathon prototype). One Next.js app serves:

- the REST API for the iOS app (`/api/*`, contract in [docs/API.md](docs/API.md))
- the **Elder portal** (`/elder`): join requests, post approval and pinning,
  clinic access requests, reported comments, members, Elder nominations, data
  export, engagement dashboard and service gap map
- the **clinic portal** (`/provider`): invite patients by mobile, book and manage
  appointments, ask Elders for group access, post events, attendance insights
- the **platform admin** (`/admin`): verify Elder nominations, onboard and verify
  providers, SMS/push outbox, audit log

Stack: Next.js 16 (App Router, Cache Components), Prisma 7 + Postgres, Better
Auth (phone OTP + bearer tokens), Recharts, MapLibre with OpenStreetMap tiles,
next-intl.

## Run it with Docker (demo and testing)

```bash
docker compose up --build
```

- Web + API: http://localhost:3000
- Postgres: `localhost:5433` (user, password and database: `mymob`)
- The app container applies migrations and seeds demo data on first start.
- A `cron` container calls the reminder job every 5 minutes, standing in for the
  AWS scheduler.

Reset the demo data: `SEED=always docker compose up -d app` (or
`docker compose down -v` to drop the database volume).

## Local development

```bash
cp .env.example .env
docker compose up -d db     # Postgres on :5433
pnpm install
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev
```

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm typecheck` · `pnpm lint` | TypeScript and ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm smoke [url]` | End-to-end check of both demo flows against a running, freshly seeded server |
| `pnpm db:seed` | Wipe and reload demo data |
| `pnpm i18n:pseudo` | Regenerate the placeholder demo language from `messages/en.json` |

## Demo accounts

Seeded numbers accept the code in `DEMO_OTP_CODE` (default `123456`). Any other
number gets a real code, sent by SMS or shown in the outbox.

| Number | Person | Role |
| --- | --- | --- |
| 0400 000 001 | Aunty Grace Walker | Elder, Saltbush Creek |
| 0400 000 002 | Uncle Tom Baker | Elder, Ironbark Ridge |
| 0400 000 003 | Jordan Miller | New member (not joined; join code `SALT-2026`) |
| 0400 000 004 | Leah Thompson | Patient with the app |
| 0400 000 005 | Sam Thompson | Leah's nominated carer |
| 0400 000 006 | Ray Cooper | Patient without the app (SMS only, no account) |
| 0400 000 010 | Priya Nair | Staff, Saltbush Creek Health Service |
| 0400 000 011 | Mark Ellis | Staff, Mulga Springs Dental |
| 0400 000 099 | Platform Admin | Admin |

All people, communities and services are fictional.

## AWS and APNs: mocked until you add keys

Without credentials, every SMS and push is recorded in `NotificationLog` and
shown at `/admin/outbox` (the PRD's fallback). To go live, set these in `.env`
(local) or next to `docker-compose.yml`; no code changes:

| Variable | Effect |
| --- | --- |
| `SNS_ENABLED=true`, `AWS_REGION=ap-southeast-2`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `SNS_SENDER_ID` | OTP codes and reminders are sent by AWS SNS SMS |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` (the .p8 contents; `\n` escapes allowed), `APNS_PRODUCTION` | Push via APNs token auth (sandbox unless `APNS_PRODUCTION=true`) |

Delivery is still logged to the outbox when live. In the SNS sandbox, verify the
demo phone numbers first. Leave `DEMO_OTP_CODE` empty outside the demo.

Production hosting should stay in AWS ap-southeast-2 (RDS Postgres, SNS, ECS or
Amplify) to keep data onshore; the image is region-agnostic. Schedule
`POST /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` every 5
minutes (EventBridge).

## Demo flows

**A. Elder runs the community.** Jordan requests to join (iOS) → Aunty Grace
approves (iOS or `/elder`) → Jordan posts an announcement → Grace approves and
pins it → Grace allows Mulga Springs Dental's pending request → Grace opens
`/elder/…/engagement`.

**B. Clinic to patient.** Priya invites a patient and books a 715 health check at
`/provider/appointments` → Leah's app shows it (push when APNs is configured;
the outbox shows the push otherwise) → Sam sees it under "caring for" → Leah
confirms in airplane mode and it syncs on reconnect → book Ray (SMS only) and
press **Send due reminders now**; his SMS appears in `/admin/outbox` → open
`/provider/insights`.

## How the PRD's guarantees are enforced

- **Community scoping:** content rows carry `communityId`; `scopedDb()` in
  `lib/db.ts` filters reads and rejects writes outside the caller's communities.
- **Health data:** appointments are returned only to the patient and active
  carers (`lib/health.ts`); Elders, members and admins have no API path to them.
  Every staff read is written to the audit log.
- **Generic notifications:** reminder text never includes the appointment type
  or service name.
- **Minimum cell size 5:** applied inside the SQL views
  (`prisma/migrations/*_insights_views`, `*_dna_weekly_totals`); the UI renders
  `<5`.
- **Offline / satellite sync:** `/api/sync` and `/api/sync/lite` apply queued
  writes idempotently by `clientMutationId` (`lib/mutations.ts`); lite responses
  are text-only, gzip, typically well under 1 KB.

See also [docs/breach-response.md](docs/breach-response.md).
