ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_status" varchar(30) DEFAULT 'pending' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_name" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_document_hash" varchar(64);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "document_number_last4" varchar(4);
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "admin_review_status" varchar(30) DEFAULT 'pending' NOT NULL;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "admin_reviewed_by" uuid REFERENCES "users"("id");
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "admin_reviewed_at" timestamp;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "admin_review_notes" text;
