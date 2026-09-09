CREATE TABLE IF NOT EXISTS sessions_auth (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_auth_user_idx ON sessions_auth(user_id);
CREATE INDEX IF NOT EXISTS sessions_auth_expires_idx ON sessions_auth(expires_at);
