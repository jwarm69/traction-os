import assert from 'node:assert/strict';
import { demoBusiness } from '../lib/engine.ts';
import {
  addExploreMessage,
  createIdea,
  exploreState,
  parkIdea,
  restoreIdea,
  updateIdea,
} from '../lib/explore.ts';

const business = demoBusiness();
assert.deepEqual(exploreState(business), { ideas: [], messages: [] });
assert.equal(business.explore, undefined, 'reading an older business must not mutate it');

const base = {
  title: 'Creator collaboration',
  kind: 'outreach',
  description: 'Explore a collaboration with a relevant creator.',
  audience: 'Interested readers',
  outcome: 'Qualified visits',
  ownerNotes: 'No ad budget.',
  sources: ['https://example.com/creator'],
};
const idea = createIdea(business, base);
assert.equal(business.explore.ideas.length, 1);
assert.equal(idea.status, 'active');
assert.deepEqual(idea.sources, base.sources);

updateIdea(business, idea.id, { ...base, title: 'Daily creator series' });
assert.equal(idea.title, 'Daily creator series');
const parkedAt = idea.updatedAt;
parkIdea(business, idea.id, 'Wait for the new landing page.');
assert.equal(idea.status, 'parked');
assert.equal(idea.parkedReason, 'Wait for the new landing page.');
parkIdea(business, idea.id, 'A duplicate request must not rewrite the reason.');
assert.equal(idea.parkedReason, 'Wait for the new landing page.');
restoreIdea(business, idea.id);
assert.equal(idea.status, 'active');
assert.equal(idea.parkedReason, undefined);
assert.ok(idea.updatedAt >= parkedAt);

const owner = addExploreMessage(business, {
  role: 'owner',
  content: 'Compare this with a content series.',
  ideaId: idea.id,
});
const assistant = addExploreMessage(business, {
  role: 'assistant',
  content: 'A content series has a lower coordination dependency.',
  ideaId: idea.id,
  suggestions: [
    {
      title: 'Daily content series',
      kind: 'content',
      description: 'Draft a repeatable daily format.',
      audience: 'Interested readers',
      outcome: 'Consistent qualified visits',
    },
  ],
});
assert.equal(owner.role, 'owner');
assert.equal(assistant.suggestions.length, 1);
assert.equal(business.explore.messages.length, 2);
assert.throws(() => updateIdea(business, 'missing', base), /not found/);

console.log('PASS Explore: backward-compatible reads, idea lifecycle, and durable discussion records.');
