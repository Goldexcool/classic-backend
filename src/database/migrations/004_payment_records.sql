CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id uuid REFERENCES ticket_types(id) ON DELETE SET NULL,
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  platform_fee_minor bigint NOT NULL DEFAULT 0 CHECK (platform_fee_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider text NOT NULL,
  provider_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS payments_event_created_idx ON payments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
