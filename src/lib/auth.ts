import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { rows, execute } from './db';
import { AppError } from './domain';
import type { User } from './types';
export const cookieName = 'returnly_session';
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const digest = (v: string) => createHash('sha256').update(v).digest('hex');
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const users = await rows<User>(
    `SELECT u.id,u.name,u.email,u.role,v.shop_name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN vendors v ON v.user_id=u.id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()`,
    [digest(token)],
  );
  return users[0] || null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError(401, 'Please sign in to continue.');
  return user;
}
// A persistent per-email window also applies across application instances.
export async function login(email: string, password: string) {
  const key = digest(email);
  await execute(
    `INSERT INTO login_attempts(attempt_key,attempts,window_start) VALUES(?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE attempts=IF(window_start<UTC_TIMESTAMP()-INTERVAL 15 MINUTE,1,attempts+1),window_start=IF(window_start<UTC_TIMESTAMP()-INTERVAL 15 MINUTE,UTC_TIMESTAMP(),window_start)`,
    [key],
  );
  const [limit] = await rows<{ attempts: number }>(
    `SELECT attempts FROM login_attempts WHERE attempt_key=?`,
    [key],
  );
  if (limit.attempts > 10)
    throw new AppError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  const [user] = await rows<User & { password_hash: string }>(
    'SELECT id,name,email,role,password_hash FROM users WHERE email=?',
    [email],
  );
  const valid = verifyPassword(
    password,
    user?.password_hash || '00000000000000000000000000000000:'.concat('0'.repeat(128)),
  );
  if (!user || !valid) throw new AppError(401, 'Email or password is incorrect.');
  await execute('DELETE FROM login_attempts WHERE attempt_key=?', [key]);
  const token = randomBytes(32).toString('hex');
  await execute(
    `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))`,
    [digest(token), user.id],
  );
  const { password_hash: _, ...safe } = user;
  return { token, user: safe };
}
