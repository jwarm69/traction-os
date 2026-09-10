import assert from 'node:assert/strict';
import {
  acceptGuidedProposal,
  agreeGuidedDiagnosis,
  confirmGuidedBrief,
  demoBusiness,
  ensureGuided,
  invalidateGuidedBrief,
  saveGuidedDraft,
  setGuidedProposal,
} from '../lib/engine.ts';

const values = {
  offer: 'A guided performance review',
  audience: 'Independent golf coaches',
  readiness: 'The individual review workflow is usable; coach teams are not ready',
  objective: 'Learn whether coaches can guide one player to a useful review in 14 days',
  resources: 'Three owner hours and $0 external spend',
};
const all = Object.fromEntries(Object.keys(values).map((key) => [key, true]));
const proposal = {
  title: 'Coach-guided first value pilot',
  uncertainty: 'Whether the ready workflow produces a useful review',
  rationale: 'A five-person pilot observes value before acquisition spend.',
  audience: values.audience,
  action: 'Invite five owner-selected eligible coaches to guide one player.',
  ownerContribution: 'Select eligible coaches and confirm the promise.',
  timeWindow: '14 days',
  cost: '$0',
  metric: 'Coaches whose player completes one useful review',
  successRule: '3 of 5 eligible coaches complete the workflow.',
  stoppingRule: 'Stop at 14 days, five attempts, or an unavailable workflow.',
  measurementPlan: 'Track invited, started, and completed for the same cohort.',
  alternatives: ['Broad acquisition waits for evidence of first value.'],
};

const business = demoBusiness();
business.url = 'https://confirmed.example';
business.goal = 'Proposed legacy goal';
business.budget = 'Proposed legacy budget';
business.notes = 'Owner said coach teams are not ready.';
business.facts = [];
const initial = ensureGuided(business);
assert.equal(initial.draft.fields.objective.confirmed, false);
assert.equal(initial.draft.fields.resources.confirmed, false);
assert.equal(initial.draft.ownerNotes, business.notes);
assert.throws(() => confirmGuidedBrief(business), /Confirm offer/);

saveGuidedDraft(business, values, all, 'Exact owner wording stays here.');
const first = confirmGuidedBrief(business);
assert.equal(first.number, 1);
assert.equal(first.ownerNotes, 'Exact owner wording stays here.');
agreeGuidedDiagnosis(business, {
  hypothesis: 'Activation is unknown; acquisition is not established as the problem.',
  evidence: ['No comparable baseline is recorded.'],
  alternatives: ['Acquisition may be limiting demand.'],
  nextObservation: 'Whether an eligible user reaches first value.',
  confidence: 'low',
  agreedAt: new Date().toISOString(),
});
setGuidedProposal(business, proposal);
acceptGuidedProposal(business);
assert.equal(business.guided.proposal.status, 'accepted');

const corrected = { ...values, audience: 'Individual golfers' };
saveGuidedDraft(business, corrected, { ...all, audience: true }, 'Audience correction');
assert.throws(() => setGuidedProposal(business, proposal), /draft changed/);
assert.throws(() => acceptGuidedProposal(business), /draft changed/);
const second = confirmGuidedBrief(business);
assert.equal(second.number, 2);
assert.equal(business.guided.diagnosis, undefined);
assert.equal(business.guided.proposal, undefined);
assert.equal(business.guided.proposalHistory.length, 1);
assert.equal(business.guided.proposalHistory[0].status, 'accepted');
assert.equal(business.rounds.length, 0);

business.notes = 'New context added through the legacy context editor.';
invalidateGuidedBrief(business);
assert.equal(business.guided.activeBriefVersionId, undefined);
assert.ok(Object.values(business.guided.draft.fields).every((field) => !field.confirmed));
assert.match(business.guided.draft.ownerNotes, /New context added/);
assert.throws(() => confirmGuidedBrief(business), /Confirm offer/);

console.log('PASS guided Release A: explicit readiness gate, exact notes, immutable versions, stale-proposal rejection, accepted-history preservation, and legacy-context reconfirmation.');
