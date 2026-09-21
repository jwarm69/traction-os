import { createClient } from '@libsql/client/web';
import type { BusinessDocument } from './engine';

type R = { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const db = (r: R) => {
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('Business storage is not configured.');
  return createClient({ url: r.TURSO_DATABASE_URL, authToken: r.TURSO_AUTH_TOKEN });
};

export const MAX_MEMBERS = 10;
const SEPARATOR = '~';

/** Shared businesses are addressed as "<ownerId>~<businessId>" so ids never collide across owners. */
export const sharedId = (ownerId: string, businessId: string) =>
  `${ownerId}${SEPARATOR}${businessId}`;
export function parseSharedId(value: string) {
  const at = value.indexOf(SEPARATOR);
  if (at < 1 || at === value.length - 1) return null;
  return { ownerId: value.slice(0, at), businessId: value.slice(at + 1) };
}

export type Member = { memberId: string; username: string; createdAt: string };

export async function listMembers(r: R, ownerId: string, businessId: string) {
  const x = await db(r).execute({
    sql: 'SELECT m.member_id,m.created_at,a.username FROM business_members m JOIN auth_accounts a ON a.user_id=m.member_id WHERE m.owner_id=? AND m.business_id=? ORDER BY m.created_at',
    args: [ownerId, businessId],
  });
  return x.rows.map(
    (row): Member => ({
      memberId: s(row.member_id),
      username: s(row.username),
      createdAt: s(row.created_at),
    }),
  );
}

/** Invite an existing account by username. The owner must hold the business. */
export async function addMember(
  r: R,
  ownerId: string,
  businessId: string,
  username: string,
) {
  const name = username.trim();
  if (!/^[A-Za-z0-9_.-]{2,40}$/.test(name)) throw Error('Enter a valid username.');
  const c = db(r);
  const found = await c.execute({
    sql: 'SELECT user_id FROM auth_accounts WHERE lower(username)=lower(?)',
    args: [name],
  });
  const memberId = s(found.rows[0]?.user_id);
  // One message for unknown and self so usernames cannot be probed for more than existence of an invite.
  if (!memberId || memberId === ownerId)
    throw Error('No other account has that username. Ask your partner to register first.');
  const count = await c.execute({
    sql: 'SELECT count(*) AS n FROM business_members WHERE owner_id=? AND business_id=?',
    args: [ownerId, businessId],
  });
  if (Number(count.rows[0]?.n) >= MAX_MEMBERS)
    throw Error(`A business can be shared with at most ${MAX_MEMBERS} accounts.`);
  await c.execute({
    sql: "INSERT INTO business_members(owner_id,business_id,member_id,role,created_at) SELECT ?,?,?,'viewer',? WHERE EXISTS (SELECT 1 FROM business_documents WHERE user_id=? AND id=?) ON CONFLICT DO NOTHING",
    args: [ownerId, businessId, memberId, new Date().toISOString(), ownerId, businessId],
  });
}

export async function removeMember(
  r: R,
  ownerId: string,
  businessId: string,
  memberId: string,
) {
  await db(r).execute({
    sql: 'DELETE FROM business_members WHERE owner_id=? AND business_id=? AND member_id=?',
    args: [ownerId, businessId, memberId],
  });
}

/** Summaries of businesses other owners shared with this account. */
export async function listShared(r: R, memberId: string) {
  const x = await db(r).execute({
    sql: 'SELECT m.owner_id,m.business_id,d.data,d.revision,d.updated_at,a.username FROM business_members m JOIN business_documents d ON d.user_id=m.owner_id AND d.id=m.business_id JOIN auth_accounts a ON a.user_id=m.owner_id WHERE m.member_id=? ORDER BY d.updated_at DESC',
    args: [memberId],
  });
  return x.rows.map((row) => {
    const d = JSON.parse(s(row.data)) as BusinessDocument;
    return {
      id: sharedId(s(row.owner_id), s(row.business_id)),
      name: d.name,
      url: d.url,
      mode: d.mode,
      revision: Number(row.revision),
      updatedAt: s(row.updated_at),
      sharedBy: s(row.username),
    };
  });
}

/** Load a shared business only while the membership row exists. */
export async function loadShared(
  r: R,
  memberId: string,
  ownerId: string,
  businessId: string,
) {
  const x = await db(r).execute({
    sql: 'SELECT d.data,d.revision,a.username FROM business_members m JOIN business_documents d ON d.user_id=m.owner_id AND d.id=m.business_id JOIN auth_accounts a ON a.user_id=m.owner_id WHERE m.member_id=? AND m.owner_id=? AND m.business_id=?',
    args: [memberId, ownerId, businessId],
  });
  const row = x.rows[0];
  return row
    ? { data: s(row.data), revision: Number(row.revision), sharedBy: s(row.username) }
    : null;
}
