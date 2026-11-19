import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
  type ExecuteValues,
} from 'mysql2/promise';
import { MongoClient, GridFSBucket } from 'mongodb';
const globals = globalThis as typeof globalThis & {
  sqlPool?: Pool;
  mongoClient?: Promise<MongoClient>;
};
export function sql() {
  if (!globals.sqlPool)
    globals.sqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'returnly',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'returnly',
      connectionLimit: 10,
      timezone: 'Z',
      dateStrings: true,
      decimalNumbers: true,
      multipleStatements: false,
      connectTimeout: 5000,
      enableKeepAlive: true,
    });
  return globals.sqlPool;
}
export async function rows<T>(
  query: string,
  values: ExecuteValues[] = [],
  conn: Pool | PoolConnection = sql(),
): Promise<T[]> {
  const [data] = await conn.execute<RowDataPacket[]>(query, values);
  return data as T[];
}
export async function execute(
  query: string,
  values: ExecuteValues[] = [],
  conn: Pool | PoolConnection = sql(),
) {
  const [result] = await conn.execute<ResultSetHeader>(query, values);
  return result;
}
export async function transaction<T>(fn: (c: PoolConnection) => Promise<T>) {
  const c = await sql().getConnection();
  try {
    await c.query("SET time_zone = '+00:00'");
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function mongo() {
  if (!globals.mongoClient)
    globals.mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
      serverSelectionTimeoutMS: 5000,
    })
      .connect()
      .catch((e) => {
        globals.mongoClient = undefined;
        throw e;
      });
  return (await globals.mongoClient).db(process.env.MONGODB_DATABASE || 'returnly');
}
export async function bucket() {
  return new GridFSBucket(await mongo(), { bucketName: 'evidenceFiles' });
}
export async function closeDatabases() {
  if (globals.sqlPool) await globals.sqlPool.end();
  if (globals.mongoClient) await (await globals.mongoClient).close();
  globals.sqlPool = undefined;
  globals.mongoClient = undefined;
}
