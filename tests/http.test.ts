import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/env';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
test('HTTP authentication, origin protection, safe profile and role boundaries', async (t) => {
  let cookie = '';
  const request = (path: string, init: RequestInit = {}) =>
    fetch(base + '/api/' + path, {
      ...init,
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });
  await t.test('unauthenticated overview is denied', async () => {
    assert.equal((await request('overview')).status, 401);
  });
  await t.test('cross-origin mutations are denied', async () => {
    assert.equal(
      (
        await request('auth/login', {
          method: 'POST',
          headers: { Origin: 'https://untrusted.example' },
          body: JSON.stringify({
            email: 'buyer@demo.returnly.test',
            password: process.env.DEMO_PASSWORD || 'DemoPass123!',
          }),
        })
      ).status,
      403,
    );
  });
  await t.test('sign-in returns only safe user data and sets an HttpOnly cookie', async () => {
    const r = await request('auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'buyer@demo.returnly.test',
        password: process.env.DEMO_PASSWORD || 'DemoPass123!',
      }),
    });
    assert.equal(r.status, 200);
    const header = r.headers.get('set-cookie') || '';
    assert.match(header, /httponly/i);
    assert.match(header, /samesite=lax/i);
    cookie = header.split(';')[0];
    const data = await r.json();
    assert.equal(data.user.role, 'buyer');
    assert.equal(data.user.password_hash, undefined);
  });
  await t.test('buyer cannot resolve a dispute even with a crafted request', async () => {
    const overview = await (await request('overview')).json();
    const d = overview.disputes[0];
    assert.ok(d);
    const r = await request(`disputes/${d.id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        decision: 'approve',
        amountCents: 100,
        note: 'A crafted request must be rejected.',
      }),
    });
    assert.equal(r.status, 403);
  });
  await t.test('malformed and missing-origin requests fail safely', async () => {
    assert.equal((await request('disputes', { method: 'POST', body: 'not-json' })).status, 400);
    assert.equal(
      (await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } }))
        .status,
      403,
    );
  });
  await t.test('logout revokes the server session', async () => {
    assert.equal((await request('auth/logout', { method: 'POST' })).status, 200);
    assert.equal((await request('auth/me')).status, 401);
  });
});
