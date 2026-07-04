ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "is_collected" boolean DEFAULT false NOT NULL;
