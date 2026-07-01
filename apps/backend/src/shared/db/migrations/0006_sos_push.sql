CREATE TABLE IF NOT EXISTS "sos_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trip_id" uuid REFERENCES "trips"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" varchar(50) NOT NULL,
  "description" varchar(500),
  "lat" real,
  "lng" real,
  "accident_type" varchar(50),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" varchar(512) NOT NULL,
  "platform" varchar(20) NOT NULL DEFAULT 'android',
  "created_at" timestamp DEFAULT now() NOT NULL
);
