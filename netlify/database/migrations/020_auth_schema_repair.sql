-- MOSTIK 5.1.5: make authentication resilient when production DB migrations
-- were not applied or an older auth schema is present.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_code_hash text;

CREATE TABLE IF NOT EXISTS sessions_auth (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  demo_role text
);
ALTER TABLE sessions_auth ADD COLUMN IF NOT EXISTS demo_role text;
CREATE INDEX IF NOT EXISTS sessions_auth_user_idx ON sessions_auth(user_id);
CREATE INDEX IF NOT EXISTS sessions_auth_expires_idx ON sessions_auth(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);
