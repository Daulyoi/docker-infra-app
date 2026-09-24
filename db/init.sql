-- Mount this file (or the db/ directory) into Postgres at:
--   /docker-entrypoint-initdb.d/
-- It runs only on first boot when the data volume is empty.
-- Named volumes persist data across `docker compose restart` — re-init won't re-run.

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO items (title, body) VALUES
  ('Welcome', 'Your first note — try adding more from the UI.'),
  ('Docker tip', 'Use service names (db, cache) as hostnames on the Compose network.'),
  ('Volumes', 'Bind-mount this init.sql; use a named volume for Postgres data.');
