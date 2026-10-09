import {
  addLog,
  memoVerdicts,
  uid,
  type BusinessDocument,
  type Endeavor,
  type EvidenceBar,
  type MemoBar,
  type MemoLine,
  type MemoNumbers,
  type MemoVerdict,
  type PerformanceMemo,
} from './engine.ts';
import { campaignRow, type CampaignRow } from './campaigns.ts';
import { addChecklistItem, endeavorFor, transitionEndeavor } from './work.ts';

/**
 * The weekly performance memo: one line per active campaign, computed from the
 * campaign table against the owner's evidence bar. Deterministic and spend-free,
 * so it can run unattended. Verdicts are proposals from fixed rules; the owner
 * decides, and only the decision changes the work.
 */
export const MEMO_CAP = 26;
export const REVIEW_CAP = 26;
export const MEMO_FOOTER =
  'Verdicts are proposals from fixed rules against the evidence bar you set. They are not significance tests and they do not attribute outcomes to campaigns.';
const DAY = 86_400_000;
const PACING_MIN_DAYS = 3;

/** ISO 8601 week key, e.g. 2026-W41, and the Monday 00:00 UTC it starts. */
export function weekKey(at: Date) {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The seven days ending at `at`, keyed by the ISO week `at` falls in. */
export function periodFor(at = new Date()) {
  const periodEnd = at.toISOString();
  const periodStart = new Date(at.getTime() - 7 * DAY).toISOString();
  return { weekKey: weekKey(at), periodStart, periodEnd };
}

export function memoFor(business: BusinessDocument, key: string) {
  return (business.memos || []).find((memo) => memo.weekKey === key);
}

export function latestMemo(business: BusinessDocument) {
  return (business.memos || [])[0];
}

export function undecidedLines(memo: PerformanceMemo | undefined) {
  return memo ? memo.lines.filter((line) => !line.decision) : [];
}

const numbers = (row: CampaignRow): MemoNumbers => ({
  spend: row.spend,
  contacts: row.contacts,
  conversations: row.conversations,
  leads: row.leads,
  qualified: row.qualified,
  deals: row.deals,
  revenue: row.revenue,
  churned: row.churned,
  costPerConversation: row.costPerConversation,
  lastEvidenceAt: row.lastEvidenceAt,
});

const fmt = (value: number) =>
  Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });

const metricLabel = (metric: EvidenceBar['successMetric']) => metric;

function evaluateBar(
  bar: EvidenceBar,
  cumulative: CampaignRow,
  endeavor: Endeavor,
  now: number,
): { memoBar: MemoBar; elapsedDays: number | null } {
  const successValue =
    bar.successMetric === 'conversations' ? cumulative.conversations : cumulative[bar.successMetric];
  const parts: string[] = [];
  let exhausted = false;
  if (bar.maxSpend !== undefined) {
    const spend = cumulative.spend ?? 0;
    parts.push(`spend ${fmt(spend)} of ${fmt(bar.maxSpend)}`);
    if (spend >= bar.maxSpend) exhausted = true;
  }
  let elapsedDays: number | null = null;
  if (bar.maxDays !== undefined) {
    const start = bar.startedAt || (endeavor.status === 'in_progress' ? endeavor.updatedAt : undefined);
    if (start) {
      elapsedDays = Math.floor((now - Date.parse(start)) / DAY);
      parts.push(`day ${fmt(Math.max(0, elapsedDays))} of ${fmt(bar.maxDays)}`);
      if (elapsedDays >= bar.maxDays) exhausted = true;
    } else parts.push(`${fmt(bar.maxDays)} days once started`);
  }
  if (bar.maxContacts !== undefined) {
    parts.push(`${fmt(cumulative.contacts)} of ${fmt(bar.maxContacts)} contacts`);
    if (cumulative.contacts >= bar.maxContacts) exhausted = true;
  }
  return {
    memoBar: {
      successMetric: bar.successMetric,
      successValue,
      successTarget: bar.successTarget,
      exhausted,
      progress: parts.join('; '),
    },
    elapsedDays,
  };
}

function propose(
  endeavor: Endeavor,
  bar: EvidenceBar | undefined,
  memoBar: MemoBar | undefined,
  period: { periodStart: string; periodEnd: string },
): { verdict: MemoVerdict; reason: string } {
  if (!bar || !bar.setAt || !memoBar)
    return {
      verdict: 'wait',
      reason: bar && !bar.setAt
        ? 'Confirm the proposed evidence bar before this campaign can be judged.'
        : 'No evidence bar is set, so this campaign cannot be judged. Set spend, days, or contacts and a win target.',
    };
  if (endeavor.status === 'blocked')
    return {
      verdict: 'change',
      reason: `Blocked since ${endeavor.updatedAt.slice(0, 10)}: ${endeavor.blockedReason || 'no reason recorded'}. Unblock, change the approach, or stop it.`,
    };
  const metric = metricLabel(memoBar.successMetric);
  if (endeavor.status === 'ready' && memoBar.successValue === null && !memoBar.exhausted)
    return { verdict: 'test', reason: 'Prepared and not started. Start it or park it.' };
  if (memoBar.successValue === null && !memoBar.exhausted)
    return {
      verdict: 'wait',
      reason: `${metric} has not been recorded yet; ${memoBar.progress || 'no stop condition reached'}.`,
    };
  const value = memoBar.successValue ?? 0;
  if (value >= memoBar.successTarget)
    return {
      verdict: 'keep',
      reason: `Met the bar: ${fmt(value)} ${metric} against ${fmt(memoBar.successTarget)}; ${memoBar.progress}. Repeat with one variable changed.`,
    };
  if (memoBar.exhausted && value >= memoBar.successTarget / 2)
    return {
      verdict: 'change',
      reason: `Reached the limit at ${fmt(value)} of ${fmt(memoBar.successTarget)} ${metric}; ${memoBar.progress}. Close enough to change one thing, not to repeat as is.`,
    };
  if (memoBar.exhausted)
    return {
      verdict: 'kill',
      reason: `Reached the limit at ${fmt(value)} of ${fmt(memoBar.successTarget)} ${metric}; ${memoBar.progress}. Stop or restart with a new hypothesis.`,
    };
  const adjust = endeavor.observations.find(
    (item) =>
      item.verdict === 'adjust' &&
      item.observedAt >= period.periodStart &&
      item.observedAt <= period.periodEnd,
  );
  if (adjust)
    return {
      verdict: 'change',
      reason: `Owner flagged an adjustment on ${adjust.observedAt.slice(0, 10)}: ${adjust.summary}`,
    };
  return {
    verdict: 'wait',
    reason: `${fmt(value)} of ${fmt(memoBar.successTarget)} ${metric}; ${memoBar.progress}. Not enough evidence to decide.`,
  };
}

function caveatsFor(
  endeavor: Endeavor,
  bar: EvidenceBar | undefined,
  cumulative: CampaignRow,
  elapsedDays: number | null,
  business: BusinessDocument,
  period: { periodStart: string; periodEnd: string },
) {
  const caveats: string[] = [];
  if (cumulative.spend !== null) caveats.push('Spend was entered or imported by the owner, not synced from a platform.');
  if (cumulative.revenue !== null && cumulative.deals === null)
    caveats.push('Revenue here is signal-classified; no deals are recorded.');
  const changed = business.log.find(
    (entry) =>
      entry.at >= period.periodStart &&
      entry.at <= period.periodEnd &&
      entry.text.startsWith(`Evidence bar changed for ${endeavor.code}`),
  );
  if (changed) caveats.push(`The evidence bar was changed on ${changed.at.slice(0, 10)}.`);
  if (
    bar?.setAt &&
    bar.maxSpend !== undefined &&
    bar.maxDays !== undefined &&
    elapsedDays !== null &&
    elapsedDays >= PACING_MIN_DAYS &&
    cumulative.spend !== null &&
    cumulative.spend > 0
  ) {
    const projectedDay = Math.ceil(bar.maxSpend / (cumulative.spend / elapsedDays));
    if (projectedDay < bar.maxDays)
      caveats.push(`On pace to reach the spend limit on day ${projectedDay} of ${bar.maxDays}.`);
  }
  for (const unknown of cumulative.unknowns)
    if (unknown.startsWith('Cost per conversation')) caveats.push(unknown);
  return caveats;
}

export function generateMemo(
  business: BusinessDocument,
  options: { generatedBy: PerformanceMemo['generatedBy']; at?: Date },
): PerformanceMemo {
  const at = options.at || new Date();
  const period = periodFor(at);
  const existing = memoFor(business, period.weekKey);
  if (existing) return existing;
  const now = at.getTime();
  const lines: MemoLine[] = [];
  const excluded: PerformanceMemo['excluded'] = [];
  for (const endeavor of business.work?.endeavors || []) {
    const active = ['in_progress', 'ready', 'blocked'].includes(endeavor.status);
    const endedInPeriod =
      (endeavor.status === 'completed' || endeavor.status === 'stopped') &&
      endeavor.updatedAt >= period.periodStart &&
      endeavor.updatedAt <= period.periodEnd;
    if (!active && !endedInPeriod) {
      excluded.push({
        code: endeavor.code,
        reason:
          endeavor.status === 'preparing'
            ? 'still preparing'
            : `${endeavor.status.replace('_', ' ')} before this period`,
      });
      continue;
    }
    const cumulative = campaignRow(business, endeavor.id, undefined, now);
    const periodRow = campaignRow(
      business,
      endeavor.id,
      { since: period.periodStart, until: period.periodEnd },
      now,
    );
    const bar = endeavor.evidenceBar;
    const evaluated = bar?.setAt ? evaluateBar(bar, cumulative, endeavor, now) : undefined;
    const proposed = propose(endeavor, bar, evaluated?.memoBar, period);
    lines.push({
      endeavorId: endeavor.id,
      code: endeavor.code,
      title: endeavor.title,
      status: endeavor.status,
      period: numbers(periodRow),
      cumulative: numbers(cumulative),
      ...(evaluated ? { bar: evaluated.memoBar } : {}),
      proposedVerdict: proposed.verdict,
      reason: proposed.reason,
      caveats: caveatsFor(endeavor, bar, cumulative, evaluated?.elapsedDays ?? null, business, period),
    });
  }
  const memo: PerformanceMemo = {
    id: uid('memo'),
    weekKey: period.weekKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    createdAt: period.periodEnd,
    generatedBy: options.generatedBy,
    summary: summarize(lines),
    lines,
    excluded,
  };
  business.memos ||= [];
  business.memos.unshift(memo);
  if (business.memos.length > MEMO_CAP) business.memos.length = MEMO_CAP;
  if (business.reviews.length > REVIEW_CAP) business.reviews.length = REVIEW_CAP;
  addLog(
    business,
    options.generatedBy === 'schedule'
      ? `Weekly memo ${memo.weekKey} generated on schedule.`
      : `Weekly memo ${memo.weekKey} generated${options.generatedBy === 'lazy' ? ' on open' : ' on demand'}.`,
  );
  return memo;
}

export function summarize(lines: MemoLine[]) {
  if (!lines.length)
    return 'No active campaigns this week. Select an idea in Explore or prepare a guided proposal to start one.';
  const counts = Object.fromEntries(memoVerdicts.map((v) => [v, 0])) as Record<MemoVerdict, number>;
  for (const line of lines) counts[line.proposedVerdict] += 1;
  const parts = memoVerdicts
    .filter((v) => counts[v])
    .map((v) => `${counts[v]} ${v}`);
  const sentences = [
    `${lines.length} campaign${lines.length === 1 ? '' : 's'} reviewed: ${parts.join(', ')}.`,
  ];
  const priced = lines.filter((line) => line.cumulative.costPerConversation !== null);
  if (priced.length >= 2) {
    const best = priced.reduce((a, z) =>
      (z.cumulative.costPerConversation as number) < (a.cumulative.costPerConversation as number) ? z : a,
    );
    sentences.push(
      `${best.code} has the lowest cost per conversation at ${fmt(best.cumulative.costPerConversation as number)}.`,
    );
  }
  const waiting = lines.filter(
    (line) => line.proposedVerdict === 'wait' && (!line.bar || /evidence bar/.test(line.reason)),
  ).length;
  if (waiting) sentences.push(`${waiting} ${waiting === 1 ? 'is' : 'are'} waiting on an evidence bar.`);
  return sentences.join(' ');
}

/** Records the owner's decision and applies the smallest honest side effect. */
export function decideMemoLine(
  business: BusinessDocument,
  memoId: string,
  endeavorId: string,
  verdict: MemoVerdict,
  note = '',
) {
  const memo = (business.memos || []).find((item) => item.id === memoId);
  if (!memo) throw Error('Memo not found.');
  const line = memo.lines.find((item) => item.endeavorId === endeavorId);
  if (!line) throw Error('This campaign is not in that memo.');
  if (!memoVerdicts.includes(verdict))
    throw Error(`Choose a verdict: ${memoVerdicts.join(', ')}.`);
  const trimmed = note.trim();
  if ((verdict === 'kill' || verdict === 'change') && !trimmed)
    throw Error(`Write one line on why before recording ${verdict}. It is what the next plan reads.`);
  const at = new Date().toISOString();
  const endeavor = endeavorFor(business, endeavorId);
  if (verdict === 'kill' && endeavor.status !== 'stopped')
    transitionEndeavor(business, endeavorId, 'stopped');
  if (verdict === 'change')
    addChecklistItem(business, endeavorId, `Change after memo ${memo.weekKey}: ${trimmed}`);
  if (verdict === 'test' && endeavor.status === 'ready')
    transitionEndeavor(business, endeavorId, 'in_progress');
  line.decision = { verdict, decidedAt: at, ...(trimmed ? { note: trimmed } : {}) };
  addLog(
    business,
    `${verdict[0].toUpperCase()}${verdict.slice(1)} decided for ${line.code} after memo ${memo.weekKey}${trimmed ? `: ${trimmed}` : '.'}`,
  );
  return line;
}

export function narrationPrompt(memo: PerformanceMemo) {
  const input = {
    weekKey: memo.weekKey,
    summary: memo.summary,
    lines: memo.lines.map((line) => ({
      code: line.code,
      title: line.title,
      verdict: line.proposedVerdict,
      reason: line.reason,
      progress: line.bar?.progress,
      caveats: line.caveats,
    })),
  };
  return `Write this weekly performance memo the way a sharp analyst would, in under 250 words. Return exactly one JSON object shaped like {"narrative":"..."}. Keep every number and every proposed verdict exactly as given. Mention every campaign by its code and end each campaign's paragraph with its verdict word. End the memo with the one decision the owner should make first. Do not add numbers, comparisons, or causes that are not in the input. Memo: ${JSON.stringify(input)}`.slice(0, 28000);
}

/** The model renders; the code decides. A narration that disagrees with a line is rejected. */
export function parseNarration(value: unknown, memo: PerformanceMemo) {
  const text =
    value && typeof value === 'object' && typeof (value as { narrative?: unknown }).narrative === 'string'
      ? ((value as { narrative: string }).narrative || '').trim()
      : '';
  if (!text) throw Error('The narration was empty and was not saved.');
  if (text.length > 4000) throw Error('The narration was too long to save.');
  for (const line of memo.lines) {
    if (!text.includes(line.code))
      throw Error(`The narration disagreed with the computed memo and was not saved (missing ${line.code}).`);
    const window = text.slice(text.indexOf(line.code));
    const paragraph = window.split(/\n\s*\n/)[0].toLowerCase();
    const others = memoVerdicts.filter((v) => v !== line.proposedVerdict);
    const asserted = others.find((v) => new RegExp(`\\b${v}\\b`).test(paragraph));
    if (asserted && !new RegExp(`\\b${line.proposedVerdict}\\b`).test(paragraph))
      throw Error(
        `The narration disagreed with the computed memo and was not saved (${line.code} reads ${asserted}, memo says ${line.proposedVerdict}).`,
      );
  }
  return text;
}
