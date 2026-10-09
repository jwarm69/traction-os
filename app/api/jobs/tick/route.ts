import { timingSafeEqual } from 'node:crypto';
import { runtime } from '@/lib/runtime';
import { loadBusiness, updateBusinessData } from '@/lib/turso';
import { claimDue, listDue, markGenerated, releaseLease } from '@/lib/memo-store';
import { generateMemo, memoFor, periodFor } from '@/lib/memo';
import type { BusinessDocument } from '@/lib/engine';

/**
 * Scheduled memo generation. Any scheduler that can make an HTTPS request
 * drives it. It never calls a model, never sends anything, and never acts as a
 * user: it computes memos from stored state under a per-business lease and the
 * ISO week key keeps one memo per business per week however often it fires.
 */
export const maxDuration = 60;

const out = (x: unknown, s = 200) =>
  Response.json(x, { status: s, headers: { 'Cache-Control': 'no-store' } });

function authorized(req: Request, secret: string | undefined) {
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get('authorization') || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const r = runtime();
  if (!authorized(req, r.JOB_SECRET)) return out({ error: 'Unauthorized.' }, 401);
  const at = new Date();
  const due = await listDue(r, at, 50);
  let generated = 0,
    skipped = 0,
    conflicts = 0;
  for (const schedule of due) {
    if (!(await claimDue(r, schedule.ownerId, schedule.businessId, 120_000, at))) {
      skipped += 1;
      continue;
    }
    try {
      const row = await loadBusiness(r, schedule.ownerId, schedule.businessId);
      if (!row) {
        await markGenerated(r, schedule.ownerId, schedule.businessId, periodFor(at).weekKey, at);
        skipped += 1;
        continue;
      }
      const business = JSON.parse(row.data) as BusinessDocument;
      const key = periodFor(at).weekKey;
      if (memoFor(business, key)) {
        await markGenerated(r, schedule.ownerId, schedule.businessId, key, at);
        skipped += 1;
        continue;
      }
      generateMemo(business, { generatedBy: 'schedule', at });
      const saved = await updateBusinessData(
        r,
        schedule.ownerId,
        schedule.businessId,
        JSON.stringify(business),
        row.revision,
      );
      if (!saved) {
        await releaseLease(r, schedule.ownerId, schedule.businessId);
        conflicts += 1;
        continue;
      }
      await markGenerated(r, schedule.ownerId, schedule.businessId, key, at);
      generated += 1;
    } catch (error) {
      console.error('memo tick failed', schedule.businessId, error);
      await releaseLease(r, schedule.ownerId, schedule.businessId).catch(() => undefined);
      skipped += 1;
    }
  }
  return out({ due: due.length, generated, skipped, conflicts, at: at.toISOString() });
}
