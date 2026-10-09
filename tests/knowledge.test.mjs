import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { defaultWorkBrief, reviewArtifact, saveArtifact, selectIdea } from '../lib/work.ts';
import {
  CONTEXT_PACK_LIMIT,
  MAX_CORRECTIONS,
  MAX_EXEMPLARS,
  STALE_FACT_DAYS,
  addCorrection,
  categoryBudgets,
  contextPack,
  correctionsFor,
  isStaleFact,
  markExemplar,
  removeCorrection,
  unmarkExemplar,
} from '../lib/knowledge.ts';
import { buildAgentBrief } from '../lib/agent-brief.ts';
import { executionPrompt } from '../lib/execution.ts';

const NOW = Date.parse('2026-10-09T00:00:00.000Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function fact(over) {
  return {
    id: `fact_${Math.random().toString(36).slice(2, 8)}`,
    label: 'Label',
    value: 'Value',
    source: 'Owner input',
    observedAt: daysAgo(1),
    confidence: 'medium',
    status: 'confirmed',
    ...over,
  };
}

const idea = { title: 'Pitch', kind: 'outreach', description: 'd', audience: 'a', outcome: 'o', ownerNotes: '', sources: [] };

function withWork() {
  const business = demoBusiness();
  business.facts = [];
  const endeavor = selectIdea(business, createIdea(business, idea).id, defaultWorkBrief(idea));
  return { business, endeavor };
}

await test('the pack budgets facts by category, newest first, and marks stale ones', () => {
  const business = demoBusiness();
  business.facts = [
    ...Array.from({ length: 10 }, (_, i) =>
      fact({ label: `Offer ${i}`, category: 'offer', observedAt: daysAgo(i) }),
    ),
    fact({ label: 'Old product', category: 'product', observedAt: daysAgo(STALE_FACT_DAYS + 1) }),
    fact({ label: 'Unreviewed', category: 'offer', status: 'unreviewed' }),
    fact({ label: 'No category' }),
    fact({ label: 'Bad category', category: 'nonsense' }),
  ];
  const pack = contextPack(business, undefined, NOW);
  const offers = pack.facts.filter((f) => f.category === 'offer');
  assert.equal(offers.length, categoryBudgets.offer);
  assert.deepEqual(offers.map((f) => f.label), ['Offer 0', 'Offer 1', 'Offer 2']);
  assert.equal(pack.facts.some((f) => f.label === 'Unreviewed'), false);
  assert.equal(pack.facts.filter((f) => f.category === 'other').length, 2);
  const old = pack.facts.find((f) => f.label === 'Old product');
  assert.match(old.verify, /verify: observed/);
  assert.match(pack.text, /\[Product\] Old product: Value .*verify: observed/);
  assert.equal(isStaleFact({ observedAt: 'not a date' }), true);
  // Order is offer, product, positioning, voice, proof, customer_language, other.
  assert.equal(pack.facts[0].category, 'offer');
  assert.equal(pack.facts.at(-1).category, 'other');
});

await test('a large library still includes customer language and says what it dropped', () => {
  const business = demoBusiness();
  business.facts = [
    ...Array.from({ length: 200 }, (_, i) =>
      fact({ label: `Other ${i}`, value: 'x'.repeat(2500), observedAt: daysAgo(i % 50) }),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      fact({ label: `Quote ${i}`, category: 'customer_language', value: 'y'.repeat(1500) }),
    ),
  ];
  const pack = contextPack(business, undefined, NOW);
  assert.ok(pack.characters <= CONTEXT_PACK_LIMIT);
  assert.equal(pack.facts.filter((f) => f.category === 'customer_language').length, categoryBudgets.customer_language);
  assert.equal(pack.facts.some((f) => f.category === 'other'), false);
  assert.match(pack.dropped[0], /4 uncategorized facts/);
  assert.match(pack.text, /Omitted to fit/);
});

await test('exemplars require review, carry a why, are capped, and feed the pack', () => {
  const { business, endeavor } = withWork();
  const artifact = saveArtifact(business, endeavor.id, {
    kind: 'outreach', title: 'Good pitch', content: 'Body '.repeat(400), source: 'assistant',
  });
  assert.throws(() => markExemplar(business, endeavor.id, artifact.id, 'Short and specific.'), /Review the artifact/);
  reviewArtifact(business, endeavor.id, artifact.id);
  assert.throws(() => markExemplar(business, endeavor.id, artifact.id, 'short'), /10 to 300/);
  markExemplar(business, endeavor.id, artifact.id, 'Leads with the customer problem, not the feature.');
  assert.equal(artifact.exemplar.why, 'Leads with the customer problem, not the feature.');
  const pack = contextPack(business, undefined, NOW);
  assert.equal(pack.exemplars.length, 1);
  assert.equal(pack.exemplars[0].truncated, true);
  assert.equal(pack.exemplars[0].excerpt.length, 1200);
  assert.match(pack.text, /Why it works: Leads with the customer problem/);
  assert.throws(() => markExemplar(business, endeavor.id, 'artifact_missing', 'Whatever reason.'), /not found/);

  for (let i = 0; i < MAX_EXEMPLARS - 1; i++) {
    const extra = saveArtifact(business, endeavor.id, {
      kind: 'content', title: `Example ${i}`, content: 'c', source: 'owner',
    });
    reviewArtifact(business, endeavor.id, extra.id);
    markExemplar(business, endeavor.id, extra.id, 'A perfectly fine reason.');
  }
  const overflow = saveArtifact(business, endeavor.id, { kind: 'content', title: 'Too many', content: 'c', source: 'owner' });
  reviewArtifact(business, endeavor.id, overflow.id);
  assert.throws(() => markExemplar(business, endeavor.id, overflow.id, 'One too many examples.'), /at most 12/);
  // Re-marking an existing exemplar does not count against the cap.
  markExemplar(business, endeavor.id, artifact.id, 'Updated reason that still works.');
  unmarkExemplar(business, endeavor.id, artifact.id);
  assert.equal(artifact.exemplar, undefined);
  assert.equal(contextPack(business, undefined, NOW).exemplars.length, 3);
});

await test('corrections are scoped, ordered oldest first, bounded, and removable', () => {
  const business = demoBusiness();
  const a = addCorrection(business, { text: 'Never promise results in 30 days.', scope: 'all' });
  a.createdAt = daysAgo(3);
  const b = addCorrection(business, { text: 'Group billing complaints under one theme.', scope: 'customer_language' });
  b.createdAt = daysAgo(2);
  addCorrection(business, { text: 'Three concepts, not five.', scope: 'campaign_brief' });
  assert.deepEqual(correctionsFor(business).map((c) => c.scope), ['all']);
  assert.deepEqual(correctionsFor(business, 'customer_language').map((c) => c.text), [a.text, b.text]);
  assert.throws(() => addCorrection(business, { text: '   ', scope: 'all' }), /Write the correction/);
  assert.throws(() => addCorrection(business, { text: 'x'.repeat(301), scope: 'all' }), /300/);
  assert.throws(() => addCorrection(business, { text: 'ok', scope: 'nope' }), /scope/);
  for (let i = business.corrections.length; i < MAX_CORRECTIONS; i++)
    addCorrection(business, { text: `Rule ${i}`, scope: 'all' });
  assert.throws(() => addCorrection(business, { text: 'One more', scope: 'all' }), /at most 40/);
  removeCorrection(business, a.id);
  assert.throws(() => removeCorrection(business, a.id), /not found/);
  const pack = contextPack(business, 'campaign_brief', NOW);
  assert.ok(pack.corrections.some((c) => c.text === 'Three concepts, not five.'));
  assert.equal(pack.corrections.some((c) => c.scope === 'customer_language'), false);
});

await test('the execution prompt and the agent brief carry the library and stay bounded', () => {
  const { business, endeavor } = withWork();
  business.facts = [
    fact({ label: 'Offer', value: 'A guided review', category: 'offer' }),
    fact({ label: 'Dinner', value: 'I am tired of taking calls during dinner', category: 'customer_language' }),
  ];
  addCorrection(business, { text: 'Do not promise outcomes.', scope: 'all' });
  const prompt = executionPrompt(business, endeavor, 'Draft it.');
  assert.ok(prompt.length <= 28000);
  assert.match(prompt, /Knowledge library:/);
  assert.match(prompt, /Do not promise outcomes\./);
  assert.match(prompt, /tired of taking calls during dinner/);
  assert.equal(prompt.includes('confirmedFacts'), false);
  const brief = buildAgentBrief(business, endeavor);
  assert.match(brief, /## Customer language\n- Dinner:/);
  assert.match(brief, /## Approved examples\n- No approved examples/);
  assert.match(brief, /## Standing corrections\n- \(all\) Do not promise outcomes\./);
});
