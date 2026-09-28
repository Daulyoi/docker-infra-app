const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

function createMocks() {
  return {
    pool: { query: mock.fn() },
    checkDb: mock.fn(async () => true),
    getCachedList: mock.fn(async () => null),
    setCachedList: mock.fn(async () => {}),
    invalidateListCache: mock.fn(async () => {}),
    checkRedis: mock.fn(async () => true),
  };
}

describe('API', () => {
  let deps;
  let app;

  beforeEach(() => {
    deps = createMocks();
    app = createApp(deps);
  });

  it('POST /api/items returns 400 when title is missing', async () => {
    const res = await request(app).post('/api/items').send({ body: 'x' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'title is required' });
    assert.equal(deps.pool.query.mock.callCount(), 0);
  });

  it('GET /api/items returns cache hit', async () => {
    const items = [{ id: 1, title: 'Cached', body: '' }];
    deps.getCachedList.mock.mockImplementation(async () => items);

    const res = await request(app).get('/api/items');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { source: 'cache', items });
    assert.equal(deps.pool.query.mock.callCount(), 0);
  });

  it('GET /api/items returns db miss and sets cache', async () => {
    const items = [{ id: 1, title: 'From DB', body: 'hi' }];
    deps.pool.query.mock.mockImplementation(async () => ({ rows: items }));

    const res = await request(app).get('/api/items');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { source: 'db', items });
    assert.equal(deps.setCachedList.mock.callCount(), 1);
    assert.deepEqual(deps.setCachedList.mock.calls[0].arguments, [items]);
  });

  it('GET /api/items/:id returns 404 when missing', async () => {
    deps.pool.query.mock.mockImplementation(async () => ({ rows: [] }));

    const res = await request(app).get('/api/items/99');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('DELETE /api/items/:id returns 204 and invalidates cache', async () => {
    deps.pool.query.mock.mockImplementation(async () => ({ rowCount: 1 }));

    const res = await request(app).delete('/api/items/1');
    assert.equal(res.status, 204);
    assert.equal(deps.invalidateListCache.mock.callCount(), 1);
  });

  it('GET /api/health returns 200 when db and redis are up', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      status: 'ok',
      db: 'up',
      redis: 'up',
    });
  });

  it('GET /api/health returns 503 when a dependency is down', async () => {
    deps.checkRedis.mock.mockImplementation(async () => false);

    const res = await request(app).get('/api/health');
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, {
      status: 'degraded',
      db: 'up',
      redis: 'down',
    });
  });
});
