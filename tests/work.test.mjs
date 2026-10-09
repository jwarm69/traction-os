import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness, weeklyReview } from '../lib/engine.ts';
import { createIdea, updateIdea } from '../lib/explore.ts';
import {
  activeArtifact,
  addChecklistItem,
  campaignAssetName,
  campaignLink,
  campaignPrefix,
  endeavorByCode,
  ensureCampaignCodes,
  prepareGuidedProposal,
  addObservation,
  addResearchCandidates,
  defaultWorkBrief,
  importRunnerResult,
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

await test('runner results return to the endeavor once, unreviewed, with the source job', () => {
  const business = demoBusiness();
  const idea = createIdea(business, input);
  const work = selectIdea(business, idea.id, defaultWorkBrief(input));
  const result = { text: 'Shortlist with sources', sourceJobId: 'job_1' };
  const artifact = importRunnerResult(business, work.id, 'job_1', result);
  assert.equal(artifact.kind, 'outreach');
  assert.equal(artifact.reviewedAt, undefined);
  assert.deepEqual(artifact.sourceEvidence, ['runner-job:job_1']);
  assert.equal(activeArtifact(artifact).content, 'Shortlist with sources');
  assert.equal(importRunnerResult(business, work.id, 'job_1', result), null);
  assert.equal(importRunnerResult(business, work.id, 'job_2', { text: ' ' }), null);
  assert.equal(work.artifacts.length, 1);
});

await test('campaign prefixes are deterministic and fall back to CMP', () => {
  assert.equal(campaignPrefix({ name: 'AlignIQ Golf' }), 'AG');
  assert.equal(campaignPrefix({ name: 'Bite Club Meal Plan' }), 'BCM');
  assert.equal(campaignPrefix({ name: 'Tonight' }), 'CMP');
  assert.equal(campaignPrefix({ name: '  ' }), 'CMP');
  assert.equal(campaignPrefix({ name: '3rd Street Bakery' }), 'SB');
  assert.equal(campaignPrefix({ name: 'über cool café' }), 'ÜCC');
});

await test('campaign codes are assigned on creation, never reused, and backfilled in createdAt order', () => {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  const idea = createIdea(business, input);
  const brief = defaultWorkBrief(input);
  const first = selectIdea(business, idea.id, brief);
  assert.equal(first.code, 'AG001');
  // Repeated selection returns the same endeavor and consumes no number.
  assert.equal(selectIdea(business, idea.id, brief).code, 'AG001');
  assert.equal(business.work.nextCampaignNumber, 2);
  assert.match(business.log[0].text, /AG001/);

  business.guided = {
    proposal: { id: 'proposal_1', status: 'accepted', title: 'Pilot', uncertainty: 'U', rationale: 'R',
      action: 'Invite five coaches.', measurementPlan: 'Track the cohort.', ownerContribution: 'Select coaches',
      cost: '$0', timeWindow: '14 days', successRule: '3 of 5 complete.', stoppingRule: 'Stop at 14 days.' },
  };
  const guided = prepareGuidedProposal(business);
  assert.equal(guided.code, 'AG002');
  assert.equal(prepareGuidedProposal(business).code, 'AG002');

  // Stopping an endeavor never frees its number.
  transitionEndeavor(business, first.id, 'stopped');
  const second = createIdea(business, { ...input, title: 'Second idea' });
  assert.equal(selectIdea(business, second.id, brief).code, 'AG003');

  // Pre-code records are backfilled oldest first and the pass is idempotent.
  const legacy = demoBusiness();
  legacy.name = 'Tonight';
  const older = createIdea(legacy, { ...input, title: 'Older' });
  const newer = createIdea(legacy, { ...input, title: 'Newer' });
  const a = selectIdea(legacy, older.id, brief);
  const z = selectIdea(legacy, newer.id, brief);
  a.createdAt = '2026-01-01T00:00:00.000Z';
  z.createdAt = '2026-02-01T00:00:00.000Z';
  delete a.code;
  delete z.code;
  delete legacy.work.nextCampaignNumber;
  assert.equal(ensureCampaignCodes(legacy), true);
  assert.equal(a.code, 'CMP001');
  assert.equal(z.code, 'CMP002');
  assert.equal(ensureCampaignCodes(legacy), false);
  assert.equal(endeavorByCode(legacy, ' cmp002 ').id, z.id);
  assert.equal(endeavorByCode(legacy, 'CMP009'), undefined);
});

await test('campaign links carry UTMs on https only and asset names are slugged', () => {
  const link = campaignLink('https://example.com/offer?ref=x#top', 'AG003');
  const url = new URL(link);
  assert.equal(url.searchParams.get('ref'), 'x');
  assert.equal(url.searchParams.get('utm_campaign'), 'AG003');
  assert.equal(url.searchParams.get('utm_source'), 'traction');
  assert.equal(url.searchParams.get('utm_medium'), 'owner');
  assert.equal(url.hash, '#top');
  assert.equal(
    new URL(campaignLink('https://example.com/', 'AG003', 'Email Newsletter')).searchParams.get('utm_medium'),
    'email-newsletter',
  );
  assert.throws(() => campaignLink('http://example.com/', 'AG003'), /https/);
  assert.throws(() => campaignLink('not a url', 'AG003'), /https/);
  assert.throws(() => campaignLink('https://example.com/', '  '), /code/);
  assert.equal(campaignAssetName('AG003', 'Dinner angle!', 'UGC', 2), 'AG003_dinner-angle_ugc_v2');
  assert.equal(campaignAssetName('AG003', '', '', 0), 'AG003_angle_format_v1');
});
