-- Базовые сущности ухода: observations, homework, vet_records, food_logs.

CREATE TABLE IF NOT EXISTS observations (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  behavior_note text,
  health_note text,
  arousal integer CHECK(arousal BETWEEN 1 AND 5),
  stress integer CHECK(stress BETWEEN 1 AND 5),
  concentration integer CHECK(concentration BETWEEN 1 AND 5),
  appetite integer CHECK(appetite BETWEEN 1 AND 5),
  pain integer CHECK(pain BETWEEN 1 AND 5),
  sleep integer CHECK(sleep BETWEEN 1 AND 5),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS observations_animal_time_idx ON observations(animal_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS homework (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  trainer_id text NOT NULL REFERENCES users(id),
  skill_id text REFERENCES skills(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_animal_idx ON homework(animal_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS vet_records (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  vet_id text NOT NULL REFERENCES users(id),
  record_type text NOT NULL DEFAULT 'prescription',
  note text,
  medication_name text,
  dosage text,
  frequency text,
  start_date date,
  end_date date,
  instructions text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vet_records_animal_idx ON vet_records(animal_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS food_logs (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  logged_at timestamptz NOT NULL DEFAULT now(),
  meal text,
  offered text,
  eaten text,
  not_eaten text,
  appetite integer CHECK(appetite BETWEEN 1 AND 5),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_logs_animal_time_idx ON food_logs(animal_id, logged_at DESC);

ALTER TABLE sessions_auth ADD COLUMN IF NOT EXISTS demo_role text;
