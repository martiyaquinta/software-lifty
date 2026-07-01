import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, resetDb } from "../src/shared/db/client";

async function deploy() {
  console.log("🚀 Lifty Deploy — Starting...");

  const db = getDb();

  // 1. Run migrations
  console.log("📦 Applying migrations...");
  await migrate(db, { migrationsFolder: "./src/shared/db/migrations" });

  // 2. Verify tables
  console.log("🔍 Verifying database...");
  const result = await db.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const count = result.rowCount ?? 0;
  console.log(`✅ ${count} table${count !== 1 ? "s" : ""} found:`);
  result.rows.forEach((r: any) => console.log(`   - ${r.table_name}`));

  // 3. Verify seed data
  const districts = await db.execute("SELECT count(*) as count FROM districts");
  const districtCount = Number(districts.rows[0]?.count ?? 0);
  console.log(
    `📍 Districts: ${districtCount} row${districtCount !== 1 ? "s" : ""} ${districtCount >= 7 ? "✅" : "⚠️  Need seed!"}`
  );

  // 4. Seed if needed
  if (districtCount < 7) {
    console.log("🌱 Seeding districts...");
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
  }

  console.log("🎉 Deploy complete!");
  resetDb();
  process.exit(0);
}

deploy().catch((err) => {
  console.error("❌ Deploy failed:", err.message);
  process.exit(1);
});
