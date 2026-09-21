import assert from 'node:assert/strict';
import test from 'node:test';
import { planExecution } from '../lib/execution-policy.ts';

const endeavor = (kind, extra = {}) => ({
  id: 'work_1',
  title: 'Prepare the next useful thing',
  kind,
  description: 'Create a reviewable deliverable.',
  intendedDeliverables: ['A first draft'],
  effortBudget: 'One hour',
  completionCriteria: 'Owner can review it',
  status: 'ready',
  checklist: [],
  artifacts: [],
  research: [],
  observations: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

test('routine drafting stays on the least expensive bounded route', () => {
  const plan = planExecution(endeavor('content'));
  assert.equal(plan.route, 'in_app');
  assert.equal(plan.provider, 'deepseek');
  assert.equal(plan.workload, 'routine');
  assert.equal(plan.maximumSharedReservationMicros, 25000);
});

test('research and strategic decisions preserve frontier boundaries', () => {
  const research = planExecution(endeavor('research'));
  assert.equal(research.provider, 'openai');
  assert.equal(research.workload, 'research');
  const strategic = planExecution(endeavor('experiment'));
  assert.equal(strategic.provider, 'openai');
  assert.equal(strategic.workload, 'strategic');
});

test('external action needs a reviewed artifact before computer use', () => {
  const draft = endeavor('campaign', {
    completionCriteria: 'Publish the campaign',
  });
  assert.equal(planExecution(draft).route, 'in_app');
  draft.artifacts = [{ id: 'a', reviewedAt: '2026-01-01' }];
  const ready = planExecution(draft);
  assert.equal(ready.route, 'computer');
  assert.equal(ready.requiresApproval, true);
});

test('product implementation uses Codex and inactive work stops', () => {
  assert.equal(planExecution(endeavor('product_improvement')).route, 'codex');
  assert.equal(
    planExecution(endeavor('content', { status: 'blocked' })).route,
    'human',
  );
});
