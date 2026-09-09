import { createClient, type InStatement } from '@libsql/client/web';
import type { BusinessDocument } from './engine';
type R = { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string };
type U = { id: string; email: string | null; name: string | null };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const db = (r: R) => {
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('Business storage is not configured.');
  return createClient({
    url: r.TURSO_DATABASE_URL,
    authToken: r.TURSO_AUTH_TOKEN,
  });
};
export async function listBusinesses(r: R, u: string) {
  const x = await db(r).execute({
    sql: 'SELECT id,data,revision,updated_at FROM business_documents WHERE user_id=? ORDER BY updated_at DESC',
    args: [u],
  });
  return x.rows.map((row) => {
    const d = JSON.parse(s(row.data)) as BusinessDocument;
    return {
      id: s(row.id),
      name: d.name,
      url: d.url,
      mode: d.mode,
      revision: Number(row.revision),
      updatedAt: s(row.updated_at),
    };
  });
}
export async function loadBusiness(r: R, u: string, id: string) {
  const x = await db(r).execute({
    sql: 'SELECT data,revision FROM business_documents WHERE user_id=? AND id=?',
    args: [u, id],
  });
  const row = x.rows[0];
  return row ? { data: s(row.data), revision: Number(row.revision) } : null;
}
export async function loadLegacy(r: R, u: string) {
  const c = db(r);
  const [w, m] = await Promise.all([
    c.execute({
      sql: 'SELECT data FROM workspaces WHERE user_id=?',
      args: [u],
    }),
    c.execute({
      sql: 'SELECT kind,content,updated_at FROM memories WHERE user_id=? ORDER BY updated_at',
      args: [u],
    }),
  ]);
  return {
    workspace: w.rows[0] ? s(w.rows[0].data) : null,
    memories: m.rows.map((x) => ({
      kind: s(x.kind),
      content: s(x.content),
      updatedAt: s(x.updated_at),
    })),
  };
}
export async function saveBusiness(
  r: R,
  user: U,
  id: string,
  data: string,
  previous: number | null,
) {
  const c = db(r),
    now = new Date().toISOString();
  const stmts: InStatement[] = [
    {
      sql: `INSERT INTO users(id,email,name,created_at,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,last_seen_at=excluded.last_seen_at`,
      args: [user.id, user.email, user.name, now, now],
    },
  ];
  stmts.push(
    previous === null
      ? {
          sql: 'INSERT INTO business_documents(user_id,id,data,revision,created_at,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(user_id,id) DO NOTHING',
          args: [user.id, id, data, now, now],
        }
      : {
          sql: 'UPDATE business_documents SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?',
          args: [data, now, user.id, id, previous],
        },
  );
  const out = await c.batch(stmts, 'write');
  return out[1].rowsAffected === 1
    ? previous === null
      ? 1
      : previous + 1
    : null;
}
