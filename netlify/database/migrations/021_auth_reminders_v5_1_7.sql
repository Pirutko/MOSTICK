-- MOSTIK v5.1.7: auth hardening + recurring reminders.
-- Safe to run on an existing database.

ALTER TABLE sessions_auth ADD COLUMN IF NOT EXISTS demo_role text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_repeat_type_check') THEN
    ALTER TABLE reminders DROP CONSTRAINT reminders_repeat_type_check;
  END IF;
  ALTER TABLE reminders ADD CONSTRAINT reminders_repeat_type_check
    CHECK (repeat_type IN ('once','daily','weekly','monthly','every_n_days'));
END $$;

CREATE INDEX IF NOT EXISTS reminders_enabled_time_idx ON reminders(enabled, remind_at);
