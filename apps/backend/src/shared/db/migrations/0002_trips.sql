CREATE TABLE IF NOT EXISTS "trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "passenger_id" uuid,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id"),
  "status" varchar(30) DEFAULT 'request_received' NOT NULL,
  "origin_lat" real NOT NULL,
  "origin_lng" real NOT NULL,
  "dest_lat" real NOT NULL,
  "dest_lng" real NOT NULL,
  "origin_address" varchar(512),
  "dest_address" varchar(512),
  "distance_km" real,
  "duration_minutes" integer,
  "base_fare" real,
  "distance_fare" real,
  "time_fare" real,
  "total_fare" real,
  "platform_fee" real,
  "driver_earnings" real,
  "payment_method" varchar(30) DEFAULT 'cash',
  "tolerance_minutes" integer DEFAULT 5,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trip_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "from_status" varchar(30),
  "to_status" varchar(30) NOT NULL,
  "changed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "driver_locations" (
  "driver_id" uuid PRIMARY KEY NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
  "lat" real NOT NULL,
  "lng" real NOT NULL,
  "heading" real,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
