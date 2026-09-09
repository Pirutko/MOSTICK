CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS animals (
  id text PRIMARY KEY,
  name text NOT NULL,
  species text,
  breed text,
  owner_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS animal_access (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, animal_id)
);
CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  animal_id text REFERENCES animals(id) ON DELETE CASCADE,
  name text NOT NULL,
  signal text,
  goal text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_steps (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  title text,
  goal text,
  criterion text,
  bridge text,
  reinforcement text,
  reinforcement_other text,
  reinforcement_schedule text,
  UNIQUE(skill_id, step_no)
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  animal_id text NOT NULL REFERENCES animals(id),
  trainer_id text NOT NULL REFERENCES users(id),
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  ending_type text,
  ending_other text,
  success_score integer CHECK(success_score BETWEEN 1 AND 10),
  external_stimulus text,
  external_reason text,
  internal_stimulus text,
  internal_reason text,
  concentration integer CHECK(concentration BETWEEN 1 AND 5),
  arousal integer CHECK(arousal BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session_skills (
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills(id),
  repetitions integer NOT NULL DEFAULT 0,
  PRIMARY KEY(session_id, skill_id)
);
