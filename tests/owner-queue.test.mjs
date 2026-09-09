import test from 'node:test';
import assert from 'node:assert/strict';
import { demoBusiness, createRound } from '../lib/engine.ts';
import { ownerQueue } from '../lib/owner-queue.ts';

await test('owner queue follows calibration, execution, and measured completion', () => {
  const b = demoBusiness();
  assert.equal(ownerQueue(b)[0].id, 'calibrate');
  b.facts.forEach((f) => (f.status = 'confirmed'));
  assert.equal(ownerQueue(b)[0].id, 'plan');
  const round = createRound(b, 'One');
  assert.equal(ownerQueue(b)[0].id, 'start');
  round.experiments[0].status = 'running';
  assert.equal(ownerQueue(b)[0].id, 'results');
  round.experiments[0].status = 'complete';
  assert.equal(ownerQueue(b)[0].id, 'close');
  b.outreach.prospects.push({ id: 'p', status: 'uncertain' });
  assert.equal(ownerQueue(b)[0].id, 'delivery');
});
