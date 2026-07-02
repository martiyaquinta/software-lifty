CREATE TABLE IF NOT EXISTS "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"province" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"doc_type" varchar(50) NOT NULL,
	"file_url" varchar(512) NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_locations" (
	"driver_id" uuid PRIMARY KEY NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"heading" real,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'step1' NOT NULL,
	"rating_avg" real DEFAULT 0,
	"total_trips" integer DEFAULT 0,
	"completion_rate" real DEFAULT 0,
	"kyc_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"is_online" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"amount" real NOT NULL,
	"platform_amount" real NOT NULL,
	"driver_amount" real NOT NULL,
	"method" varchar(30) DEFAULT 'mercadopago' NOT NULL,
	"mp_payment_id" varchar(100),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_mp_payment_id_unique" UNIQUE("mp_payment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"method_type" varchar(20) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"titular_name" varchar(255),
	"wallet" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(512) NOT NULL,
	"platform" varchar(20) DEFAULT 'android' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"tags" varchar(255),
	"comment" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sos_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" varchar(500),
	"lat" real,
	"lng" real,
	"accident_type" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid,
	"driver_id" uuid NOT NULL,
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
	"waiting_since" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"brand" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"color" varchar(50) NOT NULL,
	"plate" varchar(20) NOT NULL,
	"vehicle_type" varchar(50) DEFAULT 'car' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"amount" real NOT NULL,
	"payout_method_id" uuid NOT NULL,
	"mp_withdrawal_id" varchar(100),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_documents_driver_id_drivers_id_fk') THEN
    ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_locations_driver_id_drivers_id_fk') THEN
    ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_user_id_users_id_fk') THEN
    ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_trip_id_trips_id_fk') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_driver_id_drivers_id_fk') THEN
    ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_id_users_id_fk') THEN
    ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ratings_trip_id_trips_id_fk') THEN
    ALTER TABLE "ratings" ADD CONSTRAINT "ratings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ratings_rater_id_users_id_fk') THEN
    ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ratings_ratee_id_users_id_fk') THEN
    ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sos_events_trip_id_trips_id_fk') THEN
    ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sos_events_user_id_users_id_fk') THEN
    ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_events_trip_id_trips_id_fk') THEN
    ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_driver_id_drivers_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_driver_id_drivers_id_fk') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_driver_id_drivers_id_fk') THEN
    ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_payout_method_id_payout_methods_id_fk') THEN
    ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;