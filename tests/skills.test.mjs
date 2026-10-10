import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addCorrection } from '../lib/knowledge.ts';
import { executionPrompt } from '../lib/execution.ts';
import { planExecution } from '../lib/execution-policy.ts';
import { defaultWorkBrief, selectIdea, saveArtifact, reviewArtifact, setAudience } from '../lib/work.ts';
import { demoCampaignBrief, parseBriefData, promoteConcept, skills } from '../lib/skills.ts';

const skill = skills.campaign_brief;
const NOW = Date.parse('2026-10-09T12:00:00Z');
const OLD = '2026-05-01T00:00:00.000Z';

const idea = (title, audience = 'Golf coaches with 10+ students', kind = 'campaign') => ({
  title,
  kind,
  description: `Fixture ${title}`,
  audience,
  outcome: '',
  ownerNotes: '',
  sources: [],
});

function fact(business, over) {
  const item = {
    id: `fact_${business.facts.length + 1}`,
    label: 'Offer',
    value: 'Real-time alignment feedback for golfers',
    source: 'https://aligniqgolf.com',
    observedAt: '2026-09-20T00:00:00.000Z',
    confidence: 'high',
    status: 'confirmed',
    category: 'offer',
    ...over,
  };
  business.facts.push(item);
  return item;
}

function fixture(audience) {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.facts = [];
  business.corrections = [];
  business.work = { endeavors: [] };
  const e = selectIdea(business, createIdea(business, idea('Coach launch', audience)).id, defaultWorkBrief(idea('Coach launch', audience)));
  return { business, e };
}

const concept = (angle, hook, evidence) => ({
  angle,
  insight: 'Coaches lose lesson time re-checking setup.',
  evidence,
  hook,
  visual: 'A coach watches the alignment line snap straight.',
  copy: 'Spend lessons on the swing, not the setup.',
  productionBrief: '20-second vertical video from the range.',
  hypothesis: 'Coaches reply more to a time-saved angle.',
});

await test('required gaps block before any run; the audience comes from the idea', () => {
  const { business, e } = fixture('');
  const required = skill.gaps(business, e).filter((gap) => gap.required).map((gap) => gap.key);
  assert.deepEqual(required, ['offer', 'audience']);
  assert.match(skill.gaps(business, e)[0].hint, /needs a confirmed offer fact/);
  fact(business);
  setAudience(business, e.id, 'Golf coaches');
  assert.deepEqual(skill.gaps(business, e).filter((gap) => gap.required), []);
  const seeded = fixture('Weekend golfers');
  assert.equal(seeded.e.audience, 'Weekend golfers');
});

await test('an unconfirmed or off-category fact does not satisfy the offer input', () => {
  const { business, e } = fixture();
  fact(business, { status: 'unreviewed' });
  fact(business, { category: 'voice' });
  assert.ok(skill.gaps(business, e).some((gap) => gap.key === 'offer'));
});

await test('optional gaps become unknowns, evidence ids are listed, and corrections are scoped', () => {
  const { business, e } = fixture();
  const offer = fact(business);
  fact(business, { label: 'Price', value: '$99 a year', category: 'offer', observedAt: OLD });
  addCorrection(business, { text: 'Never promise lower scores.', scope: 'campaign_brief' });
  addCorrection(business, { text: 'Customer language only.', scope: 'customer_language' });
  const gaps = skill.gaps(business, e);
  const instruction = skill.instruction(business, e, gaps, NOW);
  assert.match(instruction, /Unknown: customer language\. Do not invent it\./);
  assert.match(instruction, /Unknown: approved examples\./);
  assert.ok(instruction.includes(`fact:${offer.id} — Offer`));
  assert.match(instruction, /Price \(verify: observed 2026-05-01\)/);
  const prompt = executionPrompt(business, e, instruction, { format: skill.format, scope: 'campaign_brief' });
  assert.ok(prompt.includes('"concepts"'));
  assert.ok(prompt.includes('Never promise lower scores.'));
  assert.ok(!prompt.includes('Customer language only.'));
});

await test('the instruction stays under the prompt cap with a full library, and carries no conversation text', () => {
  const { business, e } = fixture();
  for (let i = 0; i < 200; i += 1) fact(business, { label: `Fact ${i}`, value: 'x'.repeat(200), category: i % 2 ? 'customer_language' : 'other' });
  business.explore.messages.push({ id: 'm1', role: 'user', content: 'SECRET CHAT LINE', createdAt: '2026-10-01T00:00:00Z' });
  const prompt = executionPrompt(business, e, skill.instruction(business, e, skill.gaps(business, e), NOW), { format: skill.format, scope: 'campaign_brief' });
  assert.ok(prompt.length <= 28000);
  assert.ok(prompt.includes('"concepts"'), 'the output format survives the cap');
  assert.ok(!prompt.includes('SECRET CHAT LINE'));
});

await test('parse flags duplicates, untraced evidence, stale claims, and counts without dropping concepts', () => {
  const { business, e } = fixture();
  const offer = fact(business);
  const old = fact(business, { label: 'Price', observedAt: OLD });
  e.research.push({ id: 'r1', name: 'Coach forum', url: 'https://forum.example/coaches', retrievedAt: '2026-10-01', observedFacts: [], fitRationale: '', uncertainties: [], status: 'shortlisted' });
  const parsed = skill.parse(
    {
      concepts: [
        concept('Time saved', 'Ten seconds to a perfect setup.', [`fact:${offer.id}`]),
        concept('time-saved', 'A different hook entirely here.', ['https://forum.example/coaches']),
        concept('Proof first', '  ten SECONDS to a perfect setup. ', ['fact:made_up']),
        concept('Price', 'Less than one lesson a year.', [`fact:${old.id}`]),
      ],
      gaps: ['Coach testimonials'],
      nextDecision: 'Pick one',
    },
    business,
    e,
    NOW,
  );
  const data = parseBriefData(parsed.data);
  assert.equal(data.concepts.length, 4, 'nothing is dropped');
  assert.deepEqual(parsed.flags, ['Returned 4 concepts; three is the target.']);
  assert.deepEqual(data.concepts[0].flags, []);
  assert.ok(data.concepts[1].flags.includes('Concept 2 repeats concept 1.'));
  assert.ok(data.concepts[2].flags.includes('Insight not traced to evidence.'));
  assert.ok(data.concepts[2].flags.includes('Concept 3 repeats concept 1.'));
  assert.deepEqual(data.claimsToVerify, ['Price (observed 2026-05-01)']);
  assert.match(parsed.content, /^# AG001 campaign brief: Coach launch/);
  assert.match(parsed.content, /## Claims to verify\n\n- Price \(observed 2026-05-01\)/);
  assert.match(parsed.content, /## Missing information\n\n- Coach testimonials/);
  assert.equal(parsed.nextDecision, 'Pick one');
});

await test('parse enforces lengths by flagging and cutting, and rejects output with no concepts', () => {
  const { business, e } = fixture();
  assert.throws(() => skill.parse({ concepts: [] }, business, e), /no concepts/);
  assert.throws(() => skill.parse('not json', business, e), /no concepts/);
  const parsed = skill.parse({ concepts: [{ angle: 'x', hook: 'short', copy: 'y'.repeat(2000) }] }, business, e, NOW);
  const [only] = parseBriefData(parsed.data).concepts;
  assert.ok(only.flags.includes('angle is too short.'));
  assert.ok(only.flags.includes('hook is too short.'));
  assert.ok(only.flags.includes('copy was cut to 1500 characters.'));
  assert.ok(only.flags.includes('hypothesis is missing.'));
  assert.equal(only.copy.length, 1500);
  assert.equal(parsed.nextDecision, 'Choose one concept to promote to a production brief.');
});

await test('promote_concept names the asset by convention and is idempotent', () => {
  const { business, e } = fixture();
  fact(business);
  const parsed = skill.parse(demoCampaignBrief(business, e), business, e, NOW);
  const brief = saveArtifact(business, e.id, { kind: 'content', title: 'AG001 campaign brief', content: parsed.content, source: 'assistant', data: parsed.data });
  const first = promoteConcept(business, e.id, brief.id, 1);
  assert.equal(first.title, 'AG001_proof-first_brief_v1');
  assert.match(first.versions[0].content, /Here is the before and after/);
  assert.equal(promoteConcept(business, e.id, brief.id, 1).id, first.id);
  assert.equal(e.artifacts.length, 2);
  assert.throws(() => promoteConcept(business, e.id, brief.id, 7), /Concept not found/);
  saveArtifact(business, e.id, { artifactId: brief.id, kind: 'content', title: brief.title, content: 'owner rewrite', source: 'owner', data: '{"concepts":[]}' });
  assert.equal(brief.versions.at(-1).data, undefined, 'owner versions never carry skill data');
  assert.throws(() => promoteConcept(business, e.id, brief.id, 0), /no concepts to promote/);
});

await test('the campaign brief routes in-app to OpenAI strategic, even when the work would route to the runner', () => {
  const { business, e } = fixture();
  e.status = 'ready';
  e.description = 'Email coaches and publish the video';
  const reviewed = saveArtifact(business, e.id, { kind: 'content', title: 'Draft', content: 'x', source: 'owner' });
  reviewArtifact(business, e.id, reviewed.id);
  assert.equal(planExecution(e).route, 'computer');
  const plan = planExecution(e, 'campaign_brief');
  assert.equal(plan.route, 'in_app');
  assert.equal(plan.workload, 'strategic');
  assert.equal(plan.maximumSharedReservationMicros, 125_000);
  e.kind = 'product_improvement';
  assert.equal(planExecution(e, 'campaign_brief').route, 'human');
  e.kind = 'campaign';
  e.status = 'blocked';
  assert.equal(planExecution(e, 'campaign_brief').route, 'human');
});
