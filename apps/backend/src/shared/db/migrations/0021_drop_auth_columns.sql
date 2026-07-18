ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL,
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_code_expires_at,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS reset_code,
  DROP COLUMN IF EXISTS reset_code_expires_at,
  DROP COLUMN IF EXISTS reset_attempts;
