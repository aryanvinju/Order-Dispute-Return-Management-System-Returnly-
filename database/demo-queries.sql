-- Run against the dedicated Returnly project database after setup and seed.
USE returnly;

-- 1. View: open and closed cases, with joined buyer/vendor/refund data.
SELECT reference, buyer_name, shop_name, status, requested_cents / 100 AS requested_inr,
       refund_cents / 100 AS refund_inr, age_hours
FROM admin_dispute_dashboard ORDER BY created_at DESC;

-- 2. GROUP BY, CASE and aggregate functions.
SELECT shop_name, COUNT(*) AS cases,
       SUM(CASE WHEN status IN ('resolved', 'rejected') THEN 1 ELSE 0 END) AS closed_cases,
       ROUND(AVG(age_hours), 1) AS average_age_hours
FROM admin_dispute_dashboard GROUP BY shop_name;

-- 3. Correlated subquery: vendors with more than one dispute.
SELECT v.shop_name FROM vendors v
WHERE (SELECT COUNT(*) FROM disputes d JOIN orders o ON o.id=d.order_id WHERE o.vendor_id=v.id)>1;

-- 4. HAVING: categories with repeated issues.
SELECT reason, COUNT(*) AS cases FROM disputes GROUP BY reason HAVING COUNT(*)>1;

-- 5. CTE and window function: cases ranked by age within each vendor.
WITH ranked AS (
  SELECT reference, shop_name, age_hours,
         ROW_NUMBER() OVER (PARTITION BY shop_name ORDER BY age_hours DESC) AS age_rank
  FROM admin_dispute_dashboard WHERE status NOT IN ('resolved','rejected')
)
SELECT * FROM ranked WHERE age_rank <= 2;

-- 6. LEFT JOIN: eligible orders without any existing case.
SELECT o.reference, u.name AS buyer, o.total_cents/100 AS total_inr
FROM orders o JOIN users u ON u.id=o.buyer_id
LEFT JOIN disputes d ON d.order_id=o.id
WHERE d.id IS NULL AND o.status <> 'cancelled';

-- 7. Stored procedure: validate a partial refund without changing any data.
SET @payment_id=(SELECT p.id FROM payments p JOIN orders o ON o.id=p.order_id
                 WHERE o.reference='ORD-2026-1050' LIMIT 1);
CALL calculate_refund(@payment_id, 50000, @refund_amount);
SELECT @refund_amount/100 AS calculated_refund_inr;

-- 8. Reconciliation: should return no inconsistent reserved balances.
SELECT p.id, p.refunded_cents, COALESCE(SUM(r.amount_cents),0) AS approved_cents
FROM payments p LEFT JOIN refunds r ON r.payment_id=p.id
GROUP BY p.id,p.refunded_cents HAVING p.refunded_cents<>COALESCE(SUM(r.amount_cents),0);

-- 9. Audit trail.
SELECT d.reference, e.event_type, u.name AS actor, e.detail, e.created_at
FROM dispute_events e JOIN disputes d ON d.id=e.dispute_id JOIN users u ON u.id=e.actor_id
ORDER BY e.created_at;

-- 10. Pending MongoDB deliveries and useful execution-plan demonstration.
SELECT id,dispute_id,attempts,created_at FROM outbox WHERE processed_at IS NULL;
EXPLAIN SELECT id,status FROM disputes WHERE status='under_review' ORDER BY created_at;
