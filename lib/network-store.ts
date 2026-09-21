import { createHash, randomBytes } from 'node:crypto';
import { createClient, type InStatement } from '@libsql/client/web';
import type { BusinessDocument } from './engine';
import { patternsFor, summarize, type PatternRow } from './network';

type R = { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const db = (r: R) => {
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('Business storage is not configured.');
  return createClient({ url: r.TURSO_DATABASE_URL, authToken: r.TURSO_AUTH_TOKEN });
};
const week = () => {
  const d = new Date();
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
};
const ref = (contributorId: string, businessId: string, endeavorId: string) =>
  createHash('sha256').update(`${contributorId}\n${businessId}\n${endeavorId}`).digest('hex');

async function contributor(r: R, userId: string) {
  const c = db(r);
  await c.execute({
    sql: 'INSERT INTO network_contributors(user_id,contributor_id,sharing,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO NOTHING',
    args: [userId, randomBytes(16).toString('hex'), new Date().toISOString()],
  });
  const x = await c.execute({
    sql: 'SELECT contributor_id,sharing FROM network_contributors WHERE user_id=?',
    args: [userId],
  });
  return { id: s(x.rows[0]?.contributor_id), sharing: Number(x.rows[0]?.sharing) === 1 };
}

export async function sharingStatus(r: R, userId: string) {
  return (await contributor(r, userId)).sharing;
}

/** Opting out also withdraws everything this account already contributed. */
export async function setSharing(r: R, userId: string, sharing: boolean) {
  const me = await contributor(r, userId);
  const stmts: InStatement[] = [
    {
      sql: 'UPDATE network_contributors SET sharing=?,updated_at=? WHERE user_id=?',
      args: [sharing ? 1 : 0, new Date().toISOString(), userId],
    },
  ];
  if (!sharing)
    stmts.push({ sql: 'DELETE FROM network_patterns WHERE contributor_id=?', args: [me.id] });
  await db(r).batch(stmts, 'write');
}

/** Replace this business's category-only shapes. Sends no text, names, URLs, or numbers. */
export async function contribute(r: R, userId: string, business: BusinessDocument) {
  const patterns = patternsFor(business);
  if (!patterns.length) return;
  const me = await contributor(r, userId);
  if (!me.sharing) return;
  const at = week();
  await db(r).batch(
    patterns.map((p) => ({
      sql: 'INSERT INTO network_patterns(pattern_ref,contributor_id,kind,channel,status,verdict,reviewed_artifact,observed,updated_week) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(pattern_ref) DO UPDATE SET kind=excluded.kind,channel=excluded.channel,status=excluded.status,verdict=excluded.verdict,reviewed_artifact=excluded.reviewed_artifact,observed=excluded.observed,updated_week=excluded.updated_week',
      args: [ref(me.id, business.id, p.endeavorId), me.id, p.kind, p.channel, p.status, p.verdict, p.reviewedArtifact ? 1 : 0, p.observed ? 1 : 0, at],
    })),
    'write',
  );
}

export async function networkInsights(r: R) {
  const x = await db(r).execute(
    'SELECT contributor_id,kind,channel,status,verdict,observed FROM network_patterns LIMIT 20000',
  );
  return summarize(
    x.rows.map(
      (row): PatternRow => ({
        contributorId: s(row.contributor_id),
        kind: s(row.kind),
        channel: s(row.channel),
        status: s(row.status),
        verdict: s(row.verdict),
        observed: Number(row.observed) === 1,
      }),
    ),
  );
}
