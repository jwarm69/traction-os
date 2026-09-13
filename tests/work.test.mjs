import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness, weeklyReview } from '../lib/engine.ts';
import { createIdea, updateIdea } from '../lib/explore.ts';
import {
  activeArtifact,
  addChecklistItem,
  addObservation,
  addResearchCandidates,
  defaultWorkBrief,
  reviewArtifact,
  reviewResearchCandidate,
  saveArtifact,
  selectIdea,
  setChecklistItem,
  setPortfolio,
  sourceIdeaChanged,
  transitionEndeavor,
} from '../lib/work.ts';

const input = {
  title: 'Creator collaboration',
  kind: 'outreach',
  description: 'Develop one relevant collaboration.',
  audience: 'Potential readers',
  outcome: 'A reviewed collaboration direction',
  ownerNotes: 'No paid placement.',
  sources: ['https://example.com/creator'],
};

await test('guided Explore infers a bounded Do brief without another form', () => {
  const brief = defaultWorkBrief(input);
  assert.equal(brief.intendedDeliverables.length, 2);
  assert.match(brief.intendedDeliverables[0], /prospect list/i);
  assert.match(brief.effortBudget, /owner approval/i);
  assert.equal(brief.completionCriteria, input.outcome);
});

await test('S3 selects a frozen idea idempotently and guards work transitions', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  const brief = {
    intendedDeliverables: ['A pitch', 'A shortlist'],
    effortBudget: 'Two owner hours, no ad spend',
    completionCriteria: 'One reviewed pitch and shortlist',
  };
  const work = selectIdea(business, idea.id, brief);
  assert.equal(selectIdea(business, idea.id, brief).id, work.id);
  assert.equal(work.sourceIdeaSnapshot.title, input.title);
  updateIdea(business, idea.id, { ...input, title: 'Changed later' });
  assert.equal(work.title, input.title);
  assert.equal(sourceIdeaChanged(business, work), true);
  assert.throws(() => transitionEndeavor(business, work.id, 'completed'));
  assert.throws(() => transitionEndeavor(business, work.id, 'blocked', ''));
  transitionEndeavor(business, work.id, 'ready');
  transitionEndeavor(business, work.id, 'in_progress');
  transitionEndeavor(business, work.id, 'blocked', 'Waiting for owner access.');
  transitionEndeavor(business, work.id, 'in_progress');
});

await test('S4 versions artifacts, preserves reviewed versions, and tracks checklists', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  const work = selectIdea(business, idea.id, {
    intendedDeliverables: ['Draft'],
    effortBudget: 'One hour',
    completionCriteria: 'Reviewed draft',
  });
  const added = addChecklistItem(business, work.id, 'Confirm the CTA');
  setChecklistItem(business, work.id, added.id, true);
  assert.equal(added.done, true);
  const artifact = saveArtifact(business, work.id, {
    kind: 'outreach', title: 'Pitch', content: 'Version one', source: 'owner',
  });
  reviewArtifact(business, work.id, artifact.id);
  saveArtifact(business, work.id, {
    artifactId: artifact.id, kind: 'outreach', title: 'Pitch', content: 'Version two', source: 'assistant',
  });
  assert.equal(artifact.versions.length, 2);
  assert.equal(activeArtifact(artifact).content, 'Version two');
  assert.equal(artifact.reviewedAt, undefined);
  assert.equal(artifact.versions[0].content, 'Version one');
});

await test('S5 keeps sourced research facts, rationale, unknowns, and review state', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  const work = selectIdea(business, idea.id, {
    intendedDeliverables: ['Shortlist'], effortBudget: 'One hour', completionCriteria: 'Three reviewed candidates',
  });
  const candidate = {
    name: 'Example', url: 'https://example.com/', retrievedAt: new Date().toISOString(),
    observedFacts: ['The source describes Example Domain.'],
    fitRationale: 'Could be useful only as a test fixture.',
    uncertainties: ['Real audience fit is unknown.'],
  };
  const [added] = addResearchCandidates(business, work.id, [candidate, candidate]);
  assert.equal(work.research.length, 1);
  reviewResearchCandidate(business, work.id, added.id, 'shortlisted');
  assert.equal(added.status, 'shortlisted');
  assert.throws(() => reviewResearchCandidate(business, work.id, added.id, 'rejected'));
  reviewResearchCandidate(business, work.id, added.id, 'rejected', 'Fixture only.');
  assert.equal(added.rejectionReason, 'Fixture only.');
});

await test('S6 returns observations to Explore and includes work in portfolio/review', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  const work = selectIdea(business, idea.id, {
    intendedDeliverables: ['Draft'], effortBudget: 'One hour', completionCriteria: 'Reviewed draft',
  });
  transitionEndeavor(business, work.id, 'ready');
  transitionEndeavor(business, work.id, 'in_progress');
  addObservation(business, work.id, {
    summary: 'Two owner interviews found the message unclear.', evidenceUrls: [],
    observedAt: new Date().toISOString(), source: 'Owner interviews', actualEffort: '45 minutes',
    nextDecision: 'Rewrite the promise before outreach.',
  });
  assert.match(business.explore.messages.at(-1).content, /Observed result from Do/);
  transitionEndeavor(business, work.id, 'completed');
  setPortfolio(business, { priority: 'now', ownerHours: 3, note: 'Validate the message.' });
  assert.equal(business.portfolio.priority, 'now');
  const review = weeklyReview(business);
  assert.match(review.summary, /1 Do work item completed/);
  assert.match(review.summary, /does not itself establish acquisition/);
});
