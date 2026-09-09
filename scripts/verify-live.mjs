import { createClient } from '@libsql/client/web';

const base = process.env.VERIFY_BASE_URL;
const owner = process.env.VERIFY_OWNER_USERNAME;
const pin = process.env.VERIFY_OWNER_PIN;
if (!base || !owner || !pin) throw Error('Live verification environment is incomplete.');
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: owner, pin }) });
if (!login.ok) throw Error(`Owner login failed (${login.status}).`);
const ownerCookie = login.headers.get('set-cookie')?.split(';')[0];
const workspace = await fetch(`${base}/api/workspace`, { headers: { Cookie: ownerCookie || '' } });
const ownerData = await workspace.json();
const expected = ['AlignIQ Golf', 'Astro-Log', 'Tonight', 'Traction OS'];
if (!workspace.ok || !expected.every((name) => ownerData.businesses?.some((business) => business.name === name))) throw Error('Owner pilot import failed.');

const testUsername = `verify_${Date.now()}`;
const registration = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'x-forwarded-for': `verify-${Date.now()}` }, body: JSON.stringify({ username: testUsername, pin: '4826' }) });
if (!registration.ok) throw Error(`Registration failed (${registration.status}).`);
const testCookie = registration.headers.get('set-cookie')?.split(';')[0];
const isolated = await fetch(`${base}/api/workspace`, { headers: { Cookie: testCookie || '' } });
const isolatedData = await isolated.json();
if (!isolated.ok || isolatedData.businesses?.length !== 0 || isolatedData.business !== null) throw Error('New-account isolation failed.');
const signedOut = await fetch(`${base}/api/auth/logout`, { method: 'POST', redirect: 'manual', headers: { Origin: base, Cookie: testCookie || '' } });
if (signedOut.status !== 303) throw Error('Logout failed.');

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try { await db.execute({ sql: 'DELETE FROM users WHERE id=(SELECT user_id FROM auth_accounts WHERE username_normalized=?)', args: [testUsername] }); }
  finally { db.close(); }
}
console.log(JSON.stringify({ ownerLogin: true, pilotBusinesses: expected.length, registration: true, isolatedWorkspace: true, logout: true }));
