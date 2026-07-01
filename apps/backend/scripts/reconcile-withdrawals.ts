import { getDb } from "../src/shared/db/client";
import { getRedis } from "../src/shared/lib/redis";
import { withdrawals } from "../src/shared/db/schema/withdrawals";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "../src/shared/lib/logger";

const STALE_MINUTES = 5;
const LOCK_KEY = "reconcile:lock";
const LOCK_TTL = 60;

async function main() {
  const redis = getRedis();
  if (!redis) {
    logger.warn("[RECONCILE] Redis not available — skipping reconciliation");
    process.exit(0);
  }

  const lock = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL, "NX");
  if (!lock) {
    logger.debug("[RECONCILE] Already running — skipping");
    process.exit(0);
  }

  try {
    const db = getDb();
    const staleDate = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const stuck = await db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.status, "processing"), lt(withdrawals.created_at, staleDate)))
      .limit(20);

    if (stuck.length === 0) {
      logger.debug("[RECONCILE] No stuck withdrawals");
      process.exit(0);
    }

    logger.info("[RECONCILE] Found", stuck.length, "stuck withdrawals");

    for (const w of stuck) {
      if (!w.mp_withdrawal_id) {
        await db.update(withdrawals).set({ status: "failed" }).where(eq(withdrawals.id, w.id));
        logger.warn("[RECONCILE] No MP id for withdrawal", w.id);
        continue;
      }

      try {
        const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!token) {
          logger.warn("[RECONCILE] MercadoPago not configured");
          break;
        }

        const res = await fetch(`https://api.mercadopago.com/v1/payouts/${w.mp_withdrawal_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          logger.error("[RECONCILE] MP API error for", w.id, res.status);
          continue;
        }

        const data = (await res.json()) as { status?: string };
        if (data.status && data.status !== w.status) {
          await db.update(withdrawals).set({ status: data.status }).where(eq(withdrawals.id, w.id));
          logger.info("[RECONCILE] Updated", w.id, "→", data.status);
        }
      } catch (err) {
        logger.error("[RECONCILE] Error reconciling", w.id, (err as Error).message);
      }
    }
  } finally {
    await redis.del(LOCK_KEY);
  }

  process.exit(0);
}

main().catch((err) => {
  logger.error("[RECONCILE] Fatal error:", err.message);
  process.exit(1);
});
