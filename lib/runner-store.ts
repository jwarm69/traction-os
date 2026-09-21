import { createHash, randomBytes } from 'node:crypto';
import { createClient, type Client } from '@libsql/client/web';
import type { Runtime } from './runtime';
import type {
  ApprovalEvent,
  RunnerClaim,
  RunnerDevice,
  RunnerJob,
  RunnerDecision,
} from './runner-types';

export const hashSecret = (v: string) =>
  createHash('sha256').update(v).digest('base64url');
export const newSecret = (bytes = 32) =>
  randomBytes(bytes).toString('base64url');
export const pairCode = () => randomBytes(8).toString('hex').toUpperCase();
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const json = (v: unknown) => JSON.stringify(v === undefined ? null : v);
const parse = (v: unknown) => {
  try {
    return JSON.parse(str(v));
  } catch {
    return null;
  }
};
const now = () => new Date().toISOString();
const db = (r: Runtime) => {
  const injected = (r as Runtime & { __runnerClient?: Client }).__runnerClient;
  if (injected) return injected;
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('Runner storage is unavailable.');
  return createClient({
    url: r.TURSO_DATABASE_URL,
    authToken: r.TURSO_AUTH_TOKEN,
  });
};
export function withRunnerClient(
  r: Runtime,
  client: Client,
): Runtime & { __runnerClient: Client } {
  return Object.assign({}, r, { __runnerClient: client });
}
const id = (prefix: string) => `${prefix}_${randomBytes(16).toString('hex')}`;
const rowDevice = (x: any): RunnerDevice => ({
  id: str(x.id),
  name: str(x.name),
  createdAt: str(x.created_at),
  revokedAt: x.revoked_at ? str(x.revoked_at) : null,
  lastSeenAt: x.last_seen_at ? str(x.last_seen_at) : null,
  capabilities: parse(x.capabilities_json) || {},
});
const rowJob = (x: any): RunnerJob => ({
  id: str(x.id),
  businessId: str(x.business_id),
  endeavorId: str(x.endeavor_id),
  deviceId: str(x.device_id),
  revision: Number(x.revision),
  executionMode: x.execution_mode === 'computer' ? 'computer' : 'codex',
  goal: x.goal ? str(x.goal) : undefined,
  status: x.status,
  brief: str(x.brief),
  result: x.result_json ? parse(x.result_json) : undefined,
  error: x.error ? str(x.error) : undefined,
  createdAt: str(x.created_at),
  claimedAt: x.claimed_at ? str(x.claimed_at) : undefined,
  completedAt: x.completed_at ? str(x.completed_at) : undefined,
  leaseExpiresAt: x.lease_expires_at ? str(x.lease_expires_at) : undefined,
});

export function validatePairCode(value: unknown) {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-F0-9]{16}$/.test(v)) throw Error('Invalid pairing code.');
  return v;
}
export function validateDeviceName(value: unknown) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > 120) throw Error('Invalid device name.');
  return v;
}
export function validateId(value: unknown, label = 'id') {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(v)) throw Error(`Invalid ${label}.`);
  return v;
}

export async function createPairCode(
  r: Runtime,
  ownerId: string,
  ttlMs = 10 * 60_000,
) {
  const code = pairCode(),
    c = db(r),
    expires = new Date(Date.now() + ttlMs).toISOString();
  try {
    await c.execute({
      sql: 'INSERT INTO runner_pair_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)',
      args: [hashSecret(code), ownerId, expires],
    });
    return { code, expiresAt: expires };
  } finally {
    c.close();
  }
}
export async function redeemPairCode(
  r: Runtime,
  codeInput: unknown,
  nameInput: unknown,
  capabilities: { computerUse?: boolean } = {},
) {
  const code = validatePairCode(codeInput),
    name = validateDeviceName(nameInput),
    token = newSecret(),
    deviceId = id('dev'),
    t = now(),
    c = db(r);
  try {
    const tx = await c.transaction('write');
    const q = await tx.execute({
      sql: 'SELECT owner_id FROM runner_pair_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?',
      args: [hashSecret(code), t],
    });
    const owner = str(q.rows[0]?.owner_id);
    if (!owner) {
      await tx.rollback();
      throw Error('Pairing code is invalid or expired.');
    }
    const used = await tx.execute({
      sql: 'UPDATE runner_pair_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?',
      args: [t, hashSecret(code), t],
    });
    if (used.rowsAffected !== 1) {
      await tx.rollback();
      throw Error('Pairing code is invalid or expired.');
    }
    try {
      await tx.execute({
        sql: 'INSERT INTO runner_devices(id,owner_id,name,token_hash,created_at,capabilities_json) VALUES(?,?,?,?,?,?)',
        args: [
          deviceId,
          owner,
          name,
          hashSecret(token),
          t,
          json({ computerUse: capabilities.computerUse === true }),
        ],
      });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    return { deviceId, ownerId: owner, token };
  } finally {
    c.close();
  }
}
export async function authenticateDevice(r: Runtime, token: string) {
  const c = db(r);
  try {
    const q = await c.execute({
      sql: 'SELECT id,owner_id FROM runner_devices WHERE token_hash=? AND revoked_at IS NULL',
      args: [hashSecret(token)],
    });
    const x = q.rows[0];
    return x ? { deviceId: str(x.id), ownerId: str(x.owner_id) } : null;
  } finally {
    c.close();
  }
}
export async function revokeDevice(
  r: Runtime,
  ownerId: string,
  deviceId: string,
) {
  const c = db(r);
  try {
    return (
      (
        await c.execute({
          sql: 'UPDATE runner_devices SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=?',
          args: [now(), deviceId, ownerId],
        })
      ).rowsAffected === 1
    );
  } finally {
    c.close();
  }
}
export async function listRunner(
  r: Runtime,
  ownerId: string,
  businessId?: string,
) {
  const c = db(r);
  try {
    await c.execute({
      sql: "UPDATE runner_jobs SET status='failed',error='Connection or runtime expired; review before queuing again.',completed_at=? WHERE owner_id=? AND status='claimed' AND (lease_expires_at<=? OR claimed_at<=?)",
      args: [
        now(),
        ownerId,
        now(),
        new Date(Date.now() - 30 * 60_000).toISOString(),
      ],
    });
    await c.execute({
      sql: "UPDATE runner_jobs SET status='canceled',completed_at=? WHERE owner_id=? AND status IN ('queued','claimed') AND EXISTS (SELECT 1 FROM runner_devices d WHERE d.id=runner_jobs.device_id AND d.revoked_at IS NOT NULL)",
      args: [now(), ownerId],
    });
    const [d, j, a] = await Promise.all([
      c.execute({
        sql: 'SELECT * FROM runner_devices WHERE owner_id=? ORDER BY created_at DESC LIMIT 100',
        args: [ownerId],
      }),
      c.execute({
        sql: 'SELECT * FROM runner_jobs WHERE owner_id=? AND (? IS NULL OR business_id=?) ORDER BY created_at DESC LIMIT 50',
        args: [ownerId, businessId || null, businessId || null],
      }),
      c.execute({
        sql: "SELECT a.* FROM runner_approvals a JOIN runner_jobs j ON j.id=a.job_id WHERE a.owner_id=? AND j.status='claimed' AND (? IS NULL OR j.business_id=?) ORDER BY a.created_at LIMIT 100",
        args: [ownerId, businessId || null, businessId || null],
      }),
    ]);
    return {
      available: true,
      devices: d.rows.map(rowDevice),
      jobs: j.rows.map((row) => ({
        ...rowJob(row),
        brief: undefined,
        approvals: a.rows
          .filter((x) => x.job_id === row.id)
          .map((x) => ({
            requestId: str(x.request_id),
            method: str(x.method),
            details: parse(x.details_json),
            decision: x.decision as 'approved' | 'denied' | null,
          })),
      })),
    };
  } finally {
    c.close();
  }
}

export async function queueJob(
  r: Runtime,
  ownerId: string,
  input: {
    businessId: string;
    endeavorId: string;
    deviceId: string;
    revision: number;
    brief: string;
    executionMode?: 'codex' | 'computer';
    goal?: string;
  },
) {
  const c = db(r),
    jobId = id('job'),
    t = now();
  try {
    const mode = input.executionMode === 'computer' ? 'computer' : 'codex';
    if (mode === 'computer' && (!input.goal || input.goal.length > 1000))
      throw Error('Computer-use goal is invalid.');
    const d = await c.execute({
      sql: 'SELECT capabilities_json FROM runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL',
      args: [input.deviceId, ownerId],
    });
    if (!d.rows.length) throw Error('Device is not available.');
    if (
      mode === 'computer' &&
      parse(d.rows[0].capabilities_json)?.computerUse !== true
    )
      throw Error('This device was not paired with computer use enabled.');
    const inserted = await c.execute({
      sql: "INSERT INTO runner_jobs(id,owner_id,business_id,endeavor_id,device_id,revision,brief,status,created_at,execution_mode,goal) SELECT ?,?,?,?,?,?,?,'queued',?,?,? WHERE EXISTS (SELECT 1 FROM runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL) AND NOT EXISTS (SELECT 1 FROM runner_jobs WHERE owner_id=? AND business_id=? AND endeavor_id=? AND status IN ('queued','claimed'))",
      args: [
        jobId,
        ownerId,
        input.businessId,
        input.endeavorId,
        input.deviceId,
        input.revision,
        input.brief,
        t,
        mode,
        input.goal || null,
        input.deviceId,
        ownerId,
        ownerId,
        input.businessId,
        input.endeavorId,
      ],
    });
    if (inserted.rowsAffected !== 1)
      throw Error('Device is unavailable or work is already queued.');
    return { id: jobId, createdAt: t };
  } finally {
    c.close();
  }
}
export async function cancelJob(r: Runtime, ownerId: string, jobId: string) {
  const c = db(r);
  try {
    return (
      (
        await c.execute({
          sql: "UPDATE runner_jobs SET status='canceled' WHERE id=? AND owner_id=? AND status IN ('queued','claimed')",
          args: [jobId, ownerId],
        })
      ).rowsAffected === 1
    );
  } finally {
    c.close();
  }
}
export async function claimJob(
  r: Runtime,
  deviceId: string,
  ownerId: string,
  leaseMs = 120_000,
): Promise<RunnerClaim | null> {
  const c = db(r),
    t = now(),
    until = new Date(Date.now() + leaseMs).toISOString(),
    token = newSecret();
  try {
    await c.execute({
      sql: "UPDATE runner_jobs SET status='failed',error='Lease expired; deliberate requeue required' WHERE device_id=? AND owner_id=? AND status='claimed' AND lease_expires_at<=?",
      args: [deviceId, ownerId, t],
    });
    const q = await c.execute({
      sql: "UPDATE runner_jobs SET status='claimed',lease_token_hash=?,lease_expires_at=?,claimed_at=? WHERE id=(SELECT id FROM runner_jobs WHERE owner_id=? AND device_id=? AND status='queued' AND EXISTS (SELECT 1 FROM runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL) AND NOT EXISTS (SELECT 1 FROM runner_jobs active WHERE active.device_id=runner_jobs.device_id AND active.status='claimed' AND active.lease_expires_at>?) ORDER BY created_at LIMIT 1) RETURNING *",
      args: [
        hashSecret(token),
        until,
        t,
        ownerId,
        deviceId,
        deviceId,
        ownerId,
        t,
      ],
    });
    const x = q.rows[0];
    return x
      ? {
          job: rowJob(x),
          leaseToken: token,
          brief: str(x.brief),
          goal: x.goal ? str(x.goal) : undefined,
        }
      : null;
  } finally {
    c.close();
  }
}
async function lease(
  r: Runtime,
  ownerId: string,
  deviceId: string,
  jobId: string,
  leaseToken: string,
) {
  const c = db(r);
  const t = now();
  try {
    const q = await c.execute({
      sql: "SELECT j.* FROM runner_jobs j JOIN runner_devices d ON d.id=j.device_id AND d.owner_id=j.owner_id AND d.revoked_at IS NULL WHERE j.id=? AND j.owner_id=? AND j.device_id=? AND j.status IN ('claimed','canceled') AND j.lease_token_hash=? AND j.lease_expires_at>? AND j.claimed_at>?",
      args: [
        jobId,
        ownerId,
        deviceId,
        hashSecret(leaseToken),
        t,
        new Date(Date.now() - 30 * 60_000).toISOString(),
      ],
    });
    if (!q.rows[0]) {
      c.close();
      return null;
    }
    return { c, row: q.rows[0] };
  } catch (e) {
    c.close();
    throw e;
  }
}
export async function heartbeat(
  r: Runtime,
  ownerId: string,
  deviceId: string,
  jobId: string,
  token: string,
) {
  const x = await lease(r, ownerId, deviceId, jobId, token);
  if (!x) return null;
  try {
    const t = now();
    await x.c.execute({
      sql: 'UPDATE runner_devices SET last_seen_at=? WHERE id=?',
      args: [t, deviceId],
    });
    if (x.row.status === 'claimed') {
      const updated = await x.c.execute({
        sql: "UPDATE runner_jobs SET lease_expires_at=? WHERE id=? AND owner_id=? AND device_id=? AND status='claimed' AND lease_token_hash=? AND lease_expires_at>? AND EXISTS (SELECT 1 FROM runner_devices d WHERE d.id=runner_jobs.device_id AND d.revoked_at IS NULL)",
        args: [
          new Date(
            Math.min(
              Date.now() + 120_000,
              new Date(str(x.row.claimed_at)).getTime() + 30 * 60_000,
            ),
          ).toISOString(),
          jobId,
          ownerId,
          deviceId,
          hashSecret(token),
          t,
        ],
      });
      if (updated.rowsAffected !== 1) return null;
    }
    const a = await x.c.execute({
      sql: 'SELECT request_id,method,details_json,decision FROM runner_approvals WHERE job_id=? ORDER BY created_at',
      args: [jobId],
    });
    return {
      cancel: x.row.status === 'canceled',
      decisions: a.rows.map((v: any) => ({
        requestId: str(v.request_id),
        method: str(v.method),
        details: parse(v.details_json),
        decision: v.decision || null,
      })) as RunnerDecision[],
    };
  } finally {
    x.c.close();
  }
}
export async function recordEvent(
  r: Runtime,
  ownerId: string,
  deviceId: string,
  jobId: string,
  token: string,
  e: ApprovalEvent,
) {
  const x = await lease(r, ownerId, deviceId, jobId, token);
  if (!x) return false;
  try {
    if (x.row.status !== 'claimed') return false;
    const inserted = await x.c.execute({
      sql: "INSERT OR IGNORE INTO runner_approvals(request_id,job_id,owner_id,method,details_json,decision,created_at) SELECT ?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM runner_jobs j JOIN runner_devices d ON d.id=j.device_id AND d.revoked_at IS NULL WHERE j.id=? AND j.status='claimed' AND j.lease_token_hash=? AND j.lease_expires_at>?) AND (SELECT COUNT(*) FROM runner_approvals WHERE job_id=?)<100",
      args: [
        e.requestId,
        jobId,
        ownerId,
        e.method,
        json(e.details),
        now(),
        jobId,
        hashSecret(token),
        now(),
        jobId,
      ],
    });
    if (inserted.rowsAffected === 1) return true;
    const existing = await x.c.execute({
      sql: 'SELECT 1 FROM runner_approvals WHERE job_id=? AND request_id=?',
      args: [jobId, e.requestId],
    });
    return existing.rows.length === 1;
  } finally {
    x.c.close();
  }
}
export async function decideApproval(
  r: Runtime,
  ownerId: string,
  jobId: string,
  requestId: string,
  decision: 'approved' | 'denied',
) {
  const c = db(r),
    t = now();
  try {
    const q = await c.execute({
      sql: "UPDATE runner_approvals SET decision=?,decided_at=? WHERE request_id=? AND job_id=? AND owner_id=? AND decision IS NULL AND EXISTS (SELECT 1 FROM runner_jobs j JOIN runner_devices d ON d.id=j.device_id AND d.revoked_at IS NULL WHERE j.id=? AND j.owner_id=? AND j.status='claimed' AND j.lease_expires_at>? AND j.claimed_at>?)",
      args: [
        decision,
        t,
        requestId,
        jobId,
        ownerId,
        jobId,
        ownerId,
        t,
        new Date(Date.now() - 30 * 60_000).toISOString(),
      ],
    });
    return q.rowsAffected === 1;
  } finally {
    c.close();
  }
}
export async function completedJobTarget(
  r: Runtime,
  ownerId: string,
  jobId: string,
) {
  const c = db(r);
  try {
    const q = await c.execute({
      sql: "SELECT business_id,endeavor_id,result_json FROM runner_jobs WHERE id=? AND owner_id=? AND status='completed'",
      args: [jobId, ownerId],
    });
    const row = q.rows[0];
    if (!row) return null;
    let result: unknown = null;
    try {
      result = JSON.parse(str(row.result_json));
    } catch {}
    return {
      businessId: str(row.business_id),
      endeavorId: str(row.endeavor_id),
      result,
    };
  } finally {
    c.close();
  }
}
export async function finishJob(
  r: Runtime,
  ownerId: string,
  deviceId: string,
  jobId: string,
  token: string,
  result: unknown,
  failed = false,
) {
  const x = await lease(r, ownerId, deviceId, jobId, token);
  if (!x) {
    const c = db(r);
    try {
      const q = await c.execute({
        sql: 'SELECT status,lease_token_hash FROM runner_jobs WHERE id=? AND owner_id=? AND device_id=?',
        args: [jobId, ownerId, deviceId],
      });
      return (
        q.rows[0]?.status === (failed ? 'failed' : 'completed') &&
        q.rows[0]?.lease_token_hash === hashSecret(token)
      );
    } finally {
      c.close();
    }
  }
  try {
    if (x.row.status !== 'claimed') return false;
    const q = await x.c.execute({
      sql: `UPDATE runner_jobs SET status=?,result_json=?,completed_at=?,lease_expires_at=NULL WHERE id=? AND status='claimed' AND lease_token_hash=? AND lease_expires_at>? AND EXISTS (SELECT 1 FROM runner_devices WHERE id=? AND owner_id=? AND revoked_at IS NULL)`,
      args: [
        failed ? 'failed' : 'completed',
        json(result),
        now(),
        jobId,
        hashSecret(token),
        now(),
        deviceId,
        ownerId,
      ],
    });
    return q.rowsAffected === 1;
  } finally {
    x.c.close();
  }
}
