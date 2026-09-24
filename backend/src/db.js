const { Pool } = require('pg');

// Host must be an env var: in Compose use the service name (e.g. DB_HOST=db)
// so containers resolve each other via the user-defined bridge network DNS.
// Locally without Docker, set DB_HOST=localhost.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'notes',
  password: process.env.DB_PASSWORD || 'notespass',
  database: process.env.DB_NAME || 'notesdb',
});

/**
 * Postgres often isn't ready when the API container starts.
 * Compose `depends_on` only waits for process start, not for accepting connections —
 * hence retries (or use depends_on + healthcheck in your compose file).
 */
async function waitForDb(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to Postgres');
      return;
    } catch (err) {
      console.warn(
        `Postgres not ready (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (attempt === retries) {
        throw new Error('Could not connect to Postgres after retries');
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function checkDb() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, waitForDb, checkDb };
