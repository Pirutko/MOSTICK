-- Разовые события календаря: training | medical | grooming (план, не факт).

CREATE TABLE IF NOT EXISTS scheduled_items (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK(type IN ('training','medical','grooming')),
  title text NOT NULL,
  details text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_items_animal_time_idx ON scheduled_items(animal_id, scheduled_at);
