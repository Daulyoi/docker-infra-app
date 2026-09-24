require('dotenv').config();
const { Pool } = require('pg');

// Same DB_* vars as the API. On a Compose network, DB_HOST should be the
// Postgres service name (e.g. "db"). Put the worker on a network that can
// reach the DB; you typically do NOT publish a host port for the worker.
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'notes',
  password: process.env.DB_PASSWORD || 'notespass',
  database: process.env.DB_NAME || 'notesdb',
});

const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

async function waitForDb(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Worker connected to Postgres');
      return;
    } catch (err) {
      console.warn(
        `Worker: Postgres not ready (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function tick() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM items');
    const count = rows[0].count;
    console.log(`[${new Date().toISOString()}] items in database: ${count}`);
  } catch (err) {
    console.error('Worker poll failed:', err.message);
  }
}

async function main() {
  await waitForDb();
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
