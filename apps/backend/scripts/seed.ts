import { getDb, resetDb } from "../src/shared/db/client";

async function seed() {
  console.log("🌱 Lifty Seed — Seeding districts...");

  const db = getDb();

  const existing = await db.execute("SELECT count(*) as count FROM districts");
  const count = Number(existing.rows[0]?.count ?? 0);

  if (count >= 7) {
    console.log(`📍 Districts: ${count} rows — already seeded.`);
    resetDb();
    process.exit(0);
  }

  await db.execute(`
    INSERT INTO "districts" (name, province, status) VALUES
      ('Villa Dolores', 'Córdoba', 'active'),
      ('Villa Sarmiento', 'Córdoba', 'active'),
      ('Villa de las Rosas', 'Córdoba', 'active'),
      ('San Javier', 'Córdoba', 'active'),
      ('Mina Clavero', 'Córdoba', 'active'),
      ('Nono', 'Córdoba', 'active'),
      ('Las Calles', 'Córdoba', 'active')
    ON CONFLICT DO NOTHING
  `);

  console.log("✅ Districts seeded");

  resetDb();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
