-- MOSTIK v5.2.1: trainer training templates
CREATE TABLE IF NOT EXISTS training_templates (
  id text PRIMARY KEY,
  trainer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes integer NOT NULL DEFAULT 15 CHECK(duration_minutes > 0),
  skill_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_templates_trainer_idx
  ON training_templates(trainer_id, created_at DESC);
