ALTER TABLE animals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'normal';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'animals_status_check'
  ) THEN
    ALTER TABLE animals ADD CONSTRAINT animals_status_check CHECK (status IN ('normal','attention','critical'));
  END IF;
END $$;
