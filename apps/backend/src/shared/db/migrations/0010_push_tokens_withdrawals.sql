ALTER TABLE "push_tokens" DROP CONSTRAINT IF EXISTS "push_tokens_user_id_unique";
DROP INDEX IF EXISTS "push_tokens_user_id_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_device_unique" ON "push_tokens" ("user_id", "token");

ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_mp_withdrawal_id_unique" UNIQUE ("mp_withdrawal_id");
