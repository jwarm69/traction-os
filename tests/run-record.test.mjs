import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addCorrection } from '../lib/knowledge.ts';
import { beginExecution, failExecution, finishExecution } from '../lib/execution.ts';
import {
  defaultWorkBrief,
  importRunnerResult,
  saveArtifact,
  selectIdea,
  setEvidenceBar,
  transitionEndeavor,
} from '../lib/work.ts';
import { decideMemoLine, generateMemo } from '../lib/memo.ts';
import {
  campaignTableCsv,
  changedLineCount,
  renderCaseStudy,
  renderRunRecord,
  runRecord,
} from '../lib/run-record.ts';

const idea = (title, kind = 'content') => ({
  title,
  kind,
  description: `Weekly drill videos for ${title}`,
  audience: 'Weekend golfers',
  outcome: 'Five coach conversations',
  ownerNotes: '',
  sources: [],
});

function fixture() {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.signals = [];
  business.memos = [];
  business.corrections = [];
  business.work = { endeavors: [] };
  business.pipeline = { contacts: [] };
  const e = selectIdea(business, createIdea(business, idea('Drill shorts')).id, defaultWorkBrief(idea('Drill shorts')));
  transitionEndeavor(business, e.id, 'ready');
  transitionEndeavor(business, e.id, 'in_progress');
  return { business, e };
}

const at = (minute) => new Date(Date.UTC(2026, 9, 6, 10, minute));

await test('changed line count is additions plus removals', () => {
  assert.equal(changedLineCount('a\nb\nc', 'a\nb\nc'), 0);
  assert.equal(changedLineCount('a\nb\nc', 'a\nB\nc'), 2);
  assert.equal(changedLineCount('a\nb', 'a\nb\nc\nd'), 2);
  assert.equal(changedLineCount('', 'x'), 2);
});

await test('in-app runs, owner edits, and corrections line up per run', () => {
  const { business, e } = fixture();
  const run = beginExecution(business, e.id, 'Three hooks for coaches', 7, 'prompt', at(0));
  const artifact = saveArtifact(business, e.id, { kind: 'content', title: 'Hooks', content: 'Hook one\nHook two\nHook three', source: 'assistant' });
  artifact.versions[0].createdAt = at(1).toISOString();
  finishExecution(business, e.id, run.id, { artifactId: artifact.id, nextDecision: 'Pick one hook' }, at(2));
  saveArtifact(business, e.id, { artifactId: artifact.id, kind: 'content', title: 'Hooks', content: 'Hook one\nHook 2, shorter\nHook three', source: 'owner' });
  addCorrection(business, { text: 'Never promise a lower score.', scope: 'all', fromArtifactId: artifact.id });

  const failed = beginExecution(business, e.id, '', 8, 'prompt', at(10));
  failExecution(business, e.id, failed.id, 'Provider timed out.', at(11));

  const record = runRecord(business, e.id);
  assert.equal(record.entries.length, 2);
  const [latest, first] = record.entries;
  assert.equal(latest.status, 'failed');
  assert.equal(latest.error, 'Provider timed out.');
  assert.equal(latest.changedLines, null);
  assert.equal(first.route, 'in_app');
  assert.equal(first.assistantVersion, 1);
  assert.equal(first.contextRevision, 7);
  assert.equal(first.ownerVersionsAfter, 1);
  assert.equal(first.changedLines, 2);
  assert.deepEqual(first.correctionsSaved, ['Never promise a lower score.']);
  assert.equal(first.nextDecision, 'Pick one hook');
});

await test('runner imports and generated drafts appear without an execution run', () => {
  const { business, e } = fixture();
  importRunnerResult(business, e.id, 'job_42', { text: 'Runner output' });
  const draft = saveArtifact(business, e.id, { kind: 'outreach', title: 'Coach pitch', content: 'Hi coach', source: 'assistant' });
  saveArtifact(business, e.id, { artifactId: draft.id, kind: 'outreach', title: 'Coach pitch', content: 'Hi coach v2', source: 'assistant' });
  const routes = runRecord(business, e.id).entries.map((entry) => [entry.route, entry.assistantVersion]);
  assert.deepEqual(routes.map(String).sort((a, z) => a.localeCompare(z)), ['draft,1', 'draft,2', 'runner,1']);
  const runner = runRecord(business, e.id).entries.find((entry) => entry.route === 'runner');
  assert.equal(runner.runId, 'runner-job:job_42');
});

await test('effort is listed as written and never summed; memo decisions are carried', () => {
  const { business, e } = fixture();
  e.observations.unshift(
    { id: 'o1', summary: 'Two coaches replied', evidenceUrls: [], observedAt: '2026-10-07T00:00:00.000Z', source: 'Gmail', actualEffort: '45 min', nextDecision: 'Follow up' },
    { id: 'o2', summary: 'Posted video', evidenceUrls: [], observedAt: '2026-10-08T00:00:00.000Z', source: 'Owner', actualEffort: '2 hours', nextDecision: 'Wait' },
  );
  e.createdAt = '2026-10-01T00:00:00.000Z';
  setEvidenceBar(business, e.id, { successMetric: 'conversations', successTarget: 5, maxDays: 14 });
  const { memo } = generateMemo(business, 'owner', Date.parse('2026-10-14T12:00:00Z'));
  decideMemoLine(business, memo.id, e.id, 'wait');
  const record = runRecord(business, e.id);
  assert.deepEqual(record.effort, ['45 min', '2 hours']);
  assert.deepEqual(record.memoDecisions.map((item) => [item.weekKey, item.verdict]), [['2026-W41', 'wait']]);
  const text = renderRunRecord(record);
  assert.match(text, /- 45 min\n- 2 hours/);
  assert.match(text, /not totalled or compared/);
  assert.match(text, /2026-W41: wait/);
  assert.match(text, /Evidence bar: win at 5 conversations; stop judging at 14 days/);
  assert.match(text, /Spend: unknown/);
});

await test('the case study labels its limits and reads without mutating the business', () => {
  const { business, e } = fixture();
  saveArtifact(business, e.id, { kind: 'content', title: 'Script', content: 'Draft', source: 'assistant' });
  const before = JSON.stringify(business);
  const text = renderCaseStudy(business);
  assert.equal(JSON.stringify(business), before);
  assert.match(text, /^# Case study draft: AlignIQ Golf/);
  assert.match(text, /Prepared tests are labeled as prepared/);
  assert.match(text, /Routes used: Generated draft/);
  assert.match(text, /AG001 Drill shorts: Weekly drill videos for Drill shorts Audience: Weekend golfers\./);
});

await test('campaign table CSV keeps unknown empty, quotes, and neutralizes formulas', () => {
  const { business, e } = fixture();
  e.title = '=HYPERLINK("x"), "quoted"';
  business.signals.push({ id: 's1', metric: 'Spend', value: 120, period: 'w', note: '', source: 'Owner', observedAt: '2026-10-07T00:00:00.000Z', confidence: 'medium', endeavorId: e.id, campaignMetric: 'spend' });
  const csv = campaignTableCsv(business, Date.parse('2026-10-09T00:00:00Z'));
  const [header, row] = csv.trim().split('\r\n');
  assert.equal(header.split(',')[0], 'code');
  assert.ok(header.includes('cost_per_conversation'));
  assert.ok(row.startsWith(`AG001,"'=HYPERLINK(""x""), ""quoted""",in_progress,content,120,0,`));
  assert.ok(row.includes(',0,0,0,0,0,0,,,,,,,,'), 'unknown leads through cost per deal are empty cells, not 0');
  assert.ok(csv.endsWith('\r\n'));
});
