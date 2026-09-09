-- User catalog of products with kcal per 100g for auto-fill
CREATE TABLE IF NOT EXISTS food_product_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  name_normalized text NOT NULL,
  kcal_per_100g numeric NOT NULL CHECK (kcal_per_100g >= 0 AND kcal_per_100g <= 1000),
  animal_id text REFERENCES animals(id) ON DELETE CASCADE,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_product_catalog_name_idx
  ON food_product_catalog (name_normalized);
CREATE INDEX IF NOT EXISTS food_product_catalog_animal_idx
  ON food_product_catalog (animal_id);
CREATE INDEX IF NOT EXISTS food_product_catalog_animal_name_idx
  ON food_product_catalog (animal_id, name_normalized);
