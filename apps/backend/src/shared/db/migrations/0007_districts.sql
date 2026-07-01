CREATE TABLE IF NOT EXISTS "districts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "province" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active'
);

INSERT INTO "districts" (name, province, status) VALUES
  ('Villa Dolores', 'Córdoba', 'active'),
  ('Villa Sarmiento', 'Córdoba', 'active'),
  ('Villa de las Rosas', 'Córdoba', 'active'),
  ('San Javier', 'Córdoba', 'active'),
  ('Mina Clavero', 'Córdoba', 'active'),
  ('Nono', 'Córdoba', 'active'),
  ('Las Calles', 'Córdoba', 'active')
ON CONFLICT DO NOTHING;
