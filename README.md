# Gatepass backend

NestJS modular monolith for a multi-tenant ticketing platform. It covers accounts, tenant onboarding, event and ticket-type creation, public event pages, Bachs-hosted ticket checkout, verified payment webhooks, and organizer payment records.

## Run locally

1. If `.env` does not exist, copy `.env.example` to `.env`; set `DATABASE_URL` and a private `JWT_SECRET` there.
2. Create a hosted Redis URL (for example, Upstash **Connect → TCP**) and set it as `REDIS_URL`, or leave the local default and use Docker Compose.
3. Run `docker compose up --build` to start the API and local Redis, or run `docker compose up -d redis` followed by `npm run start:dev`.
4. Run `npm run db:migrate` to create the PostgreSQL tables.

The API listens on port 3000. Health check: `GET /api/health`.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; keep it in the host's encrypted environment settings. |
| `REDIS_URL` | Redis TCP URL used by BullMQ (`redis://` locally or `rediss://` for TLS). |
| `JWT_SECRET` | Private signing secret for access tokens. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API; defaults to `http://localhost:3001`. |
| `PORT` | HTTP port; defaults to `3000`. |
| `BACHS_SECRET_KEY` | Server-only Bachs API key. Use a sandbox key for sandbox testing; never expose it to the browser. |
| `BACHS_WEBHOOK_SECRET` | Signing secret for the Bachs webhook endpoint. |
| `GATEPASS_FRONTEND_URL` | Public frontend origin used for checkout return and cancel links. |

## Initial API

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/tenants`, `POST /api/tenants`
- `POST /api/tenants/:tenantSlug/events`, `GET /api/tenants/:tenantSlug/events`
- `GET /api/tenants/:tenantSlug/events/:eventId/payments`
- `POST /api/tenants/:tenantSlug/events/:eventId/publish`
- `GET /api/public/:tenantSlug/events`
- `GET /api/public/:tenantSlug/events/:eventSlug`
- `POST /api/public/:tenantSlug/events/:eventSlug/checkout`
- `GET /api/public/payments/:paymentId`
- `POST /api/webhooks/bachs`

Event pages support HTTPS cover/gallery image URLs, a schedule, guest information, and a contact email. Bachs checkout prices are loaded from PostgreSQL, use a persisted idempotency key, and are fulfilled only after a signature-verified webhook and provider checkout lookup confirm the amount, currency, and reference. Webhook event IDs are deduplicated in PostgreSQL.

Protected routes use a bearer access token. Ticket prices are integer minor units plus an ISO-style three-letter currency code. Gatepass records a 3% fee in the payment ledger. This checkout does not create organizer Connect accounts or automatically split/payout funds; configure Bachs marketplace settlement before representing the fee as an automatic organizer deduction.

BullMQ is configured with a `ticketing` queue. Queue consumers should be added with the first confirmed asynchronous workflow (such as payment-confirmed ticket delivery).
