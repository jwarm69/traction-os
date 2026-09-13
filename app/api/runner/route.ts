import { authenticateRequest } from '@/lib/auth';
import { loadBusiness } from '@/lib/turso';
import { buildAgentBrief } from '@/lib/agent-brief';
import { runtime } from '@/lib/runtime';
import {
  validateId,
  createPairCode,
  redeemPairCode,
  authenticateDevice,
  revokeDevice,
  listRunner,
  queueJob,
  cancelJob,
  claimJob,
  heartbeat,
  recordEvent,
  finishJob,
  decideApproval,
} from '@/lib/runner-store';
import type { BusinessDocument } from '@/lib/engine';

const out = (x: unknown, status = 200) =>
  Response.json(x, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (e: unknown) =>
  out({ error: e instanceof Error ? e.message : 'Request failed.' }, 400);
async function body(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json'))
    throw Error('JSON content type required.');
  const reader = req.body?.getReader();
  if (!reader) throw Error('Request body required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 100_000) throw Error('Request is too large.');
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  const x = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!x || typeof x !== 'object' || Array.isArray(x))
    throw Error('Expected a JSON object.');
  return x as Record<string, unknown>;
}
function enabled(r: ReturnType<typeof runtime>) {
  if (r.RUNNER_ENABLED !== 'true') return out({ available: false }, 200);
}
function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin)
    throw Error('Cross-origin mutation denied.');
}
function bearer(req: Request) {
  const x = req.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{30,200}$/.test(x))
    throw Error('Device authorization required.');
  return x.slice(7);
}
function text(v: unknown, max: number) {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw Error('Invalid input.');
  return v.trim();
}
async function owner(req: Request, r: ReturnType<typeof runtime>) {
  sameOrigin(req);
  const u = await authenticateRequest(r, req);
  if (!u) return null;
  return u;
}
async function device(req: Request, r: ReturnType<typeof runtime>) {
  return authenticateDevice(r, bearer(req));
}

export async function GET(req: Request) {
  const r = runtime(),
    gate = enabled(r);
  if (gate) return gate;
  try {
    const u = await owner(req, r);
    if (!u) return out({ error: 'Authentication required.' }, 401);
    const businessId = new URL(req.url).searchParams.get('businessId');
    return out(
      await listRunner(
        r,
        u.id,
        businessId ? validateId(businessId) : undefined,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  const r = runtime(),
    gate = enabled(r);
  if (gate) return gate;
  let x: Record<string, unknown>;
  try {
    x = await body(req);
  } catch (e) {
    return fail(e);
  }
  const op = typeof x.op === 'string' ? x.op : '';
  try {
    if (op === 'pair') {
      const p = await redeemPairCode(r, x.code, x.deviceName);
      return out(p, 201);
    }
    const deviceOperation = [
      'claim',
      'heartbeat',
      'event',
      'complete',
      'fail',
    ].includes(op);
    const dev = deviceOperation ? await device(req, r) : null;
    if (deviceOperation && !dev)
      return out({ error: 'Device is revoked or unauthorized.' }, 401);
    if (dev) {
      if (op === 'claim')
        return out(await claimJob(r, dev.deviceId, dev.ownerId));
      const jobId = validateId(x.jobId, 'job id'),
        token = text(x.leaseToken, 200);
      if (op === 'heartbeat') {
        const result = await heartbeat(
          r,
          dev.ownerId,
          dev.deviceId,
          jobId,
          token,
        );
        return result
          ? out(result)
          : out({ error: 'Lease is invalid or expired.' }, 409);
      }
      if (op === 'event') {
        const method = text(x.method, 200);
        if (
          ![
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
          ].includes(method)
        )
          throw Error('Unsupported approval request.');
        if (JSON.stringify(x.details ?? null).length > 24000)
          throw Error('Approval preview is too large.');
        const result = await recordEvent(
          r,
          dev.ownerId,
          dev.deviceId,
          jobId,
          token,
          {
            requestId: text(x.requestId, 200),
            method,
            details: x.details ?? null,
            decision: null,
          },
        );
        return result
          ? out({ ok: true })
          : out({ error: 'Lease is invalid or expired.' }, 409);
      }
      const result = await finishJob(
        r,
        dev.ownerId,
        dev.deviceId,
        jobId,
        token,
        x.result ?? x.error ?? null,
        op === 'fail',
      );
      return result
        ? out({ ok: true })
        : out({ error: 'Lease is invalid or expired.' }, 409);
    }
    const u = await owner(req, r);
    if (!u) return out({ error: 'Authentication required.' }, 401);
    if (op === 'pair_code') return out(await createPairCode(r, u.id), 201);
    if (op === 'revoke_device')
      return out({
        ok: await revokeDevice(r, u.id, validateId(x.deviceId, 'device id')),
      });
    if (op === 'cancel_job')
      return out({
        ok: await cancelJob(r, u.id, validateId(x.jobId, 'job id')),
      });
    if (op === 'decide_approval') {
      const requestId = text(x.requestId, 200),
        jobId = validateId(x.jobId, 'job id');
      if (x.decision !== 'approved' && x.decision !== 'denied')
        throw Error('Decision must be approved or denied.');
      const ok = await decideApproval(r, u.id, jobId, requestId, x.decision);
      return ok
        ? out({ ok })
        : out({ error: 'Approval is already settled or expired.' }, 409);
    }
    if (op === 'queue_job') {
      const businessId = validateId(x.businessId, 'business id'),
        endeavorId = validateId(x.endeavorId, 'endeavor id'),
        deviceId = validateId(x.deviceId, 'device id'),
        revision = Number(x.revision);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw Error('Invalid revision.');
      const b = await loadBusiness(r, u.id, businessId);
      if (!b || b.revision !== revision)
        throw Error('Business revision is stale or unavailable.');
      const business = JSON.parse(b.data) as BusinessDocument,
        endeavor = business.work?.endeavors.find((e) => e.id === endeavorId);
      if (!endeavor) throw Error('Endeavor is unavailable.');
      if (['completed', 'stopped', 'blocked'].includes(endeavor.status)) throw Error('Reopen or unblock this endeavor before sending work.');
      const brief = buildAgentBrief(business, endeavor);
      if (brief.length > 50_000) throw Error('Brief is too large.');
      return out(
        await queueJob(r, u.id, {
          businessId,
          endeavorId,
          deviceId,
          revision,
          brief,
        }),
        201,
      );
    }
    throw Error('Unknown runner operation.');
  } catch (e) {
    return fail(e);
  }
}
