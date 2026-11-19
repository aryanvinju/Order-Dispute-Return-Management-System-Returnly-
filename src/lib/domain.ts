import { z } from 'zod';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});
export const disputeSchema = z.object({
  orderId: z.uuid(),
  title: z.string().trim().min(8).max(140),
  description: z.string().trim().min(20).max(5000),
  reason: z.enum(['damaged', 'not_as_described', 'not_delivered', 'missing_items', 'other']),
  requestedCents: z.number().int().positive().max(100000000),
});
export const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const resolutionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    amountCents: z.number().int().min(0).max(100000000),
    note: z.string().trim().min(10).max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'approve' && v.amountCents <= 0)
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a positive refund amount',
        path: ['amountCents'],
      });
    if (v.decision === 'reject' && v.amountCents !== 0)
      ctx.addIssue({
        code: 'custom',
        message: 'Declined disputes cannot have a refund',
        path: ['amountCents'],
      });
  });
export function assertOpen(status: string) {
  if (['resolved', 'rejected'].includes(status))
    throw new AppError(409, 'This dispute has already been closed.');
}
export function assertRefund(amount: number, requested: number, available: number) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > requested || amount > available)
    throw new AppError(400, 'Refund must be within the buyer’s request and the remaining payment.');
}
export function money(cents: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
