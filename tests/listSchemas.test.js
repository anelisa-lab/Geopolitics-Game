import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameListQuerySchema } from '../src/validators/listSchemas.js';

test('an empty URL gets sensible defaults', () => {
  const query = gameListQuerySchema.parse({});
  assert.equal(query.q, '');
  assert.equal(query.status, undefined); // no status filter
  assert.equal(query.sort, 'newest');
  assert.equal(query.page, 1);
});

test('valid settings are kept', () => {
  const query = gameListQuerySchema.parse({ q: ' brazil ', status: 'won', sort: 'rounds', page: '3' });
  assert.deepEqual(query, { q: 'brazil', status: 'won', sort: 'rounds', page: 3 });
});

test('junk in the URL falls back to defaults instead of breaking the page', () => {
  const query = gameListQuerySchema.parse({ status: 'hacked', sort: '$where', page: '-5' });
  assert.deepEqual(query, { q: '', status: undefined, sort: 'newest', page: 1 });
});