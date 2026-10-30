import { test } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../src/models/User.js';

test('a valid user passes validation', async () => {
  const user = new User({ username: 'anelisa', email: 'a@example.com', passwordHash: 'hash' });
  await user.validate(); // throws if anything is invalid
});

test('bad usernames and emails are rejected', async () => {
  const user = new User({ username: 'a!', email: 'not-an-email', passwordHash: 'hash' });
  await assert.rejects(user.validate(), (err) => {
    assert.ok(err.errors.username);
    assert.ok(err.errors.email);
    return true;
  });
});

test('the password hash is never included in JSON', () => {
  const user = new User({ username: 'anelisa', email: 'a@example.com', passwordHash: 'secret-hash' });
  assert.equal(user.toJSON().passwordHash, undefined);
});