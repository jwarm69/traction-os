import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { ideaKinds } from '../lib/explore.ts';
import {
  getPlaybook,
  listPlaybooks,
  playbookIdea,
  playbookStepPhases,
  playbookSteps,
} from '../lib/playbooks.ts';
import { addChecklistItem, selectIdea } from '../lib/work.ts';

const ids = [
  'creator_outreach',
  'directory_submissions',
  'content_batch',
  'customer_interviews',
];

await test('the catalog holds exactly the four expected playbooks', () => {
  const playbooks = listPlaybooks();
  assert.equal(playbooks.length, 4);
  assert.deepEqual(
    playbooks.map((playbook) => playbook.id),
    ids,
  );
  for (const playbook of playbooks) {
    assert.ok(playbook.title.length > 0);
    assert.ok(playbook.description.trim().endsWith('.'));
    assert.ok(ideaKinds.includes(playbook.kind));
    assert.ok(playbook.observationPlan.length > 0);
    assert.ok(playbook.intendedDeliverables.length >= 2);
    assert.ok(playbook.completionCriteria.length > 0);
  }
});

await test('every playbook runs research -> draft -> owner review -> execute -> measure once, in order', () => {
  for (const playbook of listPlaybooks()) {
    assert.deepEqual(
      playbook.steps.map((step) => step.phase),
      playbookStepPhases,
      `${playbook.id} step order`,
    );
    for (const step of playbook.steps) {
      assert.equal(typeof step.text, 'string');
      assert.ok(step.text.length > 20, `${playbook.id} step text`);
    }
    assert.deepEqual(
      playbookSteps(playbook.id),
      playbook.steps.map((step) => step.text),
    );
  }
});

await test('the effort budget defers to the owner and review precedes execution', () => {
  for (const playbook of listPlaybooks()) {
    assert.match(playbook.effortBudget, /owner/i, playbook.id);
    const review = playbook.steps.find((step) => step.phase === 'owner_review');
    const execute = playbook.steps.find((step) => step.phase === 'execute');
    assert.match(review.text, /owner/i, playbook.id);
    assert.ok(
      playbook.steps.indexOf(review) < playbook.steps.indexOf(execute),
      playbook.id,
    );
  }
});

await test('no copy invents statistics, rates, or promised results', () => {
  const banned =
    /\b\d+\s?%|\b\d+x\b|guarantee|guaranteed|proven|will (?:double|triple|increase|grow|boost|drive)|conversion rate|roi\b|leads per|sales per|expect(?:ed)? (?:results|revenue|growth)/i;
  for (const playbook of listPlaybooks()) {
    const copy = [
      playbook.title,
      playbook.description,
      playbook.completionCriteria,
      playbook.effortBudget,
      playbook.observationPlan,
      playbook.defaultAudience,
      ...playbook.intendedDeliverables,
      ...playbook.steps.map((step) => step.text),
    ].join('\n');
    assert.equal(banned.test(copy), false, `${playbook.id} copy: ${copy}`);
    // Bare digits would be an invented number; none of the copy needs any.
    assert.equal(/\d/.test(copy), false, `${playbook.id} contains a number`);
  }
});

await test('listPlaybooks and getPlaybook return copies, so callers cannot mutate the catalog', () => {
  const first = listPlaybooks()[0];
  first.title = 'Mutated';
  first.steps.length = 0;
  assert.equal(listPlaybooks()[0].title, 'Creator outreach');
  assert.equal(listPlaybooks()[0].steps.length, 5);
  const one = getPlaybook('content_batch');
  one.intendedDeliverables.push('sneaky');
  assert.equal(
    getPlaybook('content_batch').intendedDeliverables.includes('sneaky'),
    false,
  );
});

await test('unknown playbook ids are rejected', () => {
  assert.throws(() => getPlaybook('nope'), /Playbook not found/);
  assert.throws(() => playbookIdea(demoBusiness(), 'nope'), /Playbook not found/);
});

await test('playbookIdea produces createIdea and selectIdea inputs and names the business', () => {
  const business = demoBusiness();
  const built = playbookIdea(business, 'creator_outreach');
  assert.equal(built.idea.kind, 'outreach');
  assert.equal(built.idea.title, 'Creator outreach');
  assert.ok(built.idea.description.includes(business.name));
  assert.deepEqual(built.idea.sources, []);
  assert.equal(built.idea.audience, built.playbook.defaultAudience);
  assert.match(built.idea.ownerNotes, /playbook/i);
  assert.equal(built.brief.completionCriteria, built.playbook.completionCriteria);
  assert.deepEqual(
    built.brief.intendedDeliverables,
    built.playbook.intendedDeliverables,
  );
  assert.equal(built.checklist.length, 5);
});

await test('a supplied audience overrides the default and is trimmed and bounded', () => {
  const business = demoBusiness();
  const built = playbookIdea(business, 'content_batch', {
    audience: '  Campus club organisers  ',
  });
  assert.equal(built.idea.audience, 'Campus club organisers');

  const blank = playbookIdea(business, 'content_batch', { audience: '   ' });
  assert.equal(blank.idea.audience, blank.playbook.defaultAudience);

  const long = playbookIdea(business, 'content_batch', {
    audience: 'a'.repeat(500),
  });
  assert.equal(long.idea.audience.length, 200);
});

await test('one click runs createIdea -> selectIdea -> addChecklistItem for every playbook', () => {
  for (const id of ids) {
    const business = demoBusiness();
    const built = playbookIdea(business, id, { audience: 'Local owners' });
    const idea = createIdea(business, built.idea);
    assert.equal(idea.status, 'active');
    const endeavor = selectIdea(business, idea.id, built.brief);
    assert.equal(endeavor.status, 'preparing');
    assert.equal(endeavor.kind, built.playbook.kind);
    assert.equal(
      endeavor.checklist.length,
      built.playbook.intendedDeliverables.length,
    );
    for (const text of built.checklist) addChecklistItem(business, endeavor.id, text);
    assert.equal(
      endeavor.checklist.length,
      built.playbook.intendedDeliverables.length + 5,
    );
    assert.equal(
      endeavor.checklist.every((item) => item.done === false),
      true,
    );
    assert.equal(endeavor.artifacts.length, 0);
    assert.equal(endeavor.observations.length, 0);
  }
});
