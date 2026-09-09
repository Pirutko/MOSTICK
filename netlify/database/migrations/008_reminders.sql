-- Напоминания с повторами: once | daily | weekly | every_n_days.

CREATE TABLE IF NOT EXISTS reminders (
  id text PRIMARY KEY,
  animal_id text REFERENCES animals(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id),
  title text NOT NULL,
  details text,
  remind_at timestamptz NOT NULL,
  repeat_type text NOT NULL DEFAULT 'once' CHECK(repeat_type IN ('once','daily','weekly','every_n_days')),
  repeat_days text,
  every_n_days integer,
  enabled boolean NOT NULL DEFAULT true,
  completed_at timestamptz,
  source_type text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminders_user_time_idx ON reminders(user_id, enabled, remind_at);
CREATE INDEX IF NOT EXISTS reminders_animal_time_idx ON reminders(animal_id, enabled, remind_at);
