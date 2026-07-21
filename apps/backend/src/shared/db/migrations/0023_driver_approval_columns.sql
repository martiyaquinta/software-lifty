ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approval_token text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approved_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_approval_token_unique ON drivers (approval_token);
