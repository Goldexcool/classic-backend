CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  venue text,
  starts_at timestamptz NOT NULL,
  platform_fee_bps smallint NOT NULL DEFAULT 300 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  cover_image_url text,
  gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_program text,
  additional_info text,
  contact_email text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quantity integer NOT NULL CHECK (quantity > 0),
  sold_count integer NOT NULL DEFAULT 0 CHECK (sold_count >= 0 AND sold_count <= quantity),
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS events_tenant_created_idx ON events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_types_event_idx ON ticket_types (event_id);
CREATE INDEX IF NOT EXISTS payments_event_created_idx ON payments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
