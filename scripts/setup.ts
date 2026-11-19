import './env';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { sql, mongo, closeDatabases } from '../src/lib/db';
async function main() {
  const name = process.env.MYSQL_DATABASE || 'returnly';
  if (!/^[A-Za-z0-9_]+$/.test(name))
    throw Error('Use only letters, digits and underscores in MYSQL_DATABASE.');
  const bootstrap = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });
  try {
    const [dbs] = await bootstrap.execute(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',
      [name],
    );
    if (!(dbs as unknown[]).length)
      await bootstrap.query(
        `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
  } finally {
    await bootstrap.end();
  }
  const c = await sql().getConnection();
  try {
    const [existing] = await c.query("SHOW TABLES LIKE 'schema_migrations'");
    let applied = false;
    if ((existing as unknown[]).length) {
      const [v] = await c.query('SELECT version FROM schema_migrations WHERE version=1');
      applied = (v as unknown[]).length > 0;
    }
    if (!applied) {
      const schema = await readFile('database/001_schema.sql', 'utf8');
      const parts = schema.split('-- @statement');
      for (const statement of parts[0]
        .replace(/^--.*$/gm, '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await c.query(statement);
      // The procedure is a single server statement; its internal semicolons stay intact.
      await c.query('DROP PROCEDURE IF EXISTS calculate_refund');
      await c.query(parts[1].trim());
      await c.query('INSERT INTO schema_migrations(version) VALUES(1)');
      console.log('MySQL schema, view and stored procedure installed.');
    } else console.log('MySQL migration 1 already applied.');
    const db = await mongo();
    await db.collection('messages').createIndex({ disputeId: 1, createdAt: 1 });
    await db.collection('evidence').createIndex({ disputeId: 1 });
    await db.collection('disputeSummaries').createIndex({ buyerId: 1, reason: 1 });
    await db.collection('disputeSummaries').createIndex({ vendorUserId: 1, reason: 1 });
    console.log('MongoDB collections and indexes ready. Run npm run db:seed next.');
  } finally {
    c.release();
  }
}
main()
  .catch(() => {
    console.error(
      'Setup failed. Check database availability, credentials and CREATE/ALTER/CREATE ROUTINE privileges in .env.',
    );
    process.exitCode = 1;
  })
  .finally(closeDatabases);
