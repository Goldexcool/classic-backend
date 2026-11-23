ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS checkout_request_key uuid,
  ADD COLUMN IF NOT EXISTS provider_checkout_id text,
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS provider_idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_outcome_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE payments
SET provider_idempotency_key = 'gatepass-checkout-' || id::text
WHERE provider_idempotency_key IS NULL;

ALTER TABLE payments ALTER COLUMN provider_idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_checkout_request_key_uq
  ON payments (checkout_request_key) WHERE checkout_request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_checkout_id_uq
  ON payments (provider_checkout_id) WHERE provider_checkout_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_idempotency_key_uq
  ON payments (provider_idempotency_key);
CREATE INDEX IF NOT EXISTS payments_pending_inventory_idx
  ON payments (ticket_type_id, expires_at) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS bachs_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
