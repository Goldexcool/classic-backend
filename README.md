# Gatepass backend

NestJS modular monolith for a multi-tenant ticketing platform. The first backend slice covers accounts, tenant onboarding, event and ticket-type creation, and publishing a public event page. Checkout and payment-provider integration are not included yet.

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

## Initial API

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/tenants`, `POST /api/tenants`
- `POST /api/tenants/:tenantSlug/events`, `GET /api/tenants/:tenantSlug/events`
- `GET /api/tenants/:tenantSlug/events/:eventId/payments`
- `POST /api/tenants/:tenantSlug/events/:eventId/publish`
- `GET /api/public/:tenantSlug/events`
- `GET /api/public/:tenantSlug/events/:eventSlug`

Event pages support HTTPS cover/gallery image URLs, a schedule, guest information, and a contact email. Buyer and payment records appear only after a provider confirms orders.

Protected routes use a bearer access token. Ticket prices are integer minor units plus an ISO-style three-letter currency code. Ticket checkout and payment verification must be added with the chosen payment provider before accepting money.

BullMQ is configured with a `ticketing` queue. Queue consumers should be added with the first confirmed asynchronous workflow (such as payment-confirmed ticket delivery).
