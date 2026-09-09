ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- MOSTIK v5.2.2 — veterinary laboratory analyses
CREATE TABLE IF NOT EXISTS vet_analyses (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  vet_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sample_date date NOT NULL,
  analysis_name text NOT NULL,
  parameter text NOT NULL,
  value_numeric numeric,
  value_text text,
  unit text,
  reference_min numeric,
  reference_max numeric,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('normal','high','low','critical','unknown')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vet_analyses_animal_date_idx ON vet_analyses(animal_id, sample_date DESC, parameter);
CREATE INDEX IF NOT EXISTS vet_analyses_parameter_idx ON vet_analyses(animal_id, parameter, sample_date DESC);
