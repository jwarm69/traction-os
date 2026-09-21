import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { defaultWorkBrief, selectIdea } from '../lib/work.ts';
import { beginExecution, EXECUTION_LEASE_MS, executionPrompt, executionText, failExecution, finishExecution } from '../lib/execution.ts';

function setup() {
  const business = demoBusiness();
  const idea = createIdea(business, { title: 'Research creators', kind: 'research', description: 'Find relevant creators.', audience: 'Owners', outcome: 'A shortlist', ownerNotes: '', sources: [] });
  return { business, endeavor: selectIdea(business, idea.id, defaultWorkBrief(idea)) };
}

await test('execution runs are durable, bounded, and reject duplicates', () => {
  const { business, endeavor } = setup();
  const started = beginExecution(business, endeavor.id, 'Research now', 4);
  assert.equal(started.status, 'running');
  assert.throws(() => beginExecution(business, endeavor.id, 'Again', 4), /already running/);
  finishExecution(business, endeavor.id, started.id, { artifactId: 'artifact_1', nextDecision: 'Review it.' });
  assert.equal(endeavor.executionRuns[0].status, 'succeeded');
});

await test('expired leases can be recovered and failures persist', () => {
  const { business, endeavor } = setup();
  const started = beginExecution(business, endeavor.id, 'Research', 2, undefined, new Date(0));
  assert.equal(EXECUTION_LEASE_MS > 120000, true);
  const recovered = beginExecution(business, endeavor.id, 'Research again', 3, undefined, new Date(EXECUTION_LEASE_MS + 1));
  assert.equal(endeavor.executionRuns.find((run) => run.id === started.id).status, 'failed');
  failExecution(business, endeavor.id, recovered.id, 'Provider unavailable.');
  assert.equal(endeavor.executionRuns.find((run) => run.id === recovered.id).error, 'Provider unavailable.');
  assert.equal(endeavor.executionRuns.find((run) => run.id === recovered.id).status, 'failed');
  assert.equal(started.status, 'failed');
});

await test('closed work and late or duplicate results cannot be executed', () => {
  const { business, endeavor } = setup();
  endeavor.status = 'completed';
  assert.throws(() => beginExecution(business, endeavor.id, '', 1), /active Do work/);
  endeavor.status = 'stopped';
  assert.throws(() => beginExecution(business, endeavor.id, '', 1), /active Do work/);
  endeavor.status = 'preparing';
  const run = beginExecution(business, endeavor.id, '', 1, 'Saved context', new Date(0));
  assert.equal(run.contextSnapshot, 'Saved context');
  assert.throws(() => finishExecution(business, endeavor.id, run.id, { artifactId: 'late', nextDecision: 'Review' }, new Date(EXECUTION_LEASE_MS + 1)), /lease/);
  assert.equal(run.status, 'failed');
  assert.throws(() => finishExecution(business, endeavor.id, run.id, { artifactId: 'duplicate', nextDecision: 'Review' }), /already settled/);
});

await test('execution output keeps safe structured drafts and rejects unusable values', () => {
  assert.equal(executionText({ title: 'Draft', bullets: ['One', 'Two'] }, 'content', 1000), '{\n  "title": "Draft",\n  "bullets": [\n    "One",\n    "Two"\n  ]\n}');
  assert.equal(executionText(' Review this. ', 'nextDecision', 100), 'Review this.');
  assert.throws(() => executionText(null, 'content', 100), /no usable draft/);
  assert.throws(() => executionText('too long', 'content', 3), /too long/);
});

await test('execution prompt requires bounded plain-string fields', () => {
  const { business, endeavor } = setup();
  const prompt = executionPrompt(business, endeavor, 'Create the draft.');
  assert.match(prompt, /Both values must be plain strings/);
  assert.match(prompt, /readable Markdown inside the content string/);
});
