import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { PoolConnection } from 'mysql2/promise';
import { rows, execute, transaction, sql, mongo, bucket } from './db';
import {
  AppError,
  assertOpen,
  assertRefund,
  disputeSchema,
  messageSchema,
  resolutionSchema,
} from './domain';
import type {
  User,
  Dispute,
  Order,
  Refund,
  Message,
  Evidence,
  AuditEvent,
  Overview,
  Reason,
} from './types';

const reference = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
function scope(user: User, alias = 'o') {
  return user.role === 'admin'
    ? { query: '1=1', values: [] }
    : user.role === 'buyer'
      ? { query: `${alias}.buyer_id=?`, values: [user.id] }
      : { query: 'v.user_id=?', values: [user.id] };
}
const detailQuery = `SELECT d.*,o.reference AS order_reference,o.total_cents,u.name AS buyer_name,v.shop_name,
  COALESCE(r.amount_cents,0) AS refund_cents,r.status AS refund_status,
  TIMESTAMPDIFF(HOUR,d.created_at,COALESCE(d.resolved_at,UTC_TIMESTAMP())) AS age_hours
  FROM disputes d JOIN orders o ON o.id=d.order_id JOIN vendors v ON v.id=o.vendor_id
  JOIN users u ON u.id=o.buyer_id LEFT JOIN refunds r ON r.dispute_id=d.id`;
export async function accessibleDispute(user: User, id: string, c?: PoolConnection, lock = false) {
  const s = scope(user);
  // Lock the dispute alone: MySQL cannot lock a nullable side of an outer join.
  if (lock && c) await rows('SELECT id FROM disputes WHERE id=? FOR UPDATE', [id], c);
  const [d] = await rows<Dispute>(
    `${detailQuery} WHERE d.id=? AND ${s.query}`,
    [id, ...s.values],
    c,
  );
  if (!d) throw new AppError(404, 'Dispute not found.');
  return d;
}
async function audit(
  c: PoolConnection,
  disputeId: string,
  actor: User,
  type: string,
  detail: Record<string, unknown> = {},
) {
  await execute(
    'INSERT INTO dispute_events(id,dispute_id,actor_id,event_type,detail) VALUES(?,?,?,?,?)',
    [randomUUID(), disputeId, actor.id, type, JSON.stringify(detail)],
    c,
  );
}
async function enqueue(
  c: PoolConnection,
  disputeId: string,
  payload: Record<string, unknown> = { kind: 'projection' },
) {
  await execute(
    'INSERT INTO outbox(id,dispute_id,payload) VALUES(?,?,?)',
    [randomUUID(), disputeId, JSON.stringify(payload)],
    c,
  );
}
export async function syncOutbox() {
  const c = await sql().getConnection();
  let acquired = false;
  const lockName = `returnly_sync_${process.env.MYSQL_DATABASE || 'returnly'}`.slice(0, 64);
  try {
    const [lock] = await rows<{ ok: number }>('SELECT GET_LOCK(?,0) AS ok', [lockName], c);
    if (!lock?.ok) return;
    acquired = true;
    const db = await mongo();
    const events = await rows<{
      id: string;
      dispute_id: string;
      payload: { kind: string; message?: Record<string, unknown> } | string;
    }>(
      'SELECT id,dispute_id,payload FROM outbox WHERE processed_at IS NULL ORDER BY created_at,id LIMIT 100',
      [],
      c,
    );
    for (const event of events) {
      try {
        const payload =
          typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (payload.kind === 'message')
          await db
            .collection('messages')
            .updateOne(
              { _id: payload.message._id },
              { $setOnInsert: payload.message },
              { upsert: true },
            );
        const [projection] = await rows<{
          id: string;
          reason: Reason;
          status: string;
          buyerId: string;
          vendorUserId: string;
          createdAt: string;
        }>(
          `SELECT d.id,d.reason,d.status,o.buyer_id AS buyerId,v.user_id AS vendorUserId,d.created_at AS createdAt FROM disputes d JOIN orders o ON o.id=d.order_id JOIN vendors v ON v.id=o.vendor_id WHERE d.id=?`,
          [event.dispute_id],
          c,
        );
        // Read the authoritative SQL row; never replay a stale status snapshot.
        if (projection)
          await db
            .collection('disputeSummaries')
            .updateOne({ _id: projection.id as never }, { $set: projection }, { upsert: true });
        await execute(
          'UPDATE outbox SET processed_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=?',
          [event.id],
          c,
        );
      } catch {
        await execute(
          "UPDATE outbox SET attempts=attempts+1,last_error='MongoDB delivery failed; safe to retry' WHERE id=?",
          [event.id],
          c,
        );
        break;
      }
    }
  } finally {
    if (acquired) await c.query('SELECT RELEASE_LOCK(?)', [lockName]);
    c.release();
  }
}
export async function safelySync() {
  try {
    await syncOutbox();
  } catch {
    /* Durable SQL outbox retains pending work. */
  }
}

export async function overview(user: User): Promise<Overview> {
  await safelySync();
  const s = scope(user);
  const vs =
    user.role === 'admin'
      ? { query: '1=1', values: [] }
      : user.role === 'buyer'
        ? { query: 'buyer_id=?', values: [user.id] }
        : { query: 'vendor_user_id=?', values: [user.id] };
  const disputes = await rows<Dispute>(
    `SELECT * FROM admin_dispute_dashboard WHERE ${vs.query} ORDER BY created_at DESC`,
    vs.values,
  );
  const orders = await rows<Order>(
    `SELECT o.*,v.shop_name,u.name AS buyer_name,d.id AS dispute_id,d.status AS dispute_status,p.status AS payment_status,p.refunded_cents
    FROM orders o JOIN vendors v ON v.id=o.vendor_id JOIN users u ON u.id=o.buyer_id
    JOIN payments p ON p.order_id=o.id LEFT JOIN disputes d ON d.order_id=o.id WHERE ${s.query} ORDER BY o.created_at DESC`,
    s.values,
  );
  if (orders.length) {
    const items = await rows<Order['items'][number] & { order_id: string }>(
      `SELECT order_id,product_name,category,quantity,unit_price_cents FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')})`,
      orders.map((o) => o.id),
    );
    for (const order of orders) order.items = items.filter((item) => item.order_id === order.id);
  }
  const refunds = await rows<Refund>(
    `SELECT r.*,d.reference AS dispute_reference,o.reference AS order_reference,u.name AS buyer_name,v.shop_name
    FROM refunds r JOIN disputes d ON d.id=r.dispute_id JOIN orders o ON o.id=d.order_id
    JOIN vendors v ON v.id=o.vendor_id JOIN users u ON u.id=o.buyer_id WHERE ${s.query} ORDER BY r.created_at DESC`,
    s.values,
  );
  let categories: { reason: Reason; count: number }[] = [];
  try {
    const match =
      user.role === 'admin'
        ? {}
        : user.role === 'buyer'
          ? { buyerId: user.id }
          : { vendorUserId: user.id };
    categories = await (
      await mongo()
    )
      .collection('disputeSummaries')
      .aggregate<{ reason: Reason; count: number }>([
        { $match: match },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $project: { _id: 0, reason: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();
  } catch {
    /* SQL dashboards remain available; pending sync is visible. */
  }
  const [pending] = await rows<{ count: number }>(
    `SELECT COUNT(*) AS count FROM outbox x JOIN disputes d ON d.id=x.dispute_id
     JOIN orders o ON o.id=d.order_id JOIN vendors v ON v.id=o.vendor_id
     WHERE x.processed_at IS NULL AND ${s.query}`,
    s.values,
  );
  const closed = disputes.filter((d) => ['resolved', 'rejected'].includes(d.status));
  return {
    user,
    disputes,
    orders,
    refunds,
    categories,
    syncPending: pending.count,
    stats: {
      total: disputes.length,
      active: disputes.length - closed.length,
      resolved: closed.length,
      refunded: refunds.reduce((s, r) => s + r.amount_cents, 0),
      averageHours: closed.length
        ? Math.round(closed.reduce((s, d) => s + d.age_hours, 0) / closed.length)
        : 0,
    },
  };
}
export async function disputeDetail(user: User, id: string) {
  const dispute = await accessibleDispute(user, id);
  await safelySync();
  const db = await mongo();
  const messages = await db
    .collection('messages')
    .find({ disputeId: id })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const evidence = await db
    .collection('evidence')
    .find({ disputeId: id })
    .sort({ createdAt: 1 })
    .project({ fileId: 0 })
    .toArray();
  const events = await rows<AuditEvent>(
    `SELECT e.*,u.name AS actor_name FROM dispute_events e JOIN users u ON u.id=e.actor_id WHERE dispute_id=? ORDER BY e.created_at,e.id`,
    [id],
  );
  return {
    dispute,
    messages: messages as unknown as Message[],
    evidence: evidence.map((e) => ({ ...e, _id: e._id.toString() })) as unknown as Evidence[],
    events,
  };
}
export async function createDispute(user: User, input: unknown) {
  if (user.role !== 'buyer') throw new AppError(403, 'Only buyers can open a dispute.');
  const data = disputeSchema.parse(input),
    id = randomUUID();
  await transaction(async (c) => {
    const [order] = await rows<{ total_cents: number; status: string }>(
      'SELECT total_cents,status FROM orders WHERE id=? AND buyer_id=? FOR UPDATE',
      [data.orderId, user.id],
      c,
    );
    if (!order) throw new AppError(404, 'Order not found.');
    if (order.status === 'cancelled')
      throw new AppError(400, 'Cancelled orders cannot be disputed.');
    if (data.reason !== 'not_delivered' && order.status !== 'delivered')
      throw new AppError(400, 'This issue can only be raised for a delivered order.');
    if (data.requestedCents > order.total_cents)
      throw new AppError(400, 'Requested refund exceeds the order total.');
    if ((await rows('SELECT id FROM disputes WHERE order_id=?', [data.orderId], c)).length)
      throw new AppError(409, 'This order already has a dispute. Open its existing case.');
    await execute(
      'INSERT INTO disputes(id,reference,order_id,reason,title,description,requested_cents) VALUES(?,?,?,?,?,?,?)',
      [
        id,
        reference('DSP'),
        data.orderId,
        data.reason,
        data.title,
        data.description,
        data.requestedCents,
      ],
      c,
    );
    await audit(c, id, user, 'dispute_opened', { reason: data.reason });
    await enqueue(c, id);
  });
  await safelySync();
  return { id };
}
export async function addMessage(user: User, id: string, input: unknown) {
  const { body } = messageSchema.parse(input);
  await transaction(async (c) => {
    const dispute = await accessibleDispute(user, id, c, true);
    assertOpen(dispute.status);
    const message = {
      _id: randomUUID(),
      disputeId: id,
      authorId: user.id,
      authorName: user.name,
      role: user.role,
      body,
      createdAt: new Date().toISOString(),
    };
    if (user.role === 'vendor')
      await execute("UPDATE disputes SET status='under_review' WHERE id=?", [id], c);
    else await execute('UPDATE disputes SET updated_at=UTC_TIMESTAMP() WHERE id=?', [id], c);
    await audit(c, id, user, 'message_sent');
    await enqueue(c, id, { kind: 'message', message });
  });
  await safelySync();
  return { ok: true };
}
export async function updateDispute(user: User, id: string, input: unknown) {
  if (user.role !== 'admin') throw new AppError(403, 'Only admins can manage case status.');
  const data = input as { status?: string; priority?: string };
  if (
    !data ||
    (!['awaiting_vendor', 'under_review'].includes(data.status || '') &&
      !['normal', 'high'].includes(data.priority || ''))
  )
    throw new AppError(400, 'Choose a valid review status or priority.');
  await transaction(async (c) => {
    const d = await accessibleDispute(user, id, c, true);
    assertOpen(d.status);
    if (data.status && ['awaiting_vendor', 'under_review'].includes(data.status))
      await execute('UPDATE disputes SET status=? WHERE id=?', [data.status, id], c);
    if (data.priority && ['normal', 'high'].includes(data.priority))
      await execute('UPDATE disputes SET priority=? WHERE id=?', [data.priority, id], c);
    await audit(c, id, user, 'case_updated', {
      status: data.status || d.status,
      priority: data.priority || d.priority,
    });
    await enqueue(c, id);
  });
  await safelySync();
  return { ok: true };
}
export async function resolveDispute(user: User, id: string, input: unknown) {
  if (user.role !== 'admin') throw new AppError(403, 'Only admins can resolve a dispute.');
  const data = resolutionSchema.parse(input);
  await transaction(async (c) => {
    const d = await accessibleDispute(user, id, c, true);
    assertOpen(d.status);
    const [p] = await rows<{ id: string; amount_cents: number; refunded_cents: number }>(
      'SELECT id,amount_cents,refunded_cents FROM payments WHERE order_id=? FOR UPDATE',
      [d.order_id],
      c,
    );
    if (!p) throw new AppError(409, 'The order has no captured payment.');
    if (data.decision === 'approve') {
      assertRefund(data.amountCents, d.requested_cents, p.amount_cents - p.refunded_cents);
      await c.query('CALL calculate_refund(?,?,@refund_amount)', [p.id, data.amountCents]);
      const [result] = await rows<{ amount: number }>('SELECT @refund_amount AS amount', [], c);
      await execute(
        'INSERT INTO refunds(id,reference,dispute_id,payment_id,amount_cents,processed_by) VALUES(?,?,?,?,?,?)',
        [randomUUID(), reference('REF'), id, p.id, result.amount, user.id],
        c,
      );
      const refunded = p.refunded_cents + result.amount;
      await execute(
        'UPDATE payments SET refunded_cents=?,status=? WHERE id=?',
        [refunded, refunded === p.amount_cents ? 'refunded' : 'partially_refunded', p.id],
        c,
      );
    }
    await execute(
      'UPDATE disputes SET status=?,resolution_note=?,resolved_by=?,resolved_at=UTC_TIMESTAMP() WHERE id=?',
      [data.decision === 'approve' ? 'resolved' : 'rejected', data.note, user.id, id],
      c,
    );
    await audit(c, id, user, data.decision === 'approve' ? 'refund_approved' : 'dispute_declined', {
      amountCents: data.amountCents,
      note: data.note,
    });
    await enqueue(c, id);
  });
  await safelySync();
  return { ok: true };
}
export async function completeRefund(user: User, id: string) {
  if (user.role !== 'admin') throw new AppError(403, 'Only admins can run the refund simulator.');
  await transaction(async (c) => {
    const [r] = await rows<{ dispute_id: string; status: string }>(
      'SELECT dispute_id,status FROM refunds WHERE id=? FOR UPDATE',
      [id],
      c,
    );
    if (!r) throw new AppError(404, 'Refund not found.');
    if (r.status === 'completed') return;
    await execute(
      "UPDATE refunds SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?",
      [id],
      c,
    );
    await audit(c, r.dispute_id, user, 'refund_completed', { simulated: true });
  });
  return { ok: true };
}
export async function uploadEvidence(user: User, id: string, file: File) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size || file.size > 5 * 1024 * 1024)
    throw new AppError(400, 'Choose a PNG, JPG or PDF file up to 5 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'image/jpeg'
      : bytes.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : null;
  if (!mime || mime !== file.type)
    throw new AppError(400, 'The file contents must match a PNG, JPG or PDF.');
  const filename = file.name.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 120) || 'evidence';
  const b = await bucket();
  const db = await mongo();
  let fileId: ObjectId | undefined;
  try {
    // Hold the case lock during upload so resolution cannot race the eligibility check.
    await transaction(async (c) => {
      const d = await accessibleDispute(user, id, c, true);
      assertOpen(d.status);
      if ((await db.collection('evidence').countDocuments({ disputeId: id })) >= 10)
        throw new AppError(400, 'A case can contain up to 10 evidence files.');
      const stream = b.openUploadStream(filename, { metadata: { disputeId: id, mime } });
      fileId = stream.id;
      await new Promise<void>((resolve, reject) => {
        stream.once('finish', resolve);
        stream.once('error', reject);
        stream.end(bytes);
      });
      await db.collection('evidence').insertOne({
        disputeId: id,
        fileId,
        filename,
        mime,
        size: bytes.length,
        uploadedBy: user.id,
        uploaderName: user.name,
        createdAt: new Date().toISOString(),
      });
      await audit(c, id, user, 'evidence_uploaded', { filename });
    });
  } catch (e) {
    if (fileId) {
      await db
        .collection('evidence')
        .deleteOne({ fileId })
        .catch(() => {});
      await b.delete(fileId).catch(() => {});
    }
    throw e;
  }
  return { ok: true };
}
export async function downloadEvidence(user: User, id: string) {
  if (!ObjectId.isValid(id)) throw new AppError(404, 'Evidence not found.');
  const e = await (await mongo()).collection('evidence').findOne({ _id: new ObjectId(id) });
  if (!e) throw new AppError(404, 'Evidence not found.');
  await accessibleDispute(user, e.disputeId);
  const stream = (await bucket()).openDownloadStream(e.fileId),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), filename: e.filename as string, mime: e.mime as string };
}
