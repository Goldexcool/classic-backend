ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS event_program text,
  ADD COLUMN IF NOT EXISTS additional_info text,
  ADD COLUMN IF NOT EXISTS contact_email text;
