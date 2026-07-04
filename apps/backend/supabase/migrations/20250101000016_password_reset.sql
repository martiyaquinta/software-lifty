ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code varchar(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts integer NOT NULL DEFAULT 0;
UPDATE users SET email = lower(email) WHERE email IS NOT NULL AND email <> lower(email);
