CREATE TABLE IF NOT EXISTS "ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "rater_id" uuid NOT NULL REFERENCES "users"("id"),
  "ratee_id" uuid NOT NULL REFERENCES "users"("id"),
  "score" integer NOT NULL,
  "tags" varchar(255),
  "comment" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);
