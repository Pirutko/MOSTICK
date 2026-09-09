ALTER TABLE animal_development_features
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'important';

UPDATE animal_development_features
SET severity='important'
WHERE severity IS NULL OR severity='';

ALTER TABLE animal_development_features
  DROP CONSTRAINT IF EXISTS animal_development_features_severity_check;

ALTER TABLE animal_development_features
  ADD CONSTRAINT animal_development_features_severity_check
  CHECK (severity IN ('critical','important','info'));

CREATE INDEX IF NOT EXISTS idx_animal_development_features_severity
  ON animal_development_features(animal_id, severity);
