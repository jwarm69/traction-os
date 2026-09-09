import { createClient } from '@libsql/client/web';
import { pbkdf2 as derive, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw Error(`${name} is required.`);
  return value;
};
const url = required('TURSO_DATABASE_URL');
const authToken = required('TURSO_AUTH_TOKEN');
const username = required('OWNER_USERNAME');
const pin = required('OWNER_PIN');
const email = required('OWNER_EMAIL');
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(username)) throw Error('Invalid owner username.');
if (!/^\d{4,6}$/.test(pin)) throw Error('Invalid owner PIN.');

const salt = randomBytes(16);
const hash = await promisify(derive)(pin, salt, 310_000, 32, 'sha256');
const now = new Date().toISOString();
const userId = 'usr_jackwarman';
const db = createClient({ url, authToken });
try {
  await db.batch([
    { sql: 'INSERT INTO users(id,email,name,created_at,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,last_seen_at=excluded.last_seen_at', args: [userId, email, username, now, now] },
    { sql: `INSERT INTO auth_accounts(user_id,username,username_normalized,email,pin_salt,pin_hash,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,username_normalized=excluded.username_normalized,email=excluded.email,pin_salt=excluded.pin_salt,pin_hash=excluded.pin_hash`, args: [userId, username, username.toLowerCase(), email, salt.toString('base64url'), hash.toString('base64url'), now] },
  ], 'write');
  console.log('Owner account seeded.');
} finally { db.close(); }
