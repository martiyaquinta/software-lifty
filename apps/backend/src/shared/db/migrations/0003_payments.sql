CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id"),
  "amount" real NOT NULL,
  "platform_amount" real NOT NULL,
  "driver_amount" real NOT NULL,
  "method" varchar(30) DEFAULT 'mercadopago' NOT NULL,
  "mp_payment_id" varchar(100),
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "withdrawals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL REFERENCES "drivers"("id"),
  "amount" real NOT NULL,
  "payout_method_id" uuid NOT NULL REFERENCES "payout_methods"("id"),
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
