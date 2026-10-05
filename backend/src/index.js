require('dotenv').config();

const { pool, waitForDb, checkDb } = require('./db');
const {
  connectCache,
  getCachedList,
  setCachedList,
  invalidateListCache,
  checkRedis,
} = require('./cache');
const { createApp } = require('./app');

const app = createApp({
  pool,
  checkDb,
  getCachedList,
  setCachedList,
  invalidateListCache,
  checkRedis,
});
const PORT = Number(process.env.PORT);

async function start() {
  await waitForDb();
  await connectCache();
  app.listen(PORT, '0.0.0.0', () => {
    // Bind 0.0.0.0 so the port is reachable from other containers / published ports.
    console.log(`API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
