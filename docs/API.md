# API reference

All endpoints live under `/api`. Responses are JSON except evidence downloads. The server is Node.js, not an edge runtime. Mutations require `Origin` equal to `APP_URL`; send JSON with `Content-Type: application/json` or multipart form data for uploads. Auth uses an HttpOnly session cookie.

| Method / endpoint             | Access                 | Input / result                                                                                        |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /health`                 | Public                 | Database connectivity status; returns 503 on unavailable store.                                       |
| `POST /auth/login`            | Public                 | `{email, password}` → sets session cookie, returns safe user profile.                                 |
| `POST /auth/logout`           | Signed in              | Revokes session and clears cookie.                                                                    |
| `GET /auth/me`                | Signed in              | Current user profile.                                                                                 |
| `GET /overview`               | Signed in              | Role-scoped orders, disputes, refunds, statistics and Mongo category counts.                          |
| `POST /disputes`              | Buyer                  | `{orderId, title, reason, description, requestedCents}` → `{id}` and HTTP 201.                        |
| `GET /disputes/:id`           | Case participant/admin | Dispute, thread, evidence metadata and activity timeline.                                             |
| `PATCH /disputes/:id`         | Admin                  | `{status: "awaiting_vendor"                                                                           | "under_review"}`and/or`{priority: "normal"                                           | "high"}`. |
| `POST /disputes/:id/messages` | Case participant/admin | `{body}` → message durably queued in SQL and delivered to MongoDB. Vendor reply moves case to review. |
| `POST /disputes/:id/evidence` | Case participant/admin | Multipart `file`, PNG/JPEG/PDF ≤5 MiB.                                                                |
| `GET /evidence/:id`           | Case participant/admin | Private attachment download, case access checked.                                                     |
| `POST /disputes/:id/resolve`  | Admin                  | `{decision: "approve"                                                                                 | "reject", amountCents, note}`. Approval needs positive amount; rejection needs zero. |
| `POST /refunds/:id/complete`  | Admin                  | Idempotent simulated payout.                                                                          |
| `POST /sync`                  | Admin                  | Retry up to 100 pending outbox events.                                                                |

## Domain values

- Reasons: `damaged`, `not_as_described`, `not_delivered`, `missing_items`, `other`.
- Case statuses: `open`, `awaiting_vendor`, `under_review`, `resolved`, `rejected`.
- Refund statuses: `pending`, `completed`.
- Payment statuses: `captured`, `partially_refunded`, `refunded`.
- Amounts are integer paise, despite the historical `Cents` suffix in the API. INR 100.50 is `10050`.

## Errors

Errors use `{ "error": "Human-readable explanation" }`. Codes include 400 for invalid input, 401 for expired/missing sessions, 403 for role/origin violations, 404 for missing or inaccessible records, 409 for closed/duplicate cases, 413 for oversized requests, 429 for sign-in throttling, and 503 for unavailable/unconfigured databases. Messages are capped at 4,000 characters, dispute descriptions at 5,000, and decision notes at 2,000. This local application applies request-body caps and validates stored content; it is not a replacement for reverse-proxy limits in a hosted deployment.
