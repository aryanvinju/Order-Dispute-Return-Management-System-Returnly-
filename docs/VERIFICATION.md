# Verification record

Verified locally on 12 November 2026 using Node.js 22.19.0, Next.js 16.4.6, MySQL 8.0.46 and MongoDB 8.2. Integration testing used separately launched temporary database instances. After the local settings were supplied, schema setup and seeding also completed successfully on the installed MySQL and MongoDB services, using the configured project databases. Existing coursework databases were not changed.

## Automated checks

- `npm run typecheck` — passes.
- `npm test` — seven tests pass: integer refund limits, terminal case rules, approve/decline validation, malformed input, and independently salted password verification.
- `npm run test:integration` — thirteen database scenarios pass within one lifecycle suite: authentication, ownership, duplicate cases, thread isolation, vendor transitions, retry-safe delivery, GridFS upload/download, file-signature rejection, admin-only actions, rollback on excess refund, stored-procedure limits, simultaneous decisions, closed-case protections, idempotent payout completion, and role-scoped dashboards/aggregation. Some scenarios contain multiple assertions.
- `npm run build` — optimized production build passes.
- `npm run test:http` — six API scenarios pass: signed-out access, origin rejection, safe sign-in/cookie flags, role enforcement, malformed requests, and session revocation.
- Setup and seed — run twice against the demo database; second seed preserves existing rows.

Integration tests refuse to run unless **both** database names end in `_test`. They use randomly generated users/orders to isolate runs and retain fixtures for failure inspection. To run them yourself, point environment settings to dedicated test databases, run `npm run db:setup`, then `npm run test:integration`. Never give tests the usual demonstration database names.

Example PowerShell setup, after supplying your normal MySQL credentials in `.env`:

```powershell
$env:MYSQL_DATABASE='returnly_test'
$env:MONGODB_DATABASE='returnly_test'
npm run db:setup
npm run test:integration
Remove-Item Env:MYSQL_DATABASE, Env:MONGODB_DATABASE
```

## Browser checks

The development preview was checked at desktop and mobile sizes. The verification covered demo sign-in, dashboard counts, queue search and filters, case details, partial-refund review/confirmation, refund status, buyer creation and vendor replies. A narrow viewport uses the mobile navigation drawer; wide tables scroll within their panels.

## Practical limits

- This is a local college project, with no hosted deployment or payment provider integration.
- The installed local database connection was verified after credentials were supplied in the ignored `.env` file. That private settings file is intentionally excluded from the source archive; configure it separately when copying the project.
- Category/message delivery is request-driven or explicitly retried through `db:sync`; there is no always-running worker. A batch processes up to 100 pending events.
- Financial operations are ACID in MySQL. There is no distributed ACID transaction across MongoDB. Evidence uploads have best-effort compensation and may need orphan reconciliation after a process crash.
- Uploads check signatures and limits; there is no antivirus or PDF content scanning. A public service needs those controls and a reverse-proxy request limit.
- Orders and payments are seeded; no catalog, checkout, fulfillment tracking, public registration, email service or appeal workflow is included.
- Administrative audit records are append-only through the application, but not tamper-proof against a privileged database administrator.
- Data retention, backup/recovery, high-availability deployment, pagination at the database layer, full observability and production load testing are not part of this local submission. The interface paginates the dispute list; the overview loads the scoped dataset.
