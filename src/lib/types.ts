export type Role = 'buyer' | 'vendor' | 'admin';
export type User = { id: string; name: string; email: string; role: Role; shop_name?: string };
export const reasons = {
  damaged: 'Item arrived damaged',
  not_as_described: 'Not as described',
  not_delivered: 'Order not delivered',
  missing_items: 'Missing items',
  other: 'Other issue',
} as const;
export type Reason = keyof typeof reasons;
export type Status = 'open' | 'awaiting_vendor' | 'under_review' | 'resolved' | 'rejected';
export const statusLabels: Record<Status, string> = {
  open: 'Open',
  awaiting_vendor: 'Awaiting vendor',
  under_review: 'Under review',
  resolved: 'Resolved',
  rejected: 'Declined',
};
export type Order = {
  id: string;
  reference: string;
  buyer_id: string;
  vendor_id: string;
  status: string;
  total_cents: number;
  currency: string;
  delivered_at: string | null;
  created_at: string;
  shop_name: string;
  buyer_name: string;
  items: { product_name: string; category: string; quantity: number; unit_price_cents: number }[];
  dispute_id: string | null;
  dispute_status: Status | null;
  payment_status: string;
  refunded_cents: number;
};
export type Dispute = {
  id: string;
  reference: string;
  order_id: string;
  title: string;
  description: string;
  reason: Reason;
  status: Status;
  priority: 'normal' | 'high';
  requested_cents: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  order_reference: string;
  total_cents: number;
  buyer_name: string;
  shop_name: string;
  refund_cents: number;
  refund_status: string | null;
  age_hours: number;
};
export type Message = {
  _id: string;
  disputeId: string;
  authorId: string;
  authorName: string;
  role: Role;
  body: string;
  createdAt: string;
};
export type Evidence = {
  _id: string;
  disputeId: string;
  filename: string;
  mime: string;
  size: number;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
};
export type AuditEvent = {
  id: string;
  event_type: string;
  actor_name: string;
  detail: Record<string, unknown>;
  created_at: string;
};
export type Refund = {
  id: string;
  reference: string;
  dispute_id: string;
  dispute_reference: string;
  order_reference: string;
  buyer_name: string;
  shop_name: string;
  amount_cents: number;
  status: string;
  created_at: string;
  completed_at: string | null;
};
export type Overview = {
  disputes: Dispute[];
  orders: Order[];
  refunds: Refund[];
  stats: {
    total: number;
    active: number;
    resolved: number;
    refunded: number;
    averageHours: number;
  };
  categories: { reason: Reason; count: number }[];
  syncPending: number;
  user: User;
};
