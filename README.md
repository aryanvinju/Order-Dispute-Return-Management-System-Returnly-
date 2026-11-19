# Returnly — Order Dispute & Return Management

A complete local DBMS project for Team 34: **Aditya Shetty (PES1UG24AM018)** and **Aryan Vinju (PES1UG24AM056)**.

Buyers raise order disputes, vendors respond with messages and evidence, and admins resolve cases with full or partial refunds. Next.js serves the interface and API, MySQL owns transactional business data, and MongoDB stores threads, evidence and category projections. No real money moves.

## Start on your computer

Requires **Node.js 22.19+**, **MySQL 8.0.16+**, and **MongoDB 6+**. The project was verified with Node 22.19, MySQL 8.0.46 and MongoDB 8.2.

1. Open a terminal in `C:\Users\aryan\Documents\DBMS\MINIPROJECT`.
2. Install packages if needed: `npm ci`.
3. Edit `.env`. A local configuration is already provided; replace `MYSQL_PASSWORD` with your installed MySQL password. Confirm the user and port. Do not commit this file.
4. Ensure the MySQL and MongoDB services are running.
5. Run:

   ```powershell
   npm run db:setup
   npm run db:seed
   npm run dev
   ```

6. Open **http://127.0.0.1:3000**. Use this exact address; mutation requests must match `APP_URL` in `.env`.

`db:setup` creates the named database if it does not exist, applies the schema, view and stored procedure, and creates MongoDB indexes. It needs appropriate creation privileges on first setup. It never drops an existing database. `db:seed` is safe to rerun: existing demo orders and their case history are preserved. Seed on a dedicated project database only.

If `.env` is missing, copy `.env.example` and adjust it. The example uses the optional Docker ports; your installed servers normally use **3306** and **27017**.

### Demo accounts

| Role                             | Email                        | Password       |
| -------------------------------- | ---------------------------- | -------------- |
| Buyer                            | `buyer@demo.returnly.test`   | `DemoPass123!` |
| Vendor — Form & Field            | `vendor@demo.returnly.test`  | `DemoPass123!` |
| Admin                            | `admin@demo.returnly.test`   | `DemoPass123!` |
| Second buyer                     | `buyer2@demo.returnly.test`  | `DemoPass123!` |
| Second vendor — Northstar Supply | `vendor2@demo.returnly.test` | `DemoPass123!` |

The password comes from `DEMO_PASSWORD` when accounts are **first seeded**. Changing that setting later does not change existing hashes. Role buttons prefill the documented default; type your chosen password if you customized it. Public account registration is intentionally outside this college demo.

## Included

- Separate authenticated buyer, vendor and admin workspaces; database-backed sessions.
- Responsive overview, order cards, searchable/filterable dispute queue, case detail, refunds, insights and an in-app guide.
- Buyer disputes with a requested amount and reason; one complete case history per order.
- Stored message threads, PNG/JPG/PDF evidence uploads, private downloads and immutable case activity records.
- Admin review status, priority flags, written approve/decline decisions and full/partial refunds.
- Atomic MySQL refund reservation, duplicate-decision protection and idempotent simulated payout completion.
- An admin dashboard SQL view, a refund-calculation stored procedure, and MongoDB category aggregation.
- A durable SQL outbox that retries message delivery and category projections when MongoDB recovers.
- CSV report export with spreadsheet-formula escaping.
- Five demo users, two vendors, twelve orders, eight disputes and three refunds.

## Submission material

- [Database design, data dictionary, normalization, architecture and ER diagram](docs/DATABASE.md)
- [Standalone ER diagram](docs/er-diagram.svg) and [Mermaid source](docs/er-diagram.mmd)
- [Presentation walkthrough and viva notes](docs/DEMO.md)
- [API and access rules](docs/API.md)
- [Verification record and limitations](docs/VERIFICATION.md)
- [SQL examples](database/demo-queries.sql) and [MongoDB examples](database/mongo-demo.js)
- [Schema and stored procedure](database/001_schema.sql)

## Commands

| Command                    | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | Local development server on 127.0.0.1:3000               |
| `npm run build`            | Compile and type-check the production application        |
| `npm start`                | Run the built application locally                        |
| `npm run typecheck`        | Check TypeScript                                         |
| `npm test`                 | Pure business-rule and password tests                    |
| `npm run test:integration` | Real database tests; requires isolated `_test` databases |
| `npm run test:http`        | API/session checks against the running seeded local app  |
| `npm run db:setup`         | Apply database migration and MongoDB indexes             |
| `npm run db:seed`          | Add demonstration data without resetting existing cases  |
| `npm run db:sync`          | Retry a batch of up to 100 pending MongoDB deliveries    |
| `npm run format`           | Format source and documentation                          |

To use a different port, run `npm run dev -- --port 3001` and set `APP_URL=http://127.0.0.1:3001`. Sessions last eight hours. Sign out using the profile card at the bottom of the sidebar.

## Optional isolated Docker databases

Your requested setup uses the installed services. Docker is an optional alternative:

```powershell
docker compose up -d --wait
```

Use `.env.example` values, then run setup and seed. Docker binds MySQL to 3307 and MongoDB to 27018 on loopback, avoiding the installed services. `docker compose stop` preserves data; do not remove volumes if you need to preserve your demonstration.

## Troubleshooting

- **Access denied:** check the MySQL user/password in `.env`. Restart Next.js after changing environment settings.
- **Connection refused:** start the relevant database service and confirm the port. For authenticated MongoDB, supply an authenticated URI with the correct `authSource`.
- **Unknown database / missing procedure:** run `npm run db:setup` using a user with initial schema creation privileges.
- **Origin not allowed:** open the exact `APP_URL` address. `localhost` and `127.0.0.1` are different origins.
- **Demo sign-in fails:** run setup and seed, use the password selected during first seed, and check the email's role. Ten failed attempts trigger a 15-minute account window.
- **Messages or insights waiting to sync:** restore MongoDB, refresh the workspace or run `npm run db:sync`. SQL refund decisions remain committed and durable.
- **Port already in use:** stop the earlier app process or use another port and update `APP_URL`.

This is a local academic application. Real payment gateways, shipment tracking and live chat are excluded by the synopsis. See the verification document for deployment considerations. No GitHub repository or online deployment has been created.
