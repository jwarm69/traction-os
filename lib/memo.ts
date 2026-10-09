import {
  addLog,
  uid,
  type BusinessDocument,
  type Endeavor,
  type EvidenceBar,
  type MemoLine,
  type MemoNumbers,
  type MemoVerdict,
  type PerformanceMemo,
} from './engine.ts';
import { campaignRow, type CampaignRow } from './campaigns.ts';
import { addChecklistItem, endeavorFor, transitionEndeavor, workState } from './work.ts';

/**
 * The weekly performance memo: one line per active campaign, judged against
 * the evidence bar the owner set before launch. Computed, never generated: no
 * I/O and no model, so it spends nothing and tests like weeklyReview.
 */

export const MAX_MEMOS = 12;
export const MEMO_FOOTER =
  'Verdicts are proposals from fixed rules against the evidence bar you set. They are not significance tests and they do not attribute outcomes to campaigns.';
const DAY = 86_400_000;
const MAX_CAVEATS = 5;

export const verdictLabels: Record<MemoVerdict, string> = {
  keep: 'Keep',
  kill: 'Kill',
  change: 'Change',
  test: 'Test',
  wait: 'Wait',
};

const metricNames: Record<EvidenceBar['successMetric'], string> = {
  conversations: 'conversations',
  spend: 'spend',
  leads: 'leads',
  qualified: 'qualified leads',
  deals: 'deals',
  revenue: 'revenue',
  churned: 'churned customers',
};

const fmt = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (at: string) => at.slice(0, 10);

/** ISO 8601 week key (Monday-based, UTC), e.g. "2026-W41". */
export function weekKey(at: string | number | Date) {
  const date = new Date(at);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const year = utc.getUTCFullYear();
  const week = Math.ceil(((utc.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The UTC week containing `now`, from Monday to `now`. For previews only. */
export function currentWeek(now = Date.now()) {
  const today = new Date(now);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const weekday = today.getUTCDay() || 7;
  const start = new Date(midnight - (weekday - 1) * DAY).toISOString();
  return { weekKey: weekKey(start), periodStart: start, periodEnd: new Date(now).toISOString() };
}

/** The Monday-to-Sunday UTC week before the one containing `now`. */
export function lastCompletedWeek(now = Date.now()) {
  const today = new Date(now);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const weekday = today.getUTCDay() || 7;
  const thisMonday = midnight - (weekday - 1) * DAY;
  const start = new Date(thisMonday - 7 * DAY).toISOString();
  const end = new Date(thisMonday - 1).toISOString();
  return { weekKey: weekKey(start), periodStart: start, periodEnd: end };
}

function numbers(row: CampaignRow): MemoNumbers {
  return {
    contacts: row.contacts,
    contacted: row.contacted,
    conversations: row.conversations,
    won: row.won,
    spend: row.spend,
    leads: row.leads,
    qualified: row.qualified,
    deals: row.deals,
    revenue: row.revenue,
    churned: row.churned,
    costPerConversation: row.costPerConversation,
  };
}

function successValue(bar: EvidenceBar, row: CampaignRow) {
  // Conversations come from linked pipeline contacts. With none linked, the
  // count is unknown rather than zero.
  if (bar.successMetric === 'conversations')
    return row.contacts ? row.conversations : null;
  return row[bar.successMetric];
}

/** Bar progress and exhaustion against the cumulative row. */
export function evaluateBar(bar: EvidenceBar, row: CampaignRow, now = Date.now()) {
  const value = successValue(bar, row);
  const parts: string[] = [];
  let exhausted = false;
  let elapsedDays: number | null = null;
  if (bar.maxSpend !== undefined) {
    if (row.spend === null) parts.push(`spend unknown of ${fmt(bar.maxSpend)}`);
    else {
      parts.push(`spend ${fmt(row.spend)} of ${fmt(bar.maxSpend)}`);
      if (row.spend >= bar.maxSpend) exhausted = true;
    }
  }
  if (bar.maxDays !== undefined) {
    if (!bar.startedAt) parts.push(`not started; ${bar.maxDays}-day limit`);
    else {
      elapsedDays = Math.max(0, Math.floor((now - Date.parse(bar.startedAt)) / DAY));
      parts.push(`day ${Math.min(elapsedDays + 1, bar.maxDays)} of ${bar.maxDays}`);
      if (elapsedDays >= bar.maxDays) exhausted = true;
    }
  }
  if (bar.maxContacts !== undefined) {
    parts.push(`${row.contacted} of ${bar.maxContacts} contacted`);
    if (row.contacted >= bar.maxContacts) exhausted = true;
  }
  parts.push(
    `${value === null ? 'unknown' : fmt(value)} of ${fmt(bar.successTarget)} ${metricNames[bar.successMetric]}`,
  );
  return { value, exhausted, elapsedDays, progress: parts.join('; ') };
}

function verdictFor(
  endeavor: Endeavor,
  cumulative: CampaignRow,
  period: { since: string; until: string },
  now: number,
): Pick<MemoLine, 'proposedVerdict' | 'reason' | 'bar'> {
  const bar = endeavor.evidenceBar;
  if (!bar)
    return {
      proposedVerdict: 'wait',
      reason:
        'No evidence bar is set, so this campaign cannot be judged. Set a win target and a spend, day, or contact limit.',
    };
  if (!bar.setAt)
    return {
      proposedVerdict: 'wait',
      reason: 'Confirm the proposed evidence bar before this campaign can be judged.',
    };
  const evaluation = evaluateBar(bar, cumulative, now);
  const summary = {
    successMetric: bar.successMetric,
    successValue: evaluation.value,
    successTarget: bar.successTarget,
    exhausted: evaluation.exhausted,
    progress: evaluation.progress,
  };
  const metric = metricNames[bar.successMetric];
  const target = fmt(bar.successTarget);
  const result = (proposedVerdict: MemoVerdict, reason: string) => ({
    proposedVerdict,
    reason,
    bar: summary,
  });
  if (endeavor.status === 'blocked')
    return result(
      'change',
      `Blocked: ${endeavor.blockedReason || 'no reason recorded'}. Unblock, change the approach, or stop it.`,
    );
  if (endeavor.status === 'ready' && !cumulative.lastEvidenceAt)
    return result('test', 'Prepared and not started. Start it or park it.');
  const value = evaluation.value;
  if (value === null && !evaluation.exhausted)
    return result('wait', `${capitalize(metric)} has not been recorded yet; ${evaluation.progress}.`);
  if (value !== null && value >= bar.successTarget)
    return result(
      'keep',
      `Met the bar: ${fmt(value)} ${metric} against ${target}; ${evaluation.progress}. Repeat with one variable changed.`,
    );
  if (evaluation.exhausted) {
    // Unknown is not zero: a limit reached without the metric recorded cannot
    // justify a kill. It needs a recorded result or an owner decision.
    if (value === null)
      return result(
        'change',
        `Reached the limit, but ${metric} was never recorded, so it cannot be judged. Record the result or stop it; ${evaluation.progress}.`,
      );
    if (value >= bar.successTarget / 2)
      return result(
        'change',
        `Reached the limit at ${fmt(value)} of ${target} ${metric}. Close enough to change one thing, not to repeat as is.`,
      );
    return result(
      'kill',
      `Reached the limit at ${fmt(value)} of ${target} ${metric}. Stop, or restart with a new hypothesis.`,
    );
  }
  const adjust = endeavor.observations.find(
    (item) =>
      item.verdict === 'adjust' &&
      item.observedAt >= period.since &&
      item.observedAt <= period.until,
  );
  if (adjust)
    return result(
      'change',
      `You flagged an adjustment on ${day(adjust.observedAt)}: ${adjust.summary.slice(0, 200)}`,
    );
  return result('wait', `${capitalize(evaluation.progress)}. Not enough evidence to decide.`);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function caveatsFor(
  endeavor: Endeavor,
  cumulative: CampaignRow,
  elapsedDays: number | null,
) {
  const caveats: string[] = [];
  const bar = endeavor.evidenceBar?.setAt ? endeavor.evidenceBar : undefined;
  if (bar?.revisedAt)
    caveats.push(`The evidence bar was changed on ${day(bar.revisedAt)}, after the campaign started.`);
  if (bar && bar.successMetric !== 'conversations') {
    const unknown = cumulative.unknowns.find((item) =>
      item.toLowerCase().includes(`classified as ${bar.successMetric}`),
    );
    if (unknown) caveats.push(unknown);
  }
  if (cumulative.spend !== null)
    caveats.push('Spend comes from owner-entered or imported signals, not a synced ad account.');
  if (bar?.successMetric === 'revenue' && cumulative.won === 0)
    caveats.push('Revenue here is signal-classified; no deals are won in the pipeline.');
  if (
    bar?.maxSpend !== undefined &&
    bar.maxDays !== undefined &&
    elapsedDays !== null &&
    elapsedDays >= 3 &&
    cumulative.spend !== null &&
    cumulative.spend > 0 &&
    cumulative.spend < bar.maxSpend
  ) {
    const perDay = cumulative.spend / elapsedDays;
    const exhaustionDay = Math.ceil(bar.maxSpend / perDay);
    if (exhaustionDay < bar.maxDays)
      caveats.push(`On pace to reach the spend limit on day ${exhaustionDay} of ${bar.maxDays}.`);
  }
  if (cumulative.stale)
    caveats.push(
      cumulative.lastEvidenceAt
        ? `No new evidence since ${day(cumulative.lastEvidenceAt)}.`
        : 'In progress with no evidence recorded yet.',
    );
  return caveats.slice(0, MAX_CAVEATS);
}

function summarize(lines: MemoLine[]) {
  if (!lines.length) return 'No active campaigns this week.';
  const counts = new Map<MemoVerdict, number>();
  for (const line of lines)
    counts.set(line.proposedVerdict, (counts.get(line.proposedVerdict) || 0) + 1);
  const order: MemoVerdict[] = ['kill', 'change', 'keep', 'test', 'wait'];
  const parts = order
    .filter((verdict) => counts.get(verdict))
    .map((verdict) => `${counts.get(verdict)} ${verdictLabels[verdict].toLowerCase()}`);
  const sentences = [
    `${lines.length} campaign${lines.length === 1 ? '' : 's'} reviewed: ${parts.join(', ')}.`,
  ];
  const priced = lines
    .filter((line) => line.cumulative.costPerConversation !== null)
    .sort((a, z) => a.cumulative.costPerConversation! - z.cumulative.costPerConversation!);
  if (priced.length >= 2)
    sentences.push(
      `Lowest cost per conversation: ${priced[0].code} at ${fmt(priced[0].cumulative.costPerConversation!)}.`,
    );
  const waiting = lines.filter((line) => !line.bar).length;
  if (waiting)
    sentences.push(
      `${waiting} ${waiting === 1 ? 'line is' : 'lines are'} waiting on an evidence bar.`,
    );
  return sentences.join(' ');
}

/** Lines and exclusions for a period. Pure; reads the business, writes nothing. */
export function memoLines(
  business: BusinessDocument,
  period: { periodStart: string; periodEnd: string },
  now = Date.now(),
) {
  const lines: MemoLine[] = [];
  const excluded: PerformanceMemo['excluded'] = [];
  const window = { since: period.periodStart, until: period.periodEnd };
  for (const endeavor of workState(business).endeavors) {
    if (endeavor.createdAt > window.until) {
      excluded.push({ code: endeavor.code, reason: 'Started after this period.' });
      continue;
    }
    const active = ['in_progress', 'ready', 'blocked'].includes(endeavor.status);
    const endedAt = endeavor.status === 'completed' ? endeavor.completedAt : endeavor.updatedAt;
    const endedInPeriod =
      (endeavor.status === 'completed' || endeavor.status === 'stopped') &&
      !!endedAt &&
      endedAt >= window.since &&
      endedAt <= window.until;
    if (!active && !endedInPeriod) {
      excluded.push({
        code: endeavor.code,
        reason:
          endeavor.status === 'preparing'
            ? 'Still preparing.'
            : `${capitalize(endeavor.status)} before this period.`,
      });
      continue;
    }
    const cumulative = campaignRow(business, endeavor.id, undefined, now);
    const periodRow = campaignRow(business, endeavor.id, window, now);
    const verdict = verdictFor(endeavor, cumulative, window, now);
    const elapsed =
      endeavor.evidenceBar?.setAt
        ? evaluateBar(endeavor.evidenceBar, cumulative, now).elapsedDays
        : null;
    lines.push({
      endeavorId: endeavor.id,
      code: endeavor.code,
      title: endeavor.title,
      status: endeavor.status,
      period: numbers(periodRow),
      cumulative: numbers(cumulative),
      ...verdict,
      caveats: caveatsFor(endeavor, cumulative, elapsed),
    });
  }
  return { lines, excluded };
}

/**
 * Build the memo for the last completed week and store it, unless one already
 * exists for that week. Returns the memo and whether it was created.
 */
export function generateMemo(
  business: BusinessDocument,
  generatedBy: PerformanceMemo['generatedBy'],
  now = Date.now(),
) {
  const period = lastCompletedWeek(now);
  const existing = (business.memos || []).find((memo) => memo.weekKey === period.weekKey);
  if (existing) return { memo: existing, created: false };
  const { lines, excluded } = memoLines(business, period, now);
  if (!lines.length)
    throw Error(
      'No campaign was active last week. The first memo covers the first full week a campaign runs; the preview shows this week so far.',
    );
  const memo: PerformanceMemo = {
    id: uid('memo'),
    ...period,
    createdAt: new Date(now).toISOString(),
    generatedBy,
    summary: summarize(lines),
    lines,
    excluded,
  };
  business.memos = [memo, ...(business.memos || [])].slice(0, MAX_MEMOS);
  addLog(business, `Weekly memo ${memo.weekKey} prepared (${lines.length} line${lines.length === 1 ? '' : 's'}).`);
  return { memo, created: true };
}

/**
 * Lazy fallback for the weekly schedule: prepare last week's memo on load when
 * it is missing and there is at least one campaign to judge.
 */
export function memoDue(business: BusinessDocument, now = Date.now()) {
  const { weekKey: key } = lastCompletedWeek(now);
  if ((business.memos || []).some((memo) => memo.weekKey === key)) return false;
  return memoLines(business, lastCompletedWeek(now), now).lines.length > 0;
}

/**
 * Recompute a memo's lines from current records, for evidence entered after it
 * was prepared. Decisions already recorded are kept on their lines.
 */
export function refreshMemo(business: BusinessDocument, memoId: string, now = Date.now()) {
  const memo = memoFor(business, memoId);
  const decisions = new Map(
    memo.lines.filter((line) => line.decision).map((line) => [line.endeavorId, line.decision]),
  );
  const { lines, excluded } = memoLines(business, memo, now);
  for (const line of lines) {
    const decision = decisions.get(line.endeavorId);
    if (decision) line.decision = decision;
  }
  memo.lines = lines;
  memo.excluded = excluded;
  memo.summary = summarize(lines);
  memo.refreshedAt = new Date(now).toISOString();
  addLog(business, `Weekly memo ${memo.weekKey} refreshed from current records.`);
  return memo;
}

export function memoFor(business: BusinessDocument, memoId: string) {
  const memo = (business.memos || []).find((item) => item.id === memoId);
  if (!memo) throw Error('Memo not found.');
  return memo;
}

export function undecidedLines(business: BusinessDocument) {
  const latest = business.memos?.[0];
  return latest ? latest.lines.filter((line) => !line.decision).length : 0;
}

/**
 * Record the owner's decision on one line and apply the smallest honest side
 * effect. A decision never creates new work; spinning up a follow-up test is
 * an Explore action the owner takes with context.
 */
export function decideMemoLine(
  business: BusinessDocument,
  memoId: string,
  endeavorId: string,
  verdict: MemoVerdict,
  note = '',
) {
  const memo = memoFor(business, memoId);
  const line = memo.lines.find((item) => item.endeavorId === endeavorId);
  if (!line) throw Error('Memo line not found.');
  const text = note.trim();
  if ((verdict === 'kill' || verdict === 'change') && !text)
    throw Error(
      verdict === 'kill'
        ? 'Record why you are stopping it. The next Explore session reads this.'
        : 'Record the one thing you will change.',
    );
  const endeavor = endeavorFor(business, endeavorId);
  if (verdict === 'kill' && !['stopped', 'completed'].includes(endeavor.status))
    transitionEndeavor(business, endeavorId, 'stopped');
  if (verdict === 'change')
    addChecklistItem(business, endeavorId, `Change after memo ${memo.weekKey}: ${text}`);
  if (verdict === 'test' && endeavor.status === 'ready')
    transitionEndeavor(business, endeavorId, 'in_progress');
  line.decision = {
    verdict,
    ...(text ? { note: text } : {}),
    decidedAt: new Date().toISOString(),
  };
  memo.readAt ||= line.decision.decidedAt;
  addLog(
    business,
    `${verdictLabels[verdict]} ${line.code} after memo ${memo.weekKey}${text ? `: ${text}` : '.'}`,
  );
  return line;
}
