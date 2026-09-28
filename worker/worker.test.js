const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { tick } = require('./worker');

describe('worker tick', () => {
  let db;

  beforeEach(() => {
    db = { query: mock.fn() };
  });

  it('returns the item count from the database', async () => {
    db.query.mock.mockImplementation(async () => ({
      rows: [{ count: 3 }],
    }));

    const count = await tick(db);
    assert.equal(count, 3);
    assert.equal(db.query.mock.callCount(), 1);
  });

  it('handles query failure without throwing', async () => {
    db.query.mock.mockImplementation(async () => {
      throw new Error('connection refused');
    });

    const count = await tick(db);
    assert.equal(count, null);
  });
});
