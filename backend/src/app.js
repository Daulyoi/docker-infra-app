const express = require('express');
const cors = require('cors');

function createApp({
  pool,
  checkDb,
  getCachedList,
  setCachedList,
  invalidateListCache,
  checkRedis,
}) {
  const app = express();

  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
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

  return app;
}

module.exports = { createApp };
