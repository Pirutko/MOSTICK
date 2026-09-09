-- Products in food logs + Diets module

ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '[]'::jsonb;
-- products: [{name, quantity, calories}]

CREATE TABLE IF NOT EXISTS diets (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diets_animal_idx ON diets(animal_id, active);

CREATE TABLE IF NOT EXISTS diet_periods (
  id text PRIMARY KEY,
  diet_id text NOT NULL REFERENCES diets(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS diet_periods_animal_dates ON diet_periods(animal_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS diet_meals (
  id text PRIMARY KEY,
  diet_id text NOT NULL REFERENCES diets(id) ON DELETE CASCADE,
  day_offset integer NOT NULL DEFAULT 0, -- 0 = template day / Monday-like, or absolute day index
  time_of_day time NOT NULL DEFAULT '08:00',
  title text NOT NULL DEFAULT 'Приём пищи',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diet_meals_diet_idx ON diet_meals(diet_id, day_offset, sort_order);

CREATE TABLE IF NOT EXISTS diet_meal_products (
  id text PRIMARY KEY,
  meal_id text NOT NULL REFERENCES diet_meals(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity text,
  calories numeric,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS diet_meal_products_meal_idx ON diet_meal_products(meal_id, sort_order);

-- Optional: link actual food_logs to planned meal
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS diet_meal_id text REFERENCES diet_meals(id) ON DELETE SET NULL;
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS planned boolean NOT NULL DEFAULT false;
