# Demo walkthrough and viva notes

## Before presenting

Complete the README setup on the dedicated `returnly` databases, run seed once, and open `http://127.0.0.1:3000`. Keep MySQL Workbench/CLI and mongosh available if your evaluator wants to inspect the databases. All five demo accounts use `DemoPass123!` unless changed before seeding.

The sample baseline includes 12 orders, 8 cases (4 active, 4 closed), and 3 approved refunds. Seeding again preserves changes, so counts will differ after you demonstrate a new case or decision. For a fresh baseline, choose **new database names** in `.env`, run setup/seed, and restart the app; this preserves existing history.

## A five-to-eight-minute presentation

### 1. Introduce the problem

“Most shopping demos stop at checkout. Our project covers what happens when an order goes wrong. Buyers, vendors and admins have a shared case history and a clear resolution process.”

Explain that the financial simulation deliberately separates refund approval/reservation from payout completion.

### 2. Buyer: raise a new dispute

1. Select **Buyer** on the login page and sign in.
2. Open **Orders**. Use the undisputed **Portable desk lamp**, order **ORD-2026-1050**.
3. Choose **Report an issue**.
4. Reason: **Item arrived damaged**. Title: “Desk lamp arrived with a cracked base”. Description: “The lamp base was cracked when I opened the sealed package. The lamp cannot stand securely on my desk.”
5. Request **INR 3,299.00** and open the case.
6. Upload a small JPG, PNG or PDF as evidence. It remains private to the case participants and admins.
7. Add a message and show the activity timeline. Note the generated dispute reference.

The lamp belongs to the primary buyer and **Form & Field**, which is operated by the primary vendor account. If that order already has a case from an earlier demo, use its existing case or prepare a fresh database name as described above.

### 3. Vendor: respond

1. Sign out using the profile card.
2. Select **Vendor** and sign in as `vendor@demo.returnly.test`.
3. Open the new lamp dispute. Show the buyer's message and uploaded evidence.
4. Reply: “We reviewed the damage and support a refund. Thank you for sharing the details.”
5. Show that the case moved to **Under review**. Point out that the vendor only sees its own shop's cases.

### 4. Admin: review and decide

1. Sign out and sign in as **Admin**.
2. Show the overview, active/closed filters, search and reason filter.
3. Open the lamp case. Read the conversation and evidence; optionally flag it as high priority.
4. Choose **Approve refund**, enter **INR 2,000.00** to demonstrate a partial refund, and write a decision note of at least 10 characters.
5. Choose **Review decision**, then **Confirm decision**.
6. Show the closed-case banner and audit event. Discuss the row locks, stored procedure and atomic updates to the dispute, payment and refund tables.
7. In **Refunds**, choose **Simulate payout** on this refund. The status changes to completed; repeating the backend operation cannot double-pay it.

### 5. Show the database features

1. In MySQL, inspect the view: `SELECT * FROM admin_dispute_dashboard;`.
2. Run the stored-procedure example and reconciliation query in `database/demo-queries.sql`.
3. In MongoDB, show the stored message and evidence metadata, then run the category aggregation in `database/mongo-demo.js`.
4. Open **Insights** and explain that category counts come from MongoDB while operational amounts come from MySQL.
5. Export a CSV from the dispute queue or overview.

## Viva questions

**Why two databases?** Orders, payments and refunds have stable relationships and financial invariants, so MySQL transactions are appropriate. Threads and evidence metadata fit documents and GridFS, with category aggregation demonstrated in MongoDB.

**What makes a refund atomic?** The service locks the case and payment, validates the amount, calls the procedure, writes the refund, updates the payment and case, and records the audit/outbox changes on one MySQL connection before committing. Any SQL failure rolls them all back.

**What if two admins decide at once?** `FOR UPDATE` serializes them. The second transaction sees the case is already closed. A unique `refunds.dispute_id` constraint is a second safeguard. This was tested against a real MySQL instance.

**Is the MySQL + MongoDB operation one distributed transaction?** No. MySQL owns the financial truth. A durable outbox delivers messages and category projections to MongoDB with retry-safe IDs. Counts and threads can temporarily lag; the interface shows pending delivery. Evidence uploads use best-effort compensation and have a documented process-crash reconciliation limit.

**What does the stored procedure do?** It validates that a positive full or partial amount fits the available captured payment and returns the amount through an OUT parameter. The application owns transaction control and checks the buyer's requested limit.

**Why integer paise?** To avoid binary floating-point rounding in monetary arithmetic. Display formatting divides by 100 only at the interface boundary.

**Can vendors approve their own refunds?** No. The API checks the authenticated role. Hiding a button is only a convenience; access is enforced server-side.

**Are payments real?** No. Seeded payments represent captured funds and the payout control simulates completion. There is no gateway integration.

**Can a buyer reopen a closed case?** Not in this scope. Each order has one immutable case history. This prevents repeated claims and duplicate refunds; a production appeals policy would need explicit modeling.

**How is evidence secured?** Authenticated participant checks on upload and download, content-signature validation, 5 MiB/file and ten-file limits, sanitized filenames, GridFS storage and attachment responses.

**Is this ready for public deployment?** It is built and verified as a local academic application. Public use would need HTTPS, managed secrets/backups, operational monitoring, stronger anti-abuse controls, evidence scanning, reconciliation jobs and actual payment workflows.
