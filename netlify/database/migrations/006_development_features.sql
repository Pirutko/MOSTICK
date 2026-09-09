CREATE TABLE IF NOT EXISTS animal_development_features (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'observation',
  note text,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_animal_development_features_animal ON animal_development_features(animal_id);
