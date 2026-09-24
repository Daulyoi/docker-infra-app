require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, waitForDb, checkDb } = require('./db');
const {
  connectCache,
  getCachedList,
  setCachedList,
  invalidateListCache,
  checkRedis,
} = require('./cache');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const dbOk = await checkDb();
  const redisOk = await checkRedis();
  const ok = dbOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    redis: redisOk ? 'up' : 'down',
  });
});

app.get('/api/items', async (_req, res) => {
  try {
    const cached = await getCachedList();
    if (cached) {
      return res.json({ source: 'cache', items: cached });
    }

    const { rows } = await pool.query(
      'SELECT id, title, body, created_at FROM items ORDER BY id ASC'
    );
    await setCachedList(rows);
    res.json({ source: 'db', items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list items' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, body, created_at FROM items WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.post('/api/items', async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO items (title, body)
       VALUES ($1, $2)
       RETURNING id, title, body, created_at`,
      [title.trim(), typeof body === 'string' ? body : '']
    );
    // Writes must drop the list cache so the next GET sees fresh data.
    await invalidateListCache();
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    await invalidateListCache();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

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
