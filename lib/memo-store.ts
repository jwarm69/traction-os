import { createClient, type Client } from '@libsql/client/web';
import type { Runtime } from './runtime';

/**
 * Schedule registry for the weekly memo. Follows runner-store: a client can be
 * injected for tests, claims use a conditional update as a lease, and every
 * read is scoped by owner.
 */
export type MemoSchedule = {
  ownerId: string;
  businessId: string;
  enabled: boolean;
  weekday: number;
  hourUtc: number;
  nextDueAt: string;
  lastGeneratedWeek: string | null;
  leaseUntil: string | null;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const now = () => new Date().toISOString();
const db = (r: Runtime) => {
  const injected = (r as Runtime & { __memoClient?: Client }).__memoClient;
  if (injected) return injected;
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('Memo schedule storage is unavailable.');
  return createClient({ url: r.TURSO_DATABASE_URL, authToken: r.TURSO_AUTH_TOKEN });
};
const owned = (r: Runtime) => !!(r as Runtime & { __memoClient?: Client }).__memoClient;
const close = (r: Runtime, c: Client) => {
  if (!owned(r)) c.close();
};
export function withMemoClient(r: Runtime, client: Client): Runtime & { __memoClient: Client } {
  return Object.assign({}, r, { __memoClient: client });
}

const row = (x: Record<string, unknown>): MemoSchedule => ({
  ownerId: str(x.owner_id),
  businessId: str(x.business_id),
  enabled: Number(x.enabled) === 1,
  weekday: Number(x.weekday),
  hourUtc: Number(x.hour_utc),
  nextDueAt: str(x.next_due_at),
  lastGeneratedWeek: x.last_generated_week ? str(x.last_generated_week) : null,
  leaseUntil: x.lease_until ? str(x.lease_until) : null,
});

/** The next UTC instant at the given weekday and hour strictly after `from`. */
export function nextSlot(weekday: number, hourUtc: number, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hourUtc));
  const ahead = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + ahead);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

export function validateSchedule(input: { weekday: unknown; hourUtc: unknown; enabled?: unknown }) {
  const weekday = Number(input.weekday);
  const hourUtc = Number(input.hourUtc);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    throw Error('Choose a weekday from 0 (Sunday) to 6 (Saturday).');
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23)
    throw Error('Choose an hour from 0 to 23 (UTC).');
  return { weekday, hourUtc, enabled: input.enabled !== false };
}

export async function upsertSchedule(
  r: Runtime,
  ownerId: string,
  businessId: string,
  input: { weekday: number; hourUtc: number; enabled: boolean },
  from = new Date(),
) {
  const c = db(r);
  const t = now();
  const due = nextSlot(input.weekday, input.hourUtc, from);
  try {
    await c.execute({
      sql: `INSERT INTO memo_schedules(owner_id,business_id,enabled,weekday,hour_utc,next_due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(owner_id,business_id) DO UPDATE SET enabled=excluded.enabled,weekday=excluded.weekday,hour_utc=excluded.hour_utc,next_due_at=excluded.next_due_at,updated_at=excluded.updated_at`,
      args: [ownerId, businessId, input.enabled ? 1 : 0, input.weekday, input.hourUtc, due, t, t],
    });
    return getSchedule(r, ownerId, businessId);
  } finally {
    close(r, c);
  }
}

export async function getSchedule(r: Runtime, ownerId: string, businessId: string) {
  const c = db(r);
  try {
    const q = await c.execute({
      sql: 'SELECT * FROM memo_schedules WHERE owner_id=? AND business_id=?',
      args: [ownerId, businessId],
    });
    return q.rows[0] ? row(q.rows[0]) : null;
  } finally {
    close(r, c);
  }
}

export async function listDue(r: Runtime, at = new Date(), limit = 50) {
  const c = db(r);
  try {
    const q = await c.execute({
      sql: 'SELECT * FROM memo_schedules WHERE enabled=1 AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY next_due_at LIMIT ?',
      args: [at.toISOString(), at.toISOString(), limit],
    });
    return q.rows.map(row);
  } finally {
    close(r, c);
  }
}

/** Exclusive lease on one schedule. Returns false when another caller holds it. */
export async function claimDue(
  r: Runtime,
  ownerId: string,
  businessId: string,
  leaseMs = 120_000,
  at = new Date(),
) {
  const c = db(r);
  try {
    const q = await c.execute({
      sql: 'UPDATE memo_schedules SET lease_until=? WHERE owner_id=? AND business_id=? AND enabled=1 AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?)',
      args: [new Date(at.getTime() + leaseMs).toISOString(), ownerId, businessId, at.toISOString(), at.toISOString()],
    });
    return q.rowsAffected === 1;
  } finally {
    close(r, c);
  }
}

/** Advances next_due_at by whole weeks from the scheduled slot, never from the run time. */
export async function markGenerated(
  r: Runtime,
  ownerId: string,
  businessId: string,
  weekKey: string,
  at = new Date(),
) {
  const c = db(r);
  try {
    const current = await c.execute({
      sql: 'SELECT next_due_at FROM memo_schedules WHERE owner_id=? AND business_id=?',
      args: [ownerId, businessId],
    });
    const slot = current.rows[0] ? new Date(str(current.rows[0].next_due_at)) : at;
    const next = new Date(slot.getTime());
    while (next.getTime() <= at.getTime()) next.setUTCDate(next.getUTCDate() + 7);
    await c.execute({
      sql: 'UPDATE memo_schedules SET last_generated_week=?,next_due_at=?,lease_until=NULL,updated_at=? WHERE owner_id=? AND business_id=?',
      args: [weekKey, next.toISOString(), now(), ownerId, businessId],
    });
    return next.toISOString();
  } finally {
    close(r, c);
  }
}

export async function releaseLease(r: Runtime, ownerId: string, businessId: string) {
  const c = db(r);
  try {
    await c.execute({
      sql: 'UPDATE memo_schedules SET lease_until=NULL WHERE owner_id=? AND business_id=?',
      args: [ownerId, businessId],
    });
  } finally {
    close(r, c);
  }
}
