ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code varchar(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at timestamp;
