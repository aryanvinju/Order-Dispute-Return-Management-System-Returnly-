import '../scripts/env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rows, execute, sql, mongo, closeDatabases } from '../src/lib/db';
import { hashPassword, login } from '../src/lib/auth';
import * as service from '../src/lib/service';
import type { User } from '../src/lib/types';
// Never run integration mutations against a demonstration or a shared database.
if (
  !process.env.MYSQL_DATABASE?.endsWith('_test') ||
  !process.env.MONGODB_DATABASE?.endsWith('_test')
) {
  throw Error(
    'Integration tests require MYSQL_DATABASE and MONGODB_DATABASE ending in _test. Apply db:setup to those isolated databases first.',
  );
}
test('real MySQL + MongoDB case lifecycle, isolation, rollback and concurrent refunds', async (t) => {
  const makeUser = (role: User['role']): User => ({
    id: randomUUID(),
    name: `Test ${role}`,
    email: `${randomUUID()}@integration.test`,
    role,
  });
  const buyer = makeUser('buyer'),
    stranger = makeUser('buyer'),
    vendor = makeUser('vendor'),
    outsider = makeUser('vendor'),
    admin = makeUser('admin');
  const users = [buyer, stranger, vendor, outsider, admin],
    vendorId = randomUUID(),
    orderId = randomUUID();
  let id = '';
  try {
    for (const u of users)
      await execute('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)', [
        u.id,
        u.name,
        u.email,
        hashPassword('IntegrationPass123!'),
        u.role,
      ]);
    await execute('INSERT INTO vendors(id,user_id,shop_name) VALUES(?,?,?)', [
      vendorId,
      vendor.id,
      'Integration shop',
    ]);
    await execute(
      'INSERT INTO orders(id,reference,buyer_id,vendor_id,total_cents,delivered_at) VALUES(?,?,?,?,10000,UTC_TIMESTAMP())',
      [orderId, `TEST-${randomUUID().slice(0, 8)}`, buyer.id, vendorId],
    );
    await execute(
      'INSERT INTO order_items(id,order_id,product_name,category,quantity,unit_price_cents) VALUES(?,?,?,?,1,10000)',
      [randomUUID(), orderId, 'Test product', 'Tests'],
    );
    await execute('INSERT INTO payments(id,order_id,amount_cents) VALUES(?,?,10000)', [
      randomUUID(),
      orderId,
    ]);
    const request = {
      orderId,
      reason: 'damaged',
      title: 'Damaged integration order',
      description: 'The item arrived with visible damage and cannot be used.',
      requestedCents: 10000,
    };
    await t.test(
      'authentication accepts the correct password and rejects a wrong one',
      async () => {
        assert.equal((await login(buyer.email, 'IntegrationPass123!')).user.id, buyer.id);
        await assert.rejects(() => login(buyer.email, 'wrong'));
      },
    );
    await t.test('orders cannot be disputed by another buyer or a vendor', async () => {
      await assert.rejects(() => service.createDispute(stranger, request), /not found/i);
      await assert.rejects(() => service.createDispute(vendor, request), /only buyers/i);
    });
    await t.test('create a dispute and enforce one case per order', async () => {
      id = (await service.createDispute(buyer, request)).id;
      await assert.rejects(() => service.createDispute(buyer, request), /already has a dispute/i);
    });
    await t.test('unrelated buyers and vendors cannot read or write the thread', async () => {
      for (const u of [stranger, outsider]) {
        await assert.rejects(() => service.disputeDetail(u, id), /not found/i);
        await assert.rejects(
          () => service.addMessage(u, id, { body: 'Not authorized' }),
          /not found/i,
        );
      }
    });
    await t.test('vendor replies transition to review and deliver to MongoDB once', async () => {
      await service.addMessage(vendor, id, {
        body: 'We confirm the damage. Please approve the refund.',
      });
      await service.syncOutbox();
      await service.syncOutbox();
      const detail = await service.disputeDetail(buyer, id);
      assert.equal(detail.dispute.status, 'under_review');
      assert.equal(detail.messages.length, 1);
    });
    await t.test('real evidence bytes persist in GridFS with access control', async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvbkAAAAASUVORK5CYII=',
        'base64',
      );
      await service.uploadEvidence(
        buyer,
        id,
        new File([png], 'evidence.png', { type: 'image/png' }),
      );
      const d = await service.disputeDetail(vendor, id);
      assert.equal(d.evidence.length, 1);
      const file = await service.downloadEvidence(admin, d.evidence[0]._id);
      assert.deepEqual(file.bytes, png);
      await assert.rejects(
        () => service.downloadEvidence(stranger, d.evidence[0]._id),
        /not found/i,
      );
      await assert.rejects(
        () =>
          service.uploadEvidence(
            buyer,
            id,
            new File(['<script>bad</script>'], 'bad.png', { type: 'image/png' }),
          ),
        /contents/i,
      );
    });
    await t.test('non-admins cannot change status or resolve cases', async () => {
      await assert.rejects(
        () =>
          service.resolveDispute(buyer, id, {
            decision: 'approve',
            amountCents: 10000,
            note: 'Approve the whole request.',
          }),
        /only admins/i,
      );
      await assert.rejects(
        () => service.updateDispute(vendor, id, { priority: 'high' }),
        /only admins/i,
      );
    });
    await t.test('excessive refunds leave all three SQL records unchanged', async () => {
      await assert.rejects(() =>
        service.resolveDispute(admin, id, {
          decision: 'approve',
          amountCents: 10001,
          note: 'This should fail and roll back.',
        }),
      );
      assert.equal(
        (await rows<{ status: string }>('SELECT status FROM disputes WHERE id=?', [id]))[0].status,
        'under_review',
      );
      assert.equal(
        (
          await rows<{ refunded_cents: number }>(
            'SELECT refunded_cents FROM payments WHERE order_id=?',
            [orderId],
          )
        )[0].refunded_cents,
        0,
      );
      assert.equal((await rows('SELECT id FROM refunds WHERE dispute_id=?', [id])).length, 0);
    });
    await t.test('stored procedure rejects invalid remaining-payment amounts', async () => {
      const c = await sql().getConnection();
      try {
        const [p] = await rows<{ id: string }>(
          'SELECT id FROM payments WHERE order_id=?',
          [orderId],
          c,
        );
        await assert.rejects(() => c.query('CALL calculate_refund(?,?,@amount)', [p.id, 10001]));
      } finally {
        c.release();
      }
    });
    await t.test('concurrent admin decisions create exactly one partial refund', async () => {
      const results = await Promise.allSettled([
        service.resolveDispute(admin, id, {
          decision: 'approve',
          amountCents: 6500,
          note: 'Partial refund after reviewing both sides.',
        }),
        service.resolveDispute(admin, id, {
          decision: 'approve',
          amountCents: 6500,
          note: 'A simultaneous decision must not duplicate it.',
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const refunds = await rows<{ amount_cents: number }>(
        'SELECT amount_cents FROM refunds WHERE dispute_id=?',
        [id],
      );
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].amount_cents, 6500);
      const [p] = await rows<{ refunded_cents: number; status: string }>(
        'SELECT refunded_cents,status FROM payments WHERE order_id=?',
        [orderId],
      );
      assert.equal(p.refunded_cents, 6500);
      assert.equal(p.status, 'partially_refunded');
    });
    await t.test('closed cases reject new messages and repeat resolutions', async () => {
      await assert.rejects(() => service.addMessage(vendor, id, { body: 'Too late' }), /closed/i);
      await assert.rejects(
        () =>
          service.resolveDispute(admin, id, {
            decision: 'reject',
            amountCents: 0,
            note: 'Another decision is not allowed.',
          }),
        /closed/i,
      );
    });
    await t.test('payout completion is idempotent and cannot be run by buyers', async () => {
      const [r] = await rows<{ id: string }>('SELECT id FROM refunds WHERE dispute_id=?', [id]);
      await assert.rejects(() => service.completeRefund(buyer, r.id), /only admins/i);
      await service.completeRefund(admin, r.id);
      await service.completeRefund(admin, r.id);
      assert.equal(
        (await rows<{ status: string }>('SELECT status FROM refunds WHERE id=?', [r.id]))[0].status,
        'completed',
      );
      assert.equal(
        (
          await rows('SELECT id FROM dispute_events WHERE dispute_id=? AND event_type=?', [
            id,
            'refund_completed',
          ])
        ).length,
        1,
      );
    });
    await t.test('dashboard view and Mongo aggregation respect role scope', async () => {
      const a = await service.overview(buyer),
        b = await service.overview(stranger);
      assert.equal(a.disputes.length, 1);
      assert.equal(a.categories.find((c) => c.reason === 'damaged')?.count, 1);
      assert.equal(b.disputes.length, 0);
      assert.equal(b.orders.length, 0);
      assert.equal(b.refunds.length, 0);
      assert.equal(b.categories.length, 0);
    });
  } finally {
    // The entire database is isolated by name. Keep fixtures for inspecting failures;
    // subsequent runs generate distinct IDs and have their own scoped assertions.
    await closeDatabases();
  }
});
