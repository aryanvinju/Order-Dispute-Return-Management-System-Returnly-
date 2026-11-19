import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertOpen, assertRefund, disputeSchema, resolutionSchema } from '../src/lib/domain';
import { hashPassword, verifyPassword } from '../src/lib/auth';
test('partial and full refund amounts are allowed within captured funds', () => {
  assert.doesNotThrow(() => assertRefund(500, 1000, 1000));
  assert.doesNotThrow(() => assertRefund(1000, 1000, 1000));
});
test('refund limits reject zero, negative, fractional, excess and non-finite values', () => {
  for (const amount of [0, -1, 1.2, 1001, NaN, Infinity])
    assert.throws(() => assertRefund(amount, 1000, 1000));
  assert.throws(() => assertRefund(700, 1000, 500));
});
test('terminal disputes cannot be changed', () => {
  for (const state of ['resolved', 'rejected']) assert.throws(() => assertOpen(state));
  for (const state of ['open', 'awaiting_vendor', 'under_review'])
    assert.doesNotThrow(() => assertOpen(state));
});
test('a declined dispute cannot carry money', () => {
  assert.equal(
    resolutionSchema.safeParse({
      decision: 'reject',
      amountCents: 100,
      note: 'A clear reason for declining.',
    }).success,
    false,
  );
  assert.equal(
    resolutionSchema.safeParse({
      decision: 'reject',
      amountCents: 0,
      note: 'A clear reason for declining.',
    }).success,
    true,
  );
});
test('approval needs a positive amount and an explanatory note', () => {
  assert.equal(
    resolutionSchema.safeParse({ decision: 'approve', amountCents: 0, note: 'Approved refund.' })
      .success,
    false,
  );
  assert.equal(
    resolutionSchema.safeParse({ decision: 'approve', amountCents: 100, note: 'ok' }).success,
    false,
  );
});
test('disputes reject malformed references, unknown categories, and short descriptions', () => {
  assert.equal(
    disputeSchema.safeParse({
      orderId: 'not-a-uuid',
      title: 'Issue',
      reason: 'random',
      description: 'bad',
      requestedCents: 1,
    }).success,
    false,
  );
});
test('password hashes use independent salts and do not accept wrong passwords', () => {
  const a = hashPassword('ExamplePassword!');
  const b = hashPassword('ExamplePassword!');
  assert.notEqual(a, b);
  assert.equal(verifyPassword('ExamplePassword!', a), true);
  assert.equal(verifyPassword('wrong-password', a), false);
  assert.equal(verifyPassword('anything', 'invalid'), false);
});
