import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addCorrection, markExemplar } from '../lib/knowledge.ts';
import { executionPrompt } from '../lib/execution.ts';
import { planExecution } from '../lib/execution-policy.ts';
import {
  addResearchCandidates,
  defaultWorkBrief,
  reviewArtifact,
  reviewResearchCandidate,
  saveArtifact,
  selectIdea,
  updateEndeavor,
} from '../lib/work.ts';
import {
  campaignBrief,
  demoCampaignBriefAnswer,
  parseCampaignBriefData,
  promoteConcept,
  skillFor,
} from '../lib/skills.ts';

const NOW = new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const idea = (title, audience = 'Independent golf coaches') => ({
  title, kind: 'campaign', description: 'd', audience, outcome: 'o', ownerNotes: '', sources: [],
});

function fact(over) {
  return {
    id: `fact_${Math.random().toString(36).slice(2, 8)}`,
    label: 'Offer', value: 'A guided performance review', source: 'https://example.com/offer',
    observedAt: NOW, confidence: 'high', status: 'confirmed', category: 'offer', ...over,
  };
}

function fixture({ withFacts = true, audience = 'Independent golf coaches' } = {}) {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.facts = withFacts ? [fact({})] : [];
  const endeavor = selectIdea(business, createIdea(business, idea('Coach cohort', audience)).id, defaultWorkBrief(idea('Coach cohort', audience)));
  return { business, endeavor };
}

const concept = (over = {}) => ({
  angle: 'Dinner angle',
  insight: 'I am tired of taking calls during dinner',
  evidence: [],
  hook: 'Still taking calls during dinner?',
  visual: 'The app booking a lesson while the coach eats',
  copy: 'Copy body',
  productionBrief: 'One 15-second clip from real screenshots',
  hypothesis: 'Tests whether the dinner angle earns a reply; one qualified conversation is a win',
  ...over,
});

await test('required gaps block before any run and optional gaps are named as unknowns', () => {
  const none = fixture({ withFacts: false, audience: '' });
  const gaps = campaignBrief.gaps(none.business, none.endeavor);
  assert.deepEqual(gaps.filter((g) => g.required).map((g) => g.key), ['offer', 'audience']);
  assert.match(gaps[0].hint, /confirmed offer fact/);
  const ready = fixture();
  const optional = campaignBrief.gaps(ready.business, ready.endeavor);
  assert.equal(optional.some((g) => g.required), false);
  assert.deepEqual(optional.map((g) => g.key), ['customer_language', 'exemplars', 'research']);
  const instruction = campaignBrief.instruction(ready.business, ready.endeavor, optional);
  assert.match(instruction, /Unknown: Customer language\. Do not invent it\./);
  assert.match(instruction, /Audience: Independent golf coaches/);
  assert.match(instruction, new RegExp(`fact:${ready.business.facts[0].id}`));
  // Audience seeded from the idea is editable and its removal reopens the gap.
  updateEndeavor(ready.business, ready.endeavor.id, {
    title: ready.endeavor.title, description: 'd', intendedDeliverables: ['x'],
    effortBudget: 'e', completionCriteria: 'c', audience: '  ',
  });
  assert.equal(ready.endeavor.audience, undefined);
  assert.ok(campaignBrief.gaps(ready.business, ready.endeavor).some((g) => g.key === 'audience' && g.required));
  assert.throws(() => skillFor('nope'), /Choose a skill/);
  assert.equal(skillFor('campaign_brief').id, 'campaign_brief');
});

await test('the full prompt stays under the provider cap with a large library', () => {
  const { business, endeavor } = fixture();
  for (let i = 0; i < 60; i++)
    business.facts.push(fact({ label: `Fact ${i}`, value: 'v'.repeat(800), category: i % 2 ? 'product' : 'other' }));
  for (let i = 0; i < 10; i++) addCorrection(business, { text: `Rule ${i}`, scope: 'campaign_brief' });
  const gaps = campaignBrief.gaps(business, endeavor);
  const prompt = executionPrompt(business, endeavor, campaignBrief.instruction(business, endeavor, gaps));
  assert.ok(prompt.length <= 28000);
  assert.match(prompt, /Skill: campaign brief/);
});

await test('parse flags duplicates, unresolved evidence, and counts without dropping anything', () => {
  const { business, endeavor } = fixture();
  const factId = business.facts[0].id;
  addResearchCandidates(business, endeavor.id, [{
    name: 'Source', url: 'https://example.org/research', retrievedAt: NOW,
    observedFacts: ['x'], fitRationale: 'y', uncertainties: [],
  }]);
  reviewResearchCandidate(business, endeavor.id, endeavor.research[0].id, 'shortlisted');
  const parsed = campaignBrief.parse({
    concepts: [
      concept({ evidence: [`fact:${factId}`] }),
      concept({ angle: 'dinner-angle', hook: '  still TAKING calls during dinner? ', evidence: ['https://example.org/research'] }),
      concept({ angle: 'Myth', hook: 'A different hook entirely', evidence: ['fact:nope', 'https://elsewhere.example/'], hypothesis: 'short' }),
      concept({ angle: 'Fourth', hook: 'Fourth hook here', copy: 'x'.repeat(2000) }),
      concept({ angle: 'Fifth', hook: 'Dropped by the cap' }),
    ],
    gaps: ['Pricing'],
    nextDecision: 'Pick one.',
  }, business, endeavor);
  const data = JSON.parse(parsed.data);
  assert.equal(data.concepts.length, 4);
  assert.ok(parsed.flags.some((f) => /expected 3 concepts and received 5/.test(f)));
  assert.deepEqual(data.concepts[0].flags, []);
  assert.ok(data.concepts[1].flags.some((f) => /repeats concept 1 \(same angle\)/.test(f)));
  assert.ok(data.concepts[1].flags.some((f) => /repeats concept 1 \(same hook\)/.test(f)));
  assert.ok(data.concepts[2].flags.some((f) => /insight not traced to evidence/.test(f)));
  assert.ok(data.concepts[2].flags.some((f) => /"fact:nope" does not resolve/.test(f)));
  assert.ok(data.concepts[2].flags.some((f) => /hypothesis is shorter than 10/.test(f)));
  assert.ok(data.concepts[3].flags.some((f) => /copy was cut at 1500/.test(f)));
  assert.equal(data.concepts[3].copy.length, 1500);
  assert.deepEqual(data.gaps, ['Pricing']);
  assert.equal(parsed.nextDecision, 'Pick one.');
  assert.match(parsed.content, /## Concept 2: dinner-angle/);
  assert.match(parsed.content, /## Checks/);
  assert.match(parsed.content, /Wanted and did not have|Information the model wanted/);
  assert.equal(parseCampaignBriefData({ data: parsed.data }).concepts.length, 4);
  assert.equal(parseCampaignBriefData({ data: 'not json' }), null);
  assert.equal(parseCampaignBriefData(undefined), null);
});

await test('stale cited facts become claims to verify and garbage input still yields a reviewable brief', () => {
  const { business, endeavor } = fixture();
  business.facts[0].observedAt = daysAgo(120);
  const parsed = campaignBrief.parse({ concepts: [concept({ evidence: [`fact:${business.facts[0].id}`] }), concept({ angle: 'Other', hook: 'Other hook' })] }, business, endeavor);
  const data = JSON.parse(parsed.data);
  assert.equal(data.claimsToVerify.length, 1);
  assert.match(parsed.content, /## Claims to verify/);
  const empty = campaignBrief.parse('nonsense', business, endeavor);
  assert.equal(JSON.parse(empty.data).concepts.length, 0);
  assert.ok(empty.flags.some((f) => /received 0/.test(f)));
  assert.match(empty.nextDecision, /Review the concepts/);
});

await test('two businesses get instructions from their own libraries and nothing from a conversation', () => {
  const a = fixture();
  const z = fixture();
  z.business.name = 'Astro-Log';
  z.business.facts = [fact({ label: 'Offer', value: 'A sky journal for amateur astronomers' })];
  addCorrection(a.business, { text: 'Never mention handicap.', scope: 'campaign_brief' });
  const artifact = saveArtifact(z.business, z.endeavor.id, { kind: 'content', title: 'Great post', content: 'Body', source: 'owner' });
  reviewArtifact(z.business, z.endeavor.id, artifact.id);
  markExemplar(z.business, z.endeavor.id, artifact.id, 'Leads with a sky event, not the app.');
  const promptA = executionPrompt(a.business, a.endeavor, campaignBrief.instruction(a.business, a.endeavor, campaignBrief.gaps(a.business, a.endeavor)), 'campaign_brief');
  const promptZ = executionPrompt(z.business, z.endeavor, campaignBrief.instruction(z.business, z.endeavor, campaignBrief.gaps(z.business, z.endeavor)), 'campaign_brief');
  // Without the skill scope, a skill-scoped correction must not leak into plain runs.
  assert.equal(executionPrompt(a.business, a.endeavor, 'plain').includes('Never mention handicap.'), false);
  assert.match(promptA, /Never mention handicap\./);
  assert.equal(promptZ.includes('Never mention handicap.'), false);
  assert.match(promptZ, /Leads with a sky event/);
  assert.equal(promptA.includes('Leads with a sky event'), false);
  assert.equal(promptA.includes('discussion'), false);
});

await test('promoting a concept is idempotent and titled with the campaign asset name', () => {
  const { business, endeavor } = fixture();
  const answer = demoCampaignBriefAnswer(business, endeavor);
  const parsed = campaignBrief.parse(answer, business, endeavor);
  const brief = saveArtifact(business, endeavor.id, {
    kind: 'content', title: 'Brief', content: parsed.content, source: 'assistant', data: parsed.data,
  });
  const promoted = promoteConcept(business, endeavor.id, brief.id, 1);
  assert.equal(promoted.title, `${endeavor.code}_worked-example_brief_v1`);
  assert.deepEqual(promoted.sourceEvidence, [`concept:${brief.id}:1`]);
  assert.match(promoted.versions[0].content, /Not produced, published, or tested/);
  assert.equal(promoteConcept(business, endeavor.id, brief.id, 1).id, promoted.id);
  assert.equal(endeavor.artifacts.length, 2);
  assert.throws(() => promoteConcept(business, endeavor.id, brief.id, 9), /Choose a concept/);
  assert.throws(() => promoteConcept(business, endeavor.id, promoted.id, 0), /no campaign brief concepts/);
  assert.throws(() => saveArtifact(business, endeavor.id, { kind: 'content', title: 't', content: 'c', source: 'owner', data: 'x'.repeat(20001) }), /too large/);
});

await test('the campaign brief routes to OpenAI strategic and other kinds are unchanged', () => {
  const { endeavor } = fixture();
  endeavor.status = 'ready';
  const plan = planExecution(endeavor, 'campaign_brief');
  assert.equal(plan.route, 'in_app');
  assert.equal(plan.provider, 'openai');
  assert.equal(plan.workload, 'strategic');
  assert.equal(plan.maximumSharedReservationMicros, 125000);
  assert.equal(planExecution(endeavor).provider, 'deepseek');
  endeavor.status = 'stopped';
  assert.equal(planExecution(endeavor, 'campaign_brief').route, 'human');
});
