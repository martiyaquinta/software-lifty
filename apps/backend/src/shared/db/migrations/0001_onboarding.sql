CREATE TABLE IF NOT EXISTS "drivers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
  "brand" varchar(100) NOT NULL,
  "model" varchar(100) NOT NULL,
  "year" integer NOT NULL,
  "color" varchar(50) NOT NULL,
  "plate" varchar(20) NOT NULL,
  "vehicle_type" varchar(50) DEFAULT 'car' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "driver_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
  "doc_type" varchar(50) NOT NULL,
  "file_url" varchar(512) NOT NULL,
  "verified_at" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payout_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
  "method_type" varchar(20) NOT NULL,
  "account_number" varchar(50) NOT NULL,
  "titular_name" varchar(255),
  "wallet" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL
);
