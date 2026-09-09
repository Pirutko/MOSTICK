-- MOSTIK v5.1.8
-- Recurring reminders + homework sessions

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'training';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS homework_id text REFERENCES homework(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_homework_idx ON sessions(homework_id);
CREATE INDEX IF NOT EXISTS sessions_type_idx ON sessions(session_type);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_repeat_type_check') THEN
    ALTER TABLE reminders DROP CONSTRAINT reminders_repeat_type_check;
  END IF;
  ALTER TABLE reminders ADD CONSTRAINT reminders_repeat_type_check
    CHECK (repeat_type IN ('once','daily','weekly','monthly','every_n_days'));
END $$;
