import { createHash, pbkdf2 as derive, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@libsql/client/web';
import type { Runtime } from './runtime';

const pbkdf2 = promisify(derive);
const COOKIE = 'traction_session';
const ITERATIONS = 310_000;
export type AuthUser = { id: string; email: string | null; name: string; username: string };
const text = (value: unknown) => typeof value === 'string' ? value : '';

function db(r: Runtime) {
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN) throw Error('Account storage is unavailable.');
  return createClient({ url: r.TURSO_DATABASE_URL, authToken: r.TURSO_AUTH_TOKEN });
}
export function cleanUsername(value: unknown) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(username)) throw Error('Use 3–32 letters, numbers, underscores, or hyphens.');
  return { username, normalized: username.toLowerCase() };
}
export function cleanPin(value: unknown) {
  const pin = typeof value === 'string' ? value : '';
  if (!/^\d{4,6}$/.test(pin)) throw Error('PIN must contain 4–6 digits.');
  return pin;
}
async function pinHash(pin: string, salt: Buffer) {
  return (await pbkdf2(pin, salt, ITERATIONS, 32, 'sha256')) as Buffer;
}
export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  return { salt: salt.toString('base64url'), hash: (await pinHash(pin, salt)).toString('base64url') };
}
async function verifyPin(pin: string, saltText: string, hashText: string) {
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await pinHash(pin, Buffer.from(saltText, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('base64url');
const cookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearSessionCookie = () => cookie('', 0);
export function sessionToken(req: Request) {
  const value = req.headers.get('cookie')?.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`));
  return value ? decodeURIComponent(value.slice(COOKIE.length + 1)) : '';
}
export async function authenticateRequest(r: Runtime, req: Request): Promise<AuthUser | null> {
  if (r.ALLOW_DEV_IDENTITY === 'true') {
    const id = text(req.headers.get('x-traction-dev-user-id')).trim().slice(0, 100);
    if (id) return { id, username: id, name: id, email: null };
  }
  const token = sessionToken(req);
  if (!token || token.length > 200) return null;
  const c = db(r);
  try {
    const q = await c.execute({
      sql: `SELECT a.user_id,a.username,a.email FROM auth_sessions s JOIN auth_accounts a ON a.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
      args: [tokenHash(token), new Date().toISOString()],
    });
    const row = q.rows[0];
    return row ? { id: text(row.user_id), username: text(row.username), name: text(row.username), email: text(row.email) || null } : null;
  } finally { c.close(); }
}
const requestAddress = (req: Request) => (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim().slice(0, 80);
async function throttled(c: ReturnType<typeof db>, scope: string, max: number) {
  const q = await c.execute({ sql: 'SELECT COUNT(*) count FROM auth_attempts WHERE scope=? AND success=0 AND attempted_at>?', args: [scope, new Date(Date.now() - 15 * 60_000).toISOString()] });
  return Number(q.rows[0]?.count || 0) >= max;
}
const recordAttempt = (c: ReturnType<typeof db>, scope: string, success: boolean) => c.execute({ sql: 'INSERT INTO auth_attempts(scope,attempted_at,success) VALUES(?,?,?)', args: [scope, new Date().toISOString(), success ? 1 : 0] });
async function createSession(c: ReturnType<typeof db>, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date(), expires = new Date(now.getTime() + 30 * 86_400_000);
  await c.execute({ sql: 'INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', args: [tokenHash(token), userId, now.toISOString(), expires.toISOString()] });
  return cookie(token, 30 * 86_400);
}
export async function register(r: Runtime, req: Request, usernameValue: unknown, pinValue: unknown) {
  const { username, normalized } = cleanUsername(usernameValue), pin = cleanPin(pinValue);
  const c = db(r), scope = `register:${requestAddress(req)}`;
  try {
    if (await throttled(c, scope, 8)) throw Error('Too many account attempts. Try again in 15 minutes.');
    const existing = await c.execute({ sql: 'SELECT 1 FROM auth_accounts WHERE username_normalized=?', args: [normalized] });
    if (existing.rows.length) { await recordAttempt(c, scope, false); throw Error('That username is already taken.'); }
    const userId = `usr_${randomBytes(16).toString('hex')}`, now = new Date().toISOString(), hashed = await hashPin(pin);
    await c.batch([
      { sql: 'INSERT INTO users(id,email,name,created_at,last_seen_at) VALUES(?,?,?,?,?)', args: [userId, null, username, now, now] },
      { sql: 'INSERT INTO auth_accounts(user_id,username,username_normalized,email,pin_salt,pin_hash,created_at) VALUES(?,?,?,?,?,?,?)', args: [userId, username, normalized, null, hashed.salt, hashed.hash, now] },
    ], 'write');
    await recordAttempt(c, scope, true);
    return await createSession(c, userId);
  } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) throw Error('That username is already taken.');
    throw error;
  } finally { c.close(); }
}
export async function login(r: Runtime, req: Request, usernameValue: unknown, pinValue: unknown) {
  const { normalized } = cleanUsername(usernameValue), pin = cleanPin(pinValue);
  const c = db(r), scope = `login:${normalized}`;
  try {
    if (await throttled(c, scope, 5)) throw Error('Too many incorrect attempts. Try again in 15 minutes.');
    const q = await c.execute({ sql: 'SELECT user_id,pin_salt,pin_hash FROM auth_accounts WHERE username_normalized=?', args: [normalized] });
    const row = q.rows[0], valid = row ? await verifyPin(pin, text(row.pin_salt), text(row.pin_hash)) : false;
    await recordAttempt(c, scope, valid);
    if (!row || !valid) throw Error('Username or PIN is incorrect.');
    return await createSession(c, text(row.user_id));
  } finally { c.close(); }
}
export async function logout(r: Runtime, req: Request) {
  const token = sessionToken(req);
  if (!token) return;
  const c = db(r);
  try { await c.execute({ sql: 'DELETE FROM auth_sessions WHERE token_hash=?', args: [tokenHash(token)] }); }
  finally { c.close(); }
}
