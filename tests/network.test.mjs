import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addObservation, defaultWorkBrief, selectIdea } from '../lib/work.ts';
import { classifyChannel, insightContext, patternsFor, summarize } from '../lib/network.ts';

const input = {
  title: 'Pitch Jane Doe at Acme Golf newsletter',
  kind: 'outreach',
  description: 'Email jane@acme.example about a creator collaboration worth $4,000.',
  audience: 'Golf coaches',
  outcome: 'A reply',
  ownerNotes: 'Secret pricing: $99',
  sources: ['https://acme.example/jane'],
};

await test('patterns carry categories only and never owner text, names, URLs, or numbers', () => {
  const business = { ...demoBusiness(), mode: 'live' };
  const idea = createIdea(business, input);
  const work = selectIdea(business, idea.id, defaultWorkBrief(input));
  addObservation(business, work.id, {
    summary: 'Jane replied and wants $4,000',
    evidenceUrls: [],
    observedAt: new Date().toISOString(),
    source: 'Gmail',
    actualEffort: '1h',
    nextDecision: 'Negotiate',
    verdict: 'repeat',
  });
  const [pattern] = patternsFor(business);
  assert.deepEqual(Object.keys(pattern).sort(), [
    'channel', 'endeavorId', 'kind', 'observed', 'reviewedArtifact', 'status', 'verdict',
  ]);
  assert.equal(pattern.channel, 'creator');
  assert.equal(pattern.verdict, 'repeat');
  const { endeavorId, ...shared } = pattern;
  assert.doesNotMatch(JSON.stringify(shared), /jane|acme|golf|4,?000|99|example|http/i);
  assert.equal(endeavorId, work.id); // hashed with a random contributor id before storage
});

await test('demo businesses contribute nothing', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  selectIdea(business, idea.id, defaultWorkBrief(input));
  assert.deepEqual(patternsFor(business), []);
});

await test('channel classification is deterministic with safe fallbacks', () => {
  assert.equal(classifyChannel('Submit to startup directories', 'campaign'), 'directory');
  assert.equal(classifyChannel('Post in the subreddit', 'content'), 'community');
  assert.equal(classifyChannel('Tidy things', 'product_improvement'), 'product');
  assert.equal(classifyChannel('Tidy things', 'research'), 'other');
});

await test('aggregates stay hidden until enough distinct accounts contribute', () => {
  const row = (contributorId, verdict = 'unknown', status = 'completed') => ({
    contributorId, kind: 'outreach', channel: 'creator', status, verdict, observed: true,
  });
  assert.deepEqual(summarize([row('a'), row('a'), row('b')]), []);
  assert.equal(insightContext([]), '');
  const [insight] = summarize([row('a', 'repeat'), row('a', 'drop'), row('b', 'repeat'), row('c', 'unknown', 'stopped')]);
  assert.deepEqual(
    { accounts: insight.accounts, endeavors: insight.endeavors, repeat: insight.repeat, drop: insight.drop, stopped: insight.stopped },
    { accounts: 3, endeavors: 4, repeat: 2, drop: 1, stopped: 1 },
  );
  assert.match(insightContext([insight]), /weak priors, not evidence/);
});
