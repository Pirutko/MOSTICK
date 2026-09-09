-- Лекарства: план (medication_prescriptions) и факт выдачи (medication_administrations).
-- times jsonb — часы приёма; при создании назначения API разворачивает приёмы на каждый день курса.
-- Также расширяет vet_records полями состояния: pain, appetite, sleep, complaint.

CREATE TABLE IF NOT EXISTS medication_prescriptions (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  vet_id text NOT NULL REFERENCES users(id),
  medication_name text NOT NULL,
  dosage text,
  route text,
  frequency_per_day integer NOT NULL DEFAULT 1 CHECK (frequency_per_day > 0 AND frequency_per_day <= 24),
  times jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date date NOT NULL,
  end_date date NOT NULL,
  instructions text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS medication_prescriptions_animal_idx ON medication_prescriptions(animal_id, start_date DESC);

CREATE TABLE IF NOT EXISTS medication_administrations (
  id text PRIMARY KEY,
  prescription_id text NOT NULL REFERENCES medication_prescriptions(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','given','skipped')),
  administered_at timestamptz,
  administered_by text REFERENCES users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medication_admin_schedule_idx ON medication_administrations(animal_id, scheduled_at, status);
CREATE INDEX IF NOT EXISTS medication_admin_prescription_idx ON medication_administrations(prescription_id, scheduled_at);

ALTER TABLE vet_records ADD COLUMN IF NOT EXISTS pain integer;
ALTER TABLE vet_records ADD COLUMN IF NOT EXISTS appetite integer;
ALTER TABLE vet_records ADD COLUMN IF NOT EXISTS sleep integer;
ALTER TABLE vet_records ADD COLUMN IF NOT EXISTS complaint text;
