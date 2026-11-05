import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSameOrigin, requireJsonBody } from '../src/middleware/security.js';
import { loginSchema } from '../src/validators/authSchemas.js';
import { reinforceSchema } from '../src/validators/gameSchemas.js';

// A pretend request with the given method and headers
function request(method, headers = {}, contentType = null) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    get: (name) => lower[name.toLowerCase()],
    is: (type) => contentType === type,
  };
}

// Runs a middleware and returns 'next' if it let the request through, or the error it raised
function run(middleware, req) {
  let outcome = 'not called';
  middleware(req, {}, (err) => { outcome = err ?? 'next'; });
  return outcome;
}

const SITE = 'geopolitics-game.onrender.com';

test('moves from this site are allowed', () => {
  const req = request('POST', { Host: SITE, Origin: `https://${SITE}`, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(run(requireSameOrigin, req), 'next');
});
test("this site's own forms are allowed, even when the browser hides the address", () => {
  // With the no-referrer security header, browsers send "Origin: null" from forms
  const req = request('POST', { Host: SITE, Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(run(requireSameOrigin, req), 'next');
});

test('moves sent from another website are blocked', () => {
  assert.equal(run(requireSameOrigin, request('POST', { Host: SITE, Origin: 'https://evil.example' })).status, 403);
  assert.equal(run(requireSameOrigin, request('POST', { Host: SITE, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(run(requireSameOrigin, request('POST', { Host: SITE, Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(run(requireSameOrigin, request('POST', { Host: SITE, Origin: 'not a real address' })).status, 403);
});

test('reading pages is never blocked, wherever the link was clicked', () => {
  assert.equal(run(requireSameOrigin, request('GET', { Host: SITE, 'Sec-Fetch-Site': 'cross-site' })), 'next');
});

test('the API only accepts moves sent as JSON', () => {
  assert.equal(run(requireJsonBody, request('POST', {}, 'application/json')), 'next');
  assert.equal(run(requireJsonBody, request('POST', {}, 'text/plain')).status, 415);
  assert.equal(run(requireJsonBody, request('GET')), 'next');
});

test('NoSQL injection in the login form is rejected before it reaches the database', () => {
  const attack = loginSchema.safeParse({ username: { $ne: null }, password: { $ne: null } });
  assert.equal(attack.success, false);
});

test('impossible soldier numbers are rejected', () => {
  for (const count of [-5, 0, 1.5, 99999, '3', null]) {
    assert.equal(reinforceSchema.safeParse({ allocations: [{ iso2: 'ZA', count }] }).success, false, `allowed ${count}`);
  }
  assert.equal(reinforceSchema.safeParse({ allocations: [{ iso2: "ZA'; DROP", count: 2 }] }).success, false);
});