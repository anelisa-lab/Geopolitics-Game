import { test } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../src/models/User.js';

test('a valid user passes validation', () => {
  const user = new User({ username: 'anelisa', email: 'a@example.com', passwordHash: 'hash' });
  assert.equal(user.validateSync(), undefined);
});

test('bad usernames and emails are rejected', () => {
  const user = new User({ username: 'a!', email: 'not-an-email', passwordHash: 'hash' });
  const err = user.validateSync();
  assert.ok(err.errors.username);
  assert.ok(err.errors.email);
});

test('the password hash is never included in JSON', () => {
  const user = new User({ username: 'anelisa', email: 'a@example.com', passwordHash: 'secret-hash' });
  assert.equal(user.toJSON().passwordHash, undefined);
});