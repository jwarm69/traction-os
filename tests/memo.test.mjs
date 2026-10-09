import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addContact, moveContact } from '../lib/pipeline.ts';
import {
  addObservation,
  confirmEvidenceBar,
  defaultWorkBrief,
  prepareGuidedProposal,
  proposeEvidenceBar,
  selectIdea,
  setEvidenceBar,
  transitionEndeavor,
} from '../lib/work.ts';
import {
  MEMO_CAP,
  decideMemoLine,
  generateMemo,
  narrationPrompt,
  parseNarration,
  periodFor,
  summarize,
  undecidedLines,
  weekKey,
} from '../lib/memo.ts';
import { ownerQueue } from '../lib/owner-queue.ts';

const AT = new Date('2026-10-09T12:00:00.000Z');
const daysAgo = (days, from = AT) => new Date(from.getTime() - days * 86_400_000).toISOString();
const idea = (title) => ({ title, kind: 'campaign', description: 'd', audience: 'a', outcome: 'o', ownerNotes: '', sources: [] });

function fixture(title = 'Alpha') {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.signals = [];
  const endeavor = selectIdea(business, createIdea(business, idea(title)).id, defaultWorkBrief(idea(title)));
  return { business, endeavor };
}
function spend(business, endeavorId, value, observedAt = daysAgo(1)) {
  business.signals.push({ id: `sig_${business.signals.length}`, metric: 'Ad spend', value, period: 'P', note: '', source: 'Owner', observedAt, confidence: 'medium', endeavorId, campaignMetric: 'spend' });
}
function conversations(business, endeavorId, count, at = daysAgo(1)) {
  for (let i = 0; i < count; i++) {
    const contact = addContact(business, { name: `C${i}`, channel: 'email', source: 'owner', endeavorId });
    moveContact(business, contact.id, 'contacted');
    moveContact(business, contact.id, 'replied');
    moveContact(business, contact.id, 'conversation');
    for (const event of contact.stageHistory) event.at = at;
  }
}
function start(business, endeavor, startedDaysAgo) {
  transitionEndeavor(business, endeavor.id, 'ready');
  transitionEndeavor(business, endeavor.id, 'in_progress');
  if (endeavor.evidenceBar) endeavor.evidenceBar.startedAt = daysAgo(startedDaysAgo);
  endeavor.updatedAt = daysAgo(startedDaysAgo);
}
const line = (business, code) => generateMemo(business, { generatedBy: 'owner', at: AT }).lines.find((l) => l.code === code);

await test('week keys and periods are ISO and stable across year boundaries', () => {
  assert.equal(weekKey(new Date('2026-10-09T12:00:00Z')), '2026-W41');
  assert.equal(weekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(weekKey(new Date('2027-01-03T00:00:00Z')), '2026-W53');
  assert.equal(weekKey(new Date('2027-01-04T00:00:00Z')), '2027-W01');
  const period = periodFor(AT);
  assert.equal(period.weekKey, '2026-W41');
  assert.equal(period.periodStart, '2026-10-02T12:00:00.000Z');
});

await test('evidence bars validate, confirm, seed from guided proposals, and log goalpost moves', () => {
  const { business, endeavor } = fixture();
  assert.throws(() => setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 0, maxDays: 14 }), /positive success target/);
  assert.throws(() => setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5 }), /at least one stop condition/);
  assert.throws(() => setEvidenceBar(business, endeavor.id, { successMetric: 'clicks', successTarget: 5, maxDays: 14 }), /success metric/);
  assert.throws(() => setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5, maxSpend: -1 }), /positive numbers/);
  const bar = setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  assert.ok(bar.setAt);
  assert.equal(bar.startedAt, undefined);
  assert.match(business.log[0].text, /Evidence bar set for AG001/);
  transitionEndeavor(business, endeavor.id, 'ready');
  transitionEndeavor(business, endeavor.id, 'in_progress');
  assert.ok(endeavor.evidenceBar.startedAt, 'startedAt set on launch');
  setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 6, maxDays: 21 });
  assert.match(business.log[0].text, /Evidence bar changed for AG001 after 0 days of activity/);
  transitionEndeavor(business, endeavor.id, 'stopped');
  assert.throws(() => setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 1, maxDays: 1 }), /Reopen/);

  assert.deepEqual(proposeEvidenceBar({ successRule: '3 of 5 eligible coaches complete the workflow.', cost: '$0', timeWindow: '14 days' }), undefined, 'no metric word and no spend: nothing guessed');
  assert.deepEqual(proposeEvidenceBar({ successRule: '5 qualified calls booked.', cost: '$250 in ads', timeWindow: '2 weeks' }), { successMetric: 'qualified', successTarget: 5, maxSpend: 250, maxDays: 14 });
  assert.deepEqual(proposeEvidenceBar({ successRule: 'Two deals.', cost: '$1,000', timeWindow: 'a month' }), undefined);

  const guided = demoBusiness();
  guided.name = 'Tonight';
  guided.guided = { proposal: { id: 'p1', status: 'accepted', title: 'Pilot', uncertainty: 'U', rationale: 'R', action: 'A', measurementPlan: 'M', ownerContribution: 'O', cost: '$200', timeWindow: '10 days', successRule: '4 conversations with venue owners.', stoppingRule: 'S', audience: 'Venue owners' } };
  const prepared = prepareGuidedProposal(guided);
  assert.deepEqual(prepared.evidenceBar, { successMetric: 'conversations', successTarget: 4, maxSpend: 200, maxDays: 10 });
  assert.equal(line(guided, prepared.code), undefined, 'preparing work is excluded');
  transitionEndeavor(guided, prepared.id, 'ready');
  delete guided.memos; // the week's memo is memoized; drop it to re-evaluate
  assert.match(line(guided, prepared.code).reason, /Confirm the proposed evidence bar/);
  confirmEvidenceBar(guided, prepared.id);
  assert.ok(prepared.evidenceBar.setAt);
  assert.equal(confirmEvidenceBar(guided, prepared.id).setAt, prepared.evidenceBar.setAt);
});

await test('verdict rules fire in order with numbers in the reason', () => {
  const noBar = fixture();
  start(noBar.business, noBar.endeavor, 5);
  const l0 = line(noBar.business, 'AG001');
  assert.equal(l0.proposedVerdict, 'wait');
  assert.match(l0.reason, /No evidence bar is set/);

  const blocked = fixture();
  setEvidenceBar(blocked.business, blocked.endeavor.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  transitionEndeavor(blocked.business, blocked.endeavor.id, 'blocked', 'Waiting on coach access.');
  const l1 = line(blocked.business, 'AG001');
  assert.equal(l1.proposedVerdict, 'change');
  assert.match(l1.reason, /Blocked since .*Waiting on coach access/);

  const ready = fixture();
  setEvidenceBar(ready.business, ready.endeavor.id, { successMetric: 'deals', successTarget: 2, maxDays: 14 });
  transitionEndeavor(ready.business, ready.endeavor.id, 'ready');
  assert.equal(line(ready.business, 'AG001').proposedVerdict, 'test');

  const unrecorded = fixture();
  setEvidenceBar(unrecorded.business, unrecorded.endeavor.id, { successMetric: 'deals', successTarget: 2, maxDays: 14 });
  start(unrecorded.business, unrecorded.endeavor, 3);
  const l2 = line(unrecorded.business, 'AG001');
  assert.equal(l2.proposedVerdict, 'wait');
  assert.match(l2.reason, /deals has not been recorded yet; day 3 of 14/);

  const keep = fixture();
  setEvidenceBar(keep.business, keep.endeavor.id, { successMetric: 'conversations', successTarget: 5, maxSpend: 2000, maxDays: 14 });
  start(keep.business, keep.endeavor, 9);
  spend(keep.business, keep.endeavor.id, 1400);
  conversations(keep.business, keep.endeavor.id, 5);
  const l3 = line(keep.business, 'AG001');
  assert.equal(l3.proposedVerdict, 'keep');
  assert.match(l3.reason, /Met the bar: 5 conversations against 5; spend 1,400 of 2,000; day 9 of 14/);
  assert.ok(l3.caveats.includes('Spend was entered or imported by the owner, not synced from a platform.'));
  assert.ok(l3.caveats.some((c) => /On pace to reach the spend limit on day 13 of 14/.test(c)), JSON.stringify(l3.caveats));

  const change = fixture();
  setEvidenceBar(change.business, change.endeavor.id, { successMetric: 'conversations', successTarget: 6, maxDays: 14 });
  start(change.business, change.endeavor, 15);
  conversations(change.business, change.endeavor.id, 3);
  const l4 = line(change.business, 'AG001');
  assert.equal(l4.proposedVerdict, 'change');
  assert.match(l4.reason, /Reached the limit at 3 of 6 conversations; day 15 of 14/);

  const kill = fixture();
  setEvidenceBar(kill.business, kill.endeavor.id, { successMetric: 'conversations', successTarget: 6, maxContacts: 10 });
  start(kill.business, kill.endeavor, 4);
  conversations(kill.business, kill.endeavor.id, 2);
  for (let i = 0; i < 8; i++) addContact(kill.business, { name: `X${i}`, channel: 'email', source: 'owner', endeavorId: kill.endeavor.id });
  const l5 = line(kill.business, 'AG001');
  assert.equal(l5.proposedVerdict, 'kill');
  assert.match(l5.reason, /Reached the limit at 2 of 6 conversations; 10 of 10 contacts/);

  const adjust = fixture();
  setEvidenceBar(adjust.business, adjust.endeavor.id, { successMetric: 'conversations', successTarget: 6, maxDays: 30 });
  start(adjust.business, adjust.endeavor, 4);
  conversations(adjust.business, adjust.endeavor.id, 1);
  addObservation(adjust.business, adjust.endeavor.id, { summary: 'The hook reads as spam.', evidenceUrls: [], observedAt: daysAgo(2), source: 'Owner', actualEffort: '10m', nextDecision: 'Rewrite', verdict: 'adjust' });
  const l6 = line(adjust.business, 'AG001');
  assert.equal(l6.proposedVerdict, 'change');
  assert.match(l6.reason, /Owner flagged an adjustment on .*The hook reads as spam/);

  const waiting = fixture();
  setEvidenceBar(waiting.business, waiting.endeavor.id, { successMetric: 'conversations', successTarget: 6, maxDays: 30 });
  start(waiting.business, waiting.endeavor, 4);
  conversations(waiting.business, waiting.endeavor.id, 1);
  const l7 = line(waiting.business, 'AG001');
  assert.equal(l7.proposedVerdict, 'wait');
  assert.match(l7.reason, /1 of 6 conversations; day 4 of 30. Not enough evidence/);
});

await test('generation is idempotent per week, pure apart from the push, capped, and summarized', () => {
  const { business, endeavor } = fixture();
  const second = selectIdea(business, createIdea(business, idea('Beta')).id, defaultWorkBrief(idea('Beta')));
  setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5, maxSpend: 500 });
  setEvidenceBar(business, second.id, { successMetric: 'conversations', successTarget: 5, maxSpend: 500 });
  start(business, endeavor, 3);
  start(business, second, 3);
  spend(business, endeavor.id, 100);
  conversations(business, endeavor.id, 5);
  spend(business, second.id, 400);
  conversations(business, second.id, 5);
  const stopped = selectIdea(business, createIdea(business, idea('Gone')).id, defaultWorkBrief(idea('Gone')));
  transitionEndeavor(business, stopped.id, 'stopped');
  stopped.updatedAt = daysAgo(30);
  const snapshot = () => JSON.stringify({ ...business, memos: undefined, log: undefined, updatedAt: undefined });
  const before = snapshot();
  const memo = generateMemo(business, { generatedBy: 'schedule', at: AT });
  assert.equal(snapshot(), before, 'generation touches only memos, the log, and updatedAt');
  assert.equal(generateMemo(business, { generatedBy: 'owner', at: AT }).id, memo.id);
  assert.equal(business.memos.length, 1);
  assert.equal(memo.generatedBy, 'schedule');
  assert.match(memo.summary, /2 campaigns reviewed: 2 keep\./);
  assert.match(memo.summary, /AG001 has the lowest cost per conversation at 20\./);
  assert.deepEqual(memo.excluded, [{ code: 'AG003', reason: 'stopped before this period' }]);
  assert.match(business.log[0].text, /generated on schedule/);
  assert.equal(summarize([]), 'No active campaigns this week. Select an idea in Explore or prepare a guided proposal to start one.');
  assert.match(summarize([{ proposedVerdict: 'wait', reason: 'No evidence bar is set.', cumulative: { costPerConversation: null } }]), /1 campaign reviewed: 1 wait\. 1 is waiting on an evidence bar\./);

  for (let i = 1; i <= MEMO_CAP + 3; i++)
    business.memos.unshift({ ...memo, id: `memo_${i}`, weekKey: `2020-W${String(i).padStart(2, '0')}` });
  generateMemo(business, { generatedBy: 'lazy', at: new Date(AT.getTime() + 7 * 86_400_000) });
  assert.equal(business.memos.length, MEMO_CAP);
  assert.equal(business.memos[0].weekKey, '2026-W42');
});

await test('decisions apply bounded side effects, require notes for kill and change, and feed the owner queue', () => {
  const { business, endeavor } = fixture();
  const second = selectIdea(business, createIdea(business, idea('Beta')).id, defaultWorkBrief(idea('Beta')));
  setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  setEvidenceBar(business, second.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  start(business, endeavor, 2);
  transitionEndeavor(business, second.id, 'ready');
  business.facts.forEach((f) => (f.status = 'confirmed'));
  const memo = generateMemo(business, { generatedBy: 'owner', at: AT });
  assert.equal(undecidedLines(memo).length, 2);
  assert.equal(ownerQueue(business)[0].id, 'memo');
  assert.match(ownerQueue(business)[0].title, /Decide 2 campaign lines/);
  assert.throws(() => decideMemoLine(business, memo.id, endeavor.id, 'kill'), /Write one line/);
  assert.throws(() => decideMemoLine(business, memo.id, endeavor.id, 'nope'), /Choose a verdict/);
  assert.throws(() => decideMemoLine(business, 'memo_missing', endeavor.id, 'keep'), /Memo not found/);
  decideMemoLine(business, memo.id, endeavor.id, 'change', 'Swap the hook.');
  assert.ok(endeavor.checklist.some((item) => item.text === 'Change after memo 2026-W41: Swap the hook.'));
  decideMemoLine(business, memo.id, second.id, 'test');
  assert.equal(second.status, 'in_progress');
  assert.ok(second.evidenceBar.startedAt);
  assert.equal(undecidedLines(memo).length, 0);
  assert.notEqual(ownerQueue(business)[0].id, 'memo');
  const killMemo = { ...memo, id: 'memo_kill', lines: memo.lines.map((l) => ({ ...l, decision: undefined })) };
  business.memos.unshift(killMemo);
  decideMemoLine(business, 'memo_kill', endeavor.id, 'kill', 'Wrong audience.');
  assert.equal(endeavor.status, 'stopped');
  assert.match(business.log[0].text, /Kill decided for AG001 after memo 2026-W41: Wrong audience\./);
});

await test('narration is prompted from the memo and rejected when it disagrees', () => {
  const { business, endeavor } = fixture();
  setEvidenceBar(business, endeavor.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  start(business, endeavor, 2);
  const memo = generateMemo(business, { generatedBy: 'owner', at: AT });
  const prompt = narrationPrompt(memo);
  assert.ok(prompt.length <= 28000);
  assert.match(prompt, /"code":"AG001"/);
  assert.equal(parseNarration({ narrative: 'AG001 is two days in with nothing recorded. Wait.' }, memo), 'AG001 is two days in with nothing recorded. Wait.');
  assert.throws(() => parseNarration({ narrative: 'Nothing to report.' }, memo), /missing AG001/);
  assert.throws(() => parseNarration({ narrative: 'AG001 looks strong. Keep it running.' }, memo), /AG001 reads keep, memo says wait/);
  assert.throws(() => parseNarration({ narrative: '' }, memo), /empty/);
  assert.throws(() => parseNarration('text', memo), /empty/);
});
