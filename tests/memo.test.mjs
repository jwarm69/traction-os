import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addContact, moveContact } from '../lib/pipeline.ts';
import {
  defaultWorkBrief,
  proposedEvidenceBar,
  selectIdea,
  setEvidenceBar,
  transitionEndeavor,
} from '../lib/work.ts';
import {
  decideMemoLine,
  generateMemo,
  currentWeek,
  lastCompletedWeek,
  MAX_MEMOS,
  memoDue,
  memoLines,
  refreshMemo,
  undecidedLines,
  weekKey,
} from '../lib/memo.ts';
import { ownerQueue } from '../lib/owner-queue.ts';

const DAY = 86_400_000;
// Wednesday 2026-10-14 12:00 UTC. Last completed week is 2026-W41 (Oct 5–11).
const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const IN_PERIOD = '2026-10-07T10:00:00.000Z';
const CREATED = '2026-10-01T09:00:00.000Z';

const idea = (title, kind = 'outreach') => ({
  title,
  kind,
  description: `Fixture ${title}`,
  audience: 'Golf coaches',
  outcome: 'A reviewed result',
  ownerNotes: '',
  sources: [],
});

function fixture(status = 'in_progress') {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.signals = [];
  business.memos = [];
  business.work = { endeavors: [] };
  business.pipeline = { contacts: [] };
  const e = selectIdea(business, createIdea(business, idea('Coach outreach')).id, defaultWorkBrief(idea('Coach outreach')));
  e.createdAt = CREATED;
  if (status !== 'preparing') transitionEndeavor(business, e.id, 'ready');
  if (status === 'in_progress' || status === 'blocked') transitionEndeavor(business, e.id, 'in_progress');
  if (status === 'blocked') transitionEndeavor(business, e.id, 'blocked', 'Waiting on a coach list');
  return { business, e };
}

function spend(business, e, value, observedAt = IN_PERIOD) {
  business.signals.push({
    id: `sig_${business.signals.length + 1}`,
    metric: 'Ad spend',
    value,
    period: 'week',
    note: '',
    source: 'Owner entry',
    observedAt,
    confidence: 'medium',
    endeavorId: e.id,
    campaignMetric: 'spend',
  });
}

function conversations(business, e, count) {
  for (let i = 0; i < count; i += 1) {
    const contact = addContact(business, { name: `Coach ${i}`, channel: 'email', endeavorId: e.id, source: 'owner' });
    moveContact(business, contact.id, 'contacted');
    moveContact(business, contact.id, 'replied');
    moveContact(business, contact.id, 'conversation');
  }
}

/** Bar with a clock that started `daysAgo` before NOW. */
function bar(business, e, input, daysAgo = 5) {
  setEvidenceBar(business, e.id, input);
  e.evidenceBar.startedAt = new Date(NOW - daysAgo * DAY).toISOString();
}

const line = (business, e) =>
  memoLines(business, lastCompletedWeek(NOW), NOW).lines.find((item) => item.endeavorId === e.id);

await test('week keys follow ISO 8601 across year boundaries', () => {
  assert.equal(weekKey('2026-10-07T00:00:00Z'), '2026-W41');
  assert.equal(weekKey('2027-01-01T00:00:00Z'), '2026-W53');
  assert.equal(weekKey('2025-12-29T00:00:00Z'), '2026-W01');
  const period = lastCompletedWeek(NOW);
  assert.equal(period.weekKey, '2026-W41');
  assert.equal(period.periodStart, '2026-10-05T00:00:00.000Z');
  assert.equal(period.periodEnd, '2026-10-11T23:59:59.999Z');
  // On a Monday the completed week is the one that just ended.
  assert.equal(lastCompletedWeek(Date.parse('2026-10-12T00:30:00Z')).weekKey, '2026-W41');
  assert.deepEqual(currentWeek(NOW), {
    weekKey: '2026-W42',
    periodStart: '2026-10-12T00:00:00.000Z',
    periodEnd: '2026-10-14T12:00:00.000Z',
  });
});

await test('evidence bar validation requires a target and at least one limit', () => {
  const { business, e } = fixture();
  assert.throws(() => setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 5 }), /at least one limit/);
  assert.throws(() => setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 0, maxDays: 14 }), /positive/);
  assert.throws(() => setEvidenceBar(business, e.id, { successMetric: 'clicks', successTarget: 5, maxDays: 14 }), /win/);
  assert.throws(() => setEvidenceBar(business, e.id, { successMetric: 'leads', successTarget: 5, maxDays: 2.5 }), /whole number/);
  const set = setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  assert.ok(set.setAt);
  assert.ok(set.startedAt, 'a bar set on running work starts the clock');
  transitionEndeavor(business, e.id, 'stopped');
  assert.throws(() => setEvidenceBar(business, e.id, { successMetric: 'leads', successTarget: 5, maxDays: 14 }), /Reopen/);
});

await test('the clock starts on the move to in_progress, and changing a started bar is logged', () => {
  const { business, e } = fixture('ready');
  setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  assert.equal(e.evidenceBar.startedAt, undefined);
  transitionEndeavor(business, e.id, 'in_progress');
  assert.ok(e.evidenceBar.startedAt);
  e.evidenceBar.startedAt = new Date(Date.now() - 4 * DAY).toISOString();
  setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 3, maxDays: 14 });
  assert.ok(e.evidenceBar.revisedAt);
  assert.match(business.log[0].text, /Evidence bar changed for AG001 after 4 days of activity/);
});

await test('no bar and an unconfirmed proposed bar both wait', () => {
  const { business, e } = fixture();
  assert.equal(line(business, e).proposedVerdict, 'wait');
  assert.match(line(business, e).reason, /No evidence bar/);
  e.evidenceBar = { successMetric: 'conversations', successTarget: 5, maxDays: 14, setAt: '' };
  assert.equal(line(business, e).proposedVerdict, 'wait');
  assert.match(line(business, e).reason, /Confirm the proposed/);
  assert.equal(line(business, e).bar, undefined);
});

await test('blocked work proposes change', () => {
  const { business, e } = fixture('blocked');
  bar(business, e, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  const result = line(business, e);
  assert.equal(result.proposedVerdict, 'change');
  assert.match(result.reason, /Waiting on a coach list/);
});

await test('ready work with no evidence proposes test, and deciding test starts it', () => {
  const { business, e } = fixture('ready');
  setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  assert.equal(line(business, e).proposedVerdict, 'test');
  const { memo } = generateMemo(business, 'owner', NOW);
  decideMemoLine(business, memo.id, e.id, 'test');
  assert.equal(e.status, 'in_progress');
  assert.ok(e.evidenceBar.startedAt);
});

await test('an unrecorded metric waits until the bar is exhausted, and is never treated as zero', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'leads', successTarget: 10, maxDays: 14 }, 5);
  spend(business, e, 50);
  let result = line(business, e);
  assert.equal(result.proposedVerdict, 'wait');
  assert.match(result.reason, /Leads has not been recorded/);
  assert.equal(result.bar.successValue, null);
  e.evidenceBar.startedAt = new Date(NOW - 20 * DAY).toISOString();
  result = line(business, e);
  assert.equal(result.proposedVerdict, 'change', 'a limit reached with no recorded result cannot be a kill');
  assert.match(result.reason, /never recorded/);
});

await test('meeting the target proposes keep and names the numbers', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'conversations', successTarget: 3, maxSpend: 500 });
  conversations(business, e, 3);
  spend(business, e, 200);
  const result = line(business, e);
  assert.equal(result.proposedVerdict, 'keep');
  assert.match(result.reason, /3 conversations against 3/);
  assert.match(result.bar.progress, /spend 200 of 500/);
});

await test('an exhausted bar proposes change at half the target or more, kill below it', () => {
  const near = fixture();
  bar(near.business, near.e, { successMetric: 'conversations', successTarget: 6, maxSpend: 300 });
  conversations(near.business, near.e, 3);
  spend(near.business, near.e, 300);
  assert.equal(line(near.business, near.e).proposedVerdict, 'change');

  const far = fixture();
  bar(far.business, far.e, { successMetric: 'conversations', successTarget: 6, maxContacts: 2 });
  conversations(far.business, far.e, 2);
  far.e.evidenceBar.successTarget = 6;
  assert.equal(line(far.business, far.e).bar.exhausted, true);
  assert.equal(line(far.business, far.e).proposedVerdict, 'kill');
  assert.match(line(far.business, far.e).reason, /2 of 6 conversations/);
});

await test('an owner adjust observation in the period proposes change; otherwise wait', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'conversations', successTarget: 5, maxDays: 30 });
  conversations(business, e, 1);
  assert.equal(line(business, e).proposedVerdict, 'wait');
  e.observations.unshift({
    id: 'obs_1',
    summary: 'Coaches ignore the subject line.',
    evidenceUrls: [],
    observedAt: IN_PERIOD,
    source: 'Owner',
    actualEffort: '1h',
    nextDecision: 'Rewrite the subject',
    verdict: 'adjust',
  });
  const result = line(business, e);
  assert.equal(result.proposedVerdict, 'change');
  assert.match(result.reason, /2026-10-07/);
});

await test('pacing caveat projects spend exhaustion without changing the verdict', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'conversations', successTarget: 5, maxSpend: 1000, maxDays: 14 }, 4);
  conversations(business, e, 1);
  spend(business, e, 400);
  const result = line(business, e);
  assert.equal(result.proposedVerdict, 'wait');
  assert.ok(result.caveats.includes('On pace to reach the spend limit on day 10 of 14.'));
  assert.ok(result.caveats.some((item) => /not a synced ad account/.test(item)));
});

await test('generateMemo is idempotent per week, capped, and leaves campaign records unchanged', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  const before = structuredClone({ work: business.work, signals: business.signals, pipeline: business.pipeline });
  assert.equal(memoDue(business, NOW), true);
  const first = generateMemo(business, 'lazy', NOW);
  assert.equal(first.created, true);
  assert.equal(first.memo.weekKey, '2026-W41');
  assert.equal(memoDue(business, NOW), false);
  const again = generateMemo(business, 'owner', NOW);
  assert.equal(again.created, false);
  assert.equal(business.memos.length, 1);
  assert.deepEqual({ work: business.work, signals: business.signals, pipeline: business.pipeline }, before);
  for (let i = 1; i <= MAX_MEMOS + 2; i += 1) generateMemo(business, 'schedule', NOW + i * 7 * DAY);
  assert.equal(business.memos.length, MAX_MEMOS);
  assert.ok(JSON.stringify(business.memos).length < 60_000, 'memos stay small inside the document cap');
});

await test('preparing work is excluded; work stopped before the period is excluded', () => {
  const { business, e } = fixture('preparing');
  const { lines, excluded } = memoLines(business, lastCompletedWeek(NOW), NOW);
  assert.equal(lines.length, 0);
  assert.deepEqual(excluded, [{ code: e.code, reason: 'Still preparing.' }]);
  assert.equal(memoDue(business, NOW), false);
});

await test('summary counts verdicts and lines waiting on a bar', () => {
  const { business, e } = fixture();
  const other = selectIdea(business, createIdea(business, idea('Drill series', 'content')).id, defaultWorkBrief(idea('Drill series', 'content')));
  other.createdAt = CREATED;
  transitionEndeavor(business, other.id, 'ready');
  transitionEndeavor(business, other.id, 'in_progress');
  bar(business, e, { successMetric: 'conversations', successTarget: 1, maxDays: 14 });
  conversations(business, e, 1);
  const { memo } = generateMemo(business, 'owner', NOW);
  assert.equal(memo.summary, '2 campaigns reviewed: 1 keep, 1 wait. 1 line is waiting on an evidence bar.');
});

await test('decisions apply the smallest side effect and clear the owner queue item', () => {
  const { business, e } = fixture();
  const other = selectIdea(business, createIdea(business, idea('Drill series', 'content')).id, defaultWorkBrief(idea('Drill series', 'content')));
  other.createdAt = CREATED;
  transitionEndeavor(business, other.id, 'ready');
  transitionEndeavor(business, other.id, 'in_progress');
  const { memo } = generateMemo(business, 'owner', NOW);
  assert.equal(undecidedLines(business), 2);
  assert.ok(ownerQueue(business).some((item) => item.id === 'memo' && /Decide 2 campaign lines/.test(item.title)));

  assert.throws(() => decideMemoLine(business, memo.id, e.id, 'kill'), /Record why/);
  assert.throws(() => decideMemoLine(business, memo.id, other.id, 'change', ' '), /one thing/);
  decideMemoLine(business, memo.id, e.id, 'kill', 'Coaches do not reply to cold email.');
  assert.equal(e.status, 'stopped');
  decideMemoLine(business, memo.id, other.id, 'change', 'Shorter hooks');
  assert.equal(other.checklist.at(-1).text, 'Change after memo 2026-W41: Shorter hooks');
  assert.equal(undecidedLines(business), 0);
  assert.ok(!ownerQueue(business).some((item) => item.id === 'memo'));
  assert.match(business.log[0].text, /Change AG002 after memo 2026-W41: Shorter hooks/);
});

await test('refresh keeps recorded decisions and picks up new evidence', () => {
  const { business, e } = fixture();
  bar(business, e, { successMetric: 'conversations', successTarget: 2, maxDays: 30 });
  const { memo } = generateMemo(business, 'owner', NOW);
  decideMemoLine(business, memo.id, e.id, 'wait');
  conversations(business, e, 2);
  refreshMemo(business, memo.id, NOW);
  const refreshed = memo.lines.find((item) => item.endeavorId === e.id);
  assert.equal(refreshed.proposedVerdict, 'keep');
  assert.equal(refreshed.decision.verdict, 'wait');
  assert.ok(memo.refreshedAt);
});

await test('a proposed bar is parsed from guided proposal words and never guessed', () => {
  assert.deepEqual(
    proposedEvidenceBar({ successRule: '3 or more qualified conversations', cost: '$150 in ads', timeWindow: '2 weeks' }),
    { successMetric: 'qualified', successTarget: 3, maxSpend: 150, maxDays: 14, setAt: '' },
  );
  assert.deepEqual(
    proposedEvidenceBar({ successRule: 'At least 5 conversations with coaches', cost: 'Owner time only', timeWindow: '10 days' }),
    { successMetric: 'conversations', successTarget: 5, maxDays: 10, setAt: '' },
  );
  assert.equal(proposedEvidenceBar({ successRule: 'Coaches seem interested', cost: '$0', timeWindow: '1 week' }), undefined);
  assert.equal(proposedEvidenceBar({ successRule: '20 impressions', cost: '$50', timeWindow: '1 week' }), undefined);
});

await test('a memo only judges campaigns that existed during its week', () => {
  const { business, e } = fixture();
  e.createdAt = '2026-10-13T09:00:00.000Z';
  const { lines, excluded } = memoLines(business, lastCompletedWeek(NOW), NOW);
  assert.equal(lines.length, 0);
  assert.deepEqual(excluded, [{ code: e.code, reason: 'Started after this period.' }]);
  assert.equal(memoDue(business, NOW), false);
  assert.throws(() => generateMemo(business, 'owner', NOW), /No campaign was active last week/);
  assert.equal(business.memos.length, 0);
  // The preview for the current week does include it.
  assert.equal(memoLines(business, currentWeek(NOW), NOW).lines.length, 1);
});
