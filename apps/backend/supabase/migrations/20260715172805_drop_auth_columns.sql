ALTER TABLE users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_code_expires_at,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS reset_code,
  DROP COLUMN IF EXISTS reset_code_expires_at,
  DROP COLUMN IF EXISTS reset_attempts,
  DROP COLUMN IF EXISTS email_verified;

DROP TABLE IF EXISTS refresh_tokens;
