-- Environmental enrichment logs (for keepers)
CREATE TABLE IF NOT EXISTS enrichment_logs (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  logged_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  details text,
  duration_minutes integer,
  animals_reaction text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enrichment_logs_animal_time_idx ON enrichment_logs(animal_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS enrichment_logs_time_idx ON enrichment_logs(logged_at DESC);
