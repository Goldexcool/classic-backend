ALTER TABLE events
ADD COLUMN IF NOT EXISTS platform_fee_bps smallint NOT NULL DEFAULT 300
CHECK (platform_fee_bps BETWEEN 0 AND 10000);
