CREATE TABLE IF NOT EXISTS insight_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  screen text,
  target text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insight_events_time_idx ON insight_events(created_at);
CREATE INDEX IF NOT EXISTS insight_events_user_time_idx ON insight_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS insight_events_type_idx ON insight_events(event_type, created_at);
CREATE TABLE IF NOT EXISTS insight_feedback (
  id text PRIMARY KEY,
  admin_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_id text NOT NULL,
  feedback text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insight_feedback_rec_idx ON insight_feedback(recommendation_id, created_at);
