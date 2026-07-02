DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_mp_payment_id_unique') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_mp_payment_id_unique" UNIQUE ("mp_payment_id");
  END IF;
END $$;
