CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  role ENUM('buyer','vendor','admin') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS vendors (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL UNIQUE,
  shop_name VARCHAR(120) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY, user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key CHAR(64) PRIMARY KEY, attempts INT NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY, reference VARCHAR(24) NOT NULL UNIQUE,
  buyer_id CHAR(36) NOT NULL, vendor_id CHAR(36) NOT NULL,
  status ENUM('processing','delivered','cancelled') NOT NULL DEFAULT 'delivered',
  total_cents INT NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'INR',
  delivered_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES users(id), FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CHECK (total_cents > 0), INDEX idx_order_buyer (buyer_id, created_at), INDEX idx_order_vendor (vendor_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL,
  product_name VARCHAR(150) NOT NULL, category VARCHAR(60) NOT NULL,
  quantity INT NOT NULL, unit_price_cents INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  CHECK (quantity > 0 AND unit_price_cents > 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY, order_id CHAR(36) NOT NULL UNIQUE,
  amount_cents INT NOT NULL, refunded_cents INT NOT NULL DEFAULT 0,
  status ENUM('captured','partially_refunded','refunded') NOT NULL DEFAULT 'captured',
  method VARCHAR(40) NOT NULL DEFAULT 'Simulated UPI', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  CHECK (amount_cents > 0 AND refunded_cents >= 0 AND refunded_cents <= amount_cents)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS disputes (
  id CHAR(36) PRIMARY KEY, reference VARCHAR(24) NOT NULL UNIQUE,
  order_id CHAR(36) NOT NULL UNIQUE,
  reason ENUM('damaged','not_as_described','not_delivered','missing_items','other') NOT NULL,
  title VARCHAR(140) NOT NULL, description TEXT NOT NULL,
  status ENUM('open','awaiting_vendor','under_review','resolved','rejected') NOT NULL DEFAULT 'open',
  priority ENUM('normal','high') NOT NULL DEFAULT 'normal', requested_cents INT NOT NULL,
  resolution_note TEXT NULL, resolved_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (resolved_by) REFERENCES users(id),
  CHECK (requested_cents > 0), INDEX idx_dispute_status (status, created_at), INDEX idx_dispute_reason (reason)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS refunds (
  id CHAR(36) PRIMARY KEY, reference VARCHAR(24) NOT NULL UNIQUE,
  dispute_id CHAR(36) NOT NULL UNIQUE, payment_id CHAR(36) NOT NULL,
  amount_cents INT NOT NULL, status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
  processed_by CHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id), FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (processed_by) REFERENCES users(id), CHECK (amount_cents > 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS dispute_events (
  id CHAR(36) PRIMARY KEY, dispute_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
  event_type VARCHAR(40) NOT NULL, detail JSON NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id), FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_events_dispute (dispute_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS outbox (
  id CHAR(36) PRIMARY KEY, dispute_id CHAR(36) NOT NULL,
  payload JSON NOT NULL, attempts INT NOT NULL DEFAULT 0,
  processed_at DATETIME NULL, last_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id), INDEX idx_outbox_pending (processed_at, created_at)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW admin_dispute_dashboard AS
SELECT d.id, d.reference, d.status, d.reason, d.priority, d.title, d.requested_cents,
  d.created_at, d.updated_at, d.resolved_at, o.reference AS order_reference,
  o.total_cents, o.buyer_id, v.user_id AS vendor_user_id,
  u.name AS buyer_name, v.shop_name, COALESCE(r.amount_cents, 0) AS refund_cents,
  r.status AS refund_status,
  TIMESTAMPDIFF(HOUR, d.created_at, COALESCE(d.resolved_at, UTC_TIMESTAMP())) AS age_hours
FROM disputes d JOIN orders o ON o.id=d.order_id
JOIN users u ON u.id=o.buyer_id JOIN vendors v ON v.id=o.vendor_id
LEFT JOIN refunds r ON r.dispute_id=d.id;

-- DELIMITER is a mysql CLI directive; the setup runner sends this as one statement.
-- @statement
CREATE PROCEDURE calculate_refund(IN p_payment_id CHAR(36), IN p_requested_cents INT, OUT p_amount_cents INT)
READS SQL DATA
BEGIN
  DECLARE v_available INT DEFAULT NULL;
  SELECT amount_cents-refunded_cents INTO v_available FROM payments WHERE id=p_payment_id;
  IF v_available IS NULL OR p_requested_cents IS NULL OR p_requested_cents <= 0 OR p_requested_cents > v_available THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund must be positive and within the remaining captured payment';
  END IF;
  SET p_amount_cents = LEAST(p_requested_cents, v_available);
END;
-- @statement
