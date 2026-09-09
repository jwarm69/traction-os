import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoBusiness,
  diagnose,
  createRound,
  weeklyReview,
} from '../lib/engine.ts';

const signal = (metric, value, period = 'September 1–7') => ({
  id: crypto.randomUUID(),
  metric,
  value,
  period,
  source: 'Test fixture',
  confidence: 'high',
  observedAt: new Date().toISOString(),
  note: '',
});
const calibrated = () => {
  const b = demoBusiness();
  b.facts.forEach((f) => (f.status = 'confirmed'));
  return b;
};

await test('missing conversions are unknown; measured zero requires a matching period', () => {
  const b = calibrated();
  b.signals = [signal('Sessions', 100)];
  assert.equal(diagnose(b).bottleneck, 'Evidence gap');
  assert.ok(b.diagnosis.unknowns.some((s) => s.includes('value is unknown')));
  b.signals.push(signal('Qualified leads', 0, 'August'));
  assert.equal(diagnose(b).bottleneck, 'Evidence gap');
  b.signals[1].period = b.signals[0].period;
  assert.equal(diagnose(b).bottleneck, 'Possible conversion gap');
  b.signals[1].metric = 'GA4 key events';
  assert.equal(diagnose(b).bottleneck, 'Evidence gap');
});

await test('planning requires calibration; keeps history and adapts to previous outcomes', () => {
  const b = demoBusiness();
  assert.throws(() => createRound(b, 'First'), /Confirm/);
  b.facts[0].status = 'confirmed';
  const first = createRound(b, 'First');
  assert.equal(first.experiments.length, 5);
  assert.throws(() => createRound(b, 'Duplicate'), /Close/);
  first.status = 'complete';
  Object.assign(first.experiments[0], {
    status: 'complete',
    result: 0,
    evidence: 'Ten messages, no positive replies.',
    learning: 'The offer was unclear.',
  });
  const oldGoal = first.briefSnapshot.goal;
  b.goal = 'New goal';
  b.facts[0].value = 'Revised offer';
  const second = createRound(b, 'Second');
  assert.equal(first.briefSnapshot.goal, oldGoal);
  assert.notEqual(first.briefSnapshot.facts[0].value, b.facts[0].value);
  assert.match(second.experiments[0].action, /Prior test missed its target/);
  assert.match(second.experiments[0].action, /offer was unclear/);
  assert.equal(first.experiments[0].result, 0);
});

await test('invalid AI proposals cannot create a round', () => {
  const b = calibrated();
  assert.throws(
    () => createRound(b, 'Bad', [{ channel: 'One' }]),
    /three to eight/,
  );
  assert.equal(b.rounds.length, 0);
  const invalid = Array.from({ length: 3 }, () => ({
    channel: 'A',
    hypothesis: 'B',
    action: 'C',
    metric: 'D',
    target: -1,
  }));
  assert.throws(() => createRound(b, 'Bad', invalid), /positive target/);
  assert.equal(b.rounds.length, 0);
});

await test('weekly review excludes old and future outcomes and includes unresolved sends', () => {
  const b = calibrated();
  const round = createRound(b, 'Review');
  const day = 86400000;
  const now = Date.now();
  [0, 1, 2].forEach((i) =>
    Object.assign(round.experiments[i], {
      status: 'complete',
      result: 3,
      target: 2,
      endedAt: new Date(now + [0, -8 * day, day][i]).toISOString(),
    }),
  );
  round.experiments[3].status = 'running';
  b.outreach.prospects.push({ id: 'p', status: 'uncertain' });
  const review = weeklyReview(b);
  assert.equal(review.wins.length, 1);
  assert.match(review.summary, /1 experiment completed/);
  assert.ok(review.decisions.some((s) => /1 running test/.test(s)));
  assert.ok(review.decisions.some((s) => /delivery reconciliation/.test(s)));
  assert.equal(
    Date.parse(review.nextReviewDue) - Date.parse(review.periodEnd),
    7 * day,
  );
});
