import './env';
import { randomUUID } from 'node:crypto';
import { execute, rows, transaction, closeDatabases } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { syncOutbox, resolveDispute, completeRefund } from '../src/lib/service';
import type { User, Reason } from '../src/lib/types';
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const demoUsers: User[] = [
  { id: uid(1), name: 'Aryan Vinju', email: 'buyer@demo.returnly.test', role: 'buyer' },
  { id: uid(2), name: 'Neha Rao', email: 'buyer2@demo.returnly.test', role: 'buyer' },
  { id: uid(3), name: 'Aditya Shetty', email: 'vendor@demo.returnly.test', role: 'vendor' },
  { id: uid(4), name: 'Mira Shah', email: 'vendor2@demo.returnly.test', role: 'vendor' },
  { id: uid(5), name: 'Alex Morgan', email: 'admin@demo.returnly.test', role: 'admin' },
];
const products = [
  [
    'Studio wireless headphones',
    'Electronics',
    499900,
    0,
    'damaged',
    'Left earcup arrived cracked',
    'The packaging was dented and the left earcup has a visible crack. The headphones do not turn on.',
  ],
  [
    'Everyday canvas backpack',
    'Accessories',
    189900,
    1,
    'not_as_described',
    'Received a different backpack',
    'The listing shows a navy canvas backpack, but the item received is black nylon with different pockets.',
  ],
  [
    'Ceramic pour-over set',
    'Home & living',
    249900,
    0,
    'missing_items',
    'Coffee dripper missing from the set',
    'The box contained the carafe and filters, but the ceramic dripper listed in the set was missing.',
  ],
  [
    'Mechanical keyboard · Slate',
    'Electronics',
    649900,
    1,
    'not_delivered',
    'Order marked delivered but not received',
    'The order is marked delivered. I checked with reception and my neighbours, but nobody received it.',
  ],
  [
    'Linen desk organizer',
    'Home & living',
    129900,
    0,
    'damaged',
    'Organizer arrived with torn lining',
    'The inner lining was torn when I opened the sealed box. Please help arrange a fair refund.',
  ],
  [
    'Travel insulated bottle',
    'Lifestyle',
    159900,
    1,
    'other',
    'Bottle lid does not seal properly',
    'The bottle leaks through the lid when tilted, even when the lid is closed firmly.',
  ],
  [
    'Minimal wall clock',
    'Home & living',
    219900,
    0,
    'damaged',
    'Clock glass arrived shattered',
    'The clock glass was broken on arrival and there are loose shards inside the packaging.',
  ],
  [
    'Everyday cotton tote',
    'Accessories',
    79900,
    1,
    'not_as_described',
    'Tote colour differs from the listing',
    'The colour looks slightly warmer in daylight. I would like the case reviewed against the listing.',
  ],
  ['Portable desk lamp', 'Electronics', 329900, 0, null, null, null],
  ['Soft-knit throw blanket', 'Home & living', 289900, 1, null, null, null],
  ['Compact travel pouch', 'Accessories', 99900, 0, null, null, null],
  ['USB-C charging dock', 'Electronics', 379900, 1, null, null, null],
] as const;
async function main() {
  const password = process.env.DEMO_PASSWORD || 'DemoPass123!';
  for (const user of demoUsers)
    await execute('INSERT IGNORE INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)', [
      user.id,
      user.name,
      user.email,
      hashPassword(password),
      user.role,
    ]);
  await execute('INSERT IGNORE INTO vendors(id,user_id,shop_name) VALUES(?,?,?),(?,?,?)', [
    uid(10),
    uid(3),
    'Form & Field',
    uid(11),
    uid(4),
    'Northstar Supply',
  ]);
  for (const [i, p] of products.entries()) {
    const orderId = uid(100 + i),
      disputeId = uid(200 + i),
      buyerId = uid(i % 3 === 0 ? 2 : 1);
    const exists = (await rows('SELECT id FROM orders WHERE id=?', [orderId])).length;
    if (exists) continue;
    await transaction(async (c) => {
      await execute(
        'INSERT INTO orders(id,reference,buyer_id,vendor_id,total_cents,delivered_at,created_at) VALUES(?,?,?,?,?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY))',
        [orderId, `ORD-2026-${1042 + i}`, buyerId, uid(10 + p[3]), p[2], i + 1, i + 4],
        c,
      );
      await execute(
        'INSERT INTO order_items(id,order_id,product_name,category,quantity,unit_price_cents) VALUES(?,?,?,?,1,?)',
        [uid(300 + i), orderId, p[0], p[1], p[2]],
        c,
      );
      await execute(
        'INSERT INTO payments(id,order_id,amount_cents) VALUES(?,?,?)',
        [uid(400 + i), orderId, p[2]],
        c,
      );
      if (p[4]) {
        const status =
          i === 0 || i === 3 ? 'awaiting_vendor' : i === 1 || i === 2 ? 'under_review' : 'open';
        await execute(
          'INSERT INTO disputes(id,reference,order_id,reason,title,description,status,priority,requested_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? HOUR),DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? HOUR))',
          [
            disputeId,
            `DSP-${String(1028 + i)}`,
            orderId,
            p[4],
            p[5],
            p[6],
            status,
            i === 0 || i === 3 ? 'high' : 'normal',
            p[2],
            (i + 1) * 7,
            (i + 1) * 3,
          ],
          c,
        );
        await execute(
          "INSERT INTO dispute_events(id,dispute_id,actor_id,event_type,detail,created_at) VALUES(?,?,?,'dispute_opened',?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? HOUR))",
          [randomUUID(), disputeId, buyerId, JSON.stringify({ reason: p[4] }), (i + 1) * 7],
          c,
        );
        await execute(
          'INSERT INTO outbox(id,dispute_id,payload) VALUES(?,?,?)',
          [randomUUID(), disputeId, JSON.stringify({ kind: 'projection' })],
          c,
        );
        if (i === 1 || i === 2) {
          const vendor = demoUsers[p[3] === 0 ? 2 : 3];
          const message = {
            _id: uid(500 + i),
            disputeId,
            authorId: vendor.id,
            authorName: vendor.name,
            role: 'vendor',
            body:
              i === 1
                ? 'Thank you for flagging this. We checked the dispatch record and can confirm a packing mix-up. We support a full refund.'
                : 'We are checking the packing checklist. Please share a photo of everything included in the box so we can help.',
            createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
          };
          await execute(
            'INSERT INTO outbox(id,dispute_id,payload) VALUES(?,?,?)',
            [randomUUID(), disputeId, JSON.stringify({ kind: 'message', message })],
            c,
          );
        }
      }
    });
    if (i >= 4 && i <= 7) {
      await resolveDispute(demoUsers[4], disputeId, {
        decision: i === 7 ? 'reject' : 'approve',
        amountCents: i === 7 ? 0 : i === 5 ? 79900 : p[2],
        note:
          i === 7
            ? 'The supplied details match the listing. A refund is not supported by the available information.'
            : 'Reviewed the order and vendor response. The evidence supports this refund. Payment processing is simulated.',
      });
      if (i === 4 || i === 6) {
        const [r] = await rows<{ id: string }>('SELECT id FROM refunds WHERE dispute_id=?', [
          disputeId,
        ]);
        await completeRefund(demoUsers[4], r.id);
      }
    }
  }
  await syncOutbox();
  console.log('Demo data ready: 5 users, 2 vendors, 12 orders, 8 disputes and 3 refunds.');
  console.log(
    'Primary accounts: buyer@demo.returnly.test / vendor@demo.returnly.test / admin@demo.returnly.test',
  );
  console.log(
    'Use the DEMO_PASSWORD configured in .env (default documented in README). Reruns preserve existing cases.',
  );
}
main()
  .catch((e) => {
    console.error('Seed failed:', e instanceof Error ? e.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(closeDatabases);
