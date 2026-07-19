ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS approval_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
