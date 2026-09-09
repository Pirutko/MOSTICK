CREATE TABLE IF NOT EXISTS animal_health_features (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  feature_type text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'important',
  status text NOT NULL DEFAULT 'observation',
  note text,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_animal_health_features_animal ON animal_health_features(animal_id);
