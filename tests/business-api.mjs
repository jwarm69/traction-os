import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const owner = `traction-api-test-${crypto.randomUUID()}`,
  other = `traction-api-test-${crypto.randomUUID()}`;
let current = null,
  revision = 0;
async function act(op, extra = {}, status = 200, as = owner) {
  const r = await fetch(`${base}/api/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      'x-traction-dev-user-id': as,
    },
    body: JSON.stringify({ op, businessId: current?.id, revision, ...extra }),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  if (r.ok && d.business) {
    current = d.business;
    revision = d.revision;
  }
  return d;
}
async function get(id, as = owner) {
  return await (
    await fetch(`${base}/api/workspace${id ? `?businessId=${id}` : ''}`, {
      headers: { 'x-traction-dev-user-id': as },
    })
  ).json();
}
try {
  await act('create_demo');
  const first = current.id;
  await act('update_profile', {
    name: 'Integration test business',
    goal: 'Five qualified calls in 30 days',
    budget: 'Four hours',
    notes: 'No paid ads.',
  });
  await act('create_idea', {
    title: 'Creator collaboration',
    kind: 'outreach',
    description: 'Explore one relevant creator collaboration.',
    audience: 'Independent owners',
    outcome: 'Qualified visits',
    ownerNotes: 'No paid placement.',
    sources: ['https://example.com/creator'],
  });
  const ideaId = current.explore.ideas[0].id;
  await act('update_idea', {
    ideaId,
    title: 'Creator content collaboration',
    kind: 'content',
    description: 'Develop one relevant creator collaboration.',
    audience: 'Independent owners',
    outcome: 'Qualified visits',
    ownerNotes: 'No paid placement.',
    sources: ['https://example.com/creator'],
  });
  await act('park_idea', { ideaId, reason: 'Wait for owner review.' });
  assert.equal(current.explore.ideas[0].status, 'parked');
  await act('restore_idea', { ideaId });
  assert.equal(current.explore.ideas[0].status, 'active');
  const beforeInvalidIdea = current.explore.ideas.length;
  await act(
    'create_idea',
    {
      title: 'Unsafe source',
      kind: 'research',
      description: 'This source must be rejected.',
      sources: ['http://example.com'],
    },
    400,
  );
  assert.equal(current.explore.ideas.length, beforeInvalidIdea);
  const chat = await act('explore_chat', {
    message: 'Compare this idea with a recurring content series.',
    ideaId,
    key: '',
  });
  assert.equal(chat.warning, undefined);
  assert.equal(current.explore.messages.at(-2).role, 'owner');
  assert.equal(current.explore.messages.at(-1).role, 'assistant');
  assert.equal(current.explore.messages.at(-1).suggestions.length, 3);
  await act('run_ideation');
  assert.equal(current.explore.messages.at(-1).suggestions.length, 3);
  const guidedMessage = current.explore.messages.at(-1);
  const beforeGuidedPursuit = current.work?.endeavors.length || 0;
  await act('pursue_suggestion', {
    messageId: guidedMessage.id,
    suggestionIndex: 0,
  });
  assert.equal(current.work.endeavors.length, beforeGuidedPursuit + 1);
  assert.match(current.work.endeavors[0].effortBudget, /owner approval/i);
  await act('select_idea', {
    ideaId,
    intendedDeliverables: ['A reviewed creator pitch'],
    effortBudget: 'Two hours, no ad spend',
    completionCriteria: 'One reviewed draft and a recorded next decision',
  });
  const endeavorId = current.work.endeavors[0].id;
  await act('select_idea', {
    ideaId,
    intendedDeliverables: ['Duplicate must not be created'],
    effortBudget: 'Two hours',
    completionCriteria: 'No duplicate',
  });
  assert.equal(current.work.endeavors.length, 1);
  await act('transition_work', { endeavorId, status: 'ready' });
  await act('transition_work', { endeavorId, status: 'in_progress' });
  await act('save_artifact', {
    endeavorId,
    kind: 'outreach',
    title: 'Creator pitch',
    content: 'A fictional integration-test draft.',
  });
  const artifactId = current.work.endeavors[0].artifacts[0].id;
  await act('review_artifact', { endeavorId, artifactId });
  await act('generate_artifact', {
    endeavorId,
    kind: 'product_brief',
    title: 'First-value improvement brief',
    instruction: 'Prepare a fictional demo brief.',
  });
  assert.equal(current.work.endeavors[0].artifacts.length, 2);
  await act('add_research_candidate', {
    endeavorId,
    name: 'Example candidate',
    url: 'https://example.org/',
    observedFacts: ['Example Domain is a test fixture.'],
    fitRationale: 'Useful only for integration verification.',
    uncertainties: ['All real fit is unknown.'],
  });
  await act('add_observation', {
    endeavorId,
    summary: 'The draft was reviewed as an integration fixture.',
    source: 'Integration test',
    evidenceUrls: ['https://example.com/'],
    actualEffort: 'Five minutes',
    nextDecision: 'Do not send fictional outreach.',
  });
  await act('research_work', {
    endeavorId,
    query: 'Find one fictional demo candidate.',
  });
  assert.equal(current.work.endeavors[0].research.length, 2);
  await act('transition_work', { endeavorId, status: 'completed' });
  await act('set_portfolio', {
    priority: 'now',
    ownerHours: 2,
    note: 'Integration-test priority.',
  });
  assert.equal(current.portfolio.priority, 'now');
  await act('create_demo');
  const second = current.id;
  assert.notEqual(first, second);
  const selected = await get(first);
  assert.equal(selected.business.name, 'Integration test business');
  assert.equal(selected.businesses.length, 2);
  current = selected.business;
  revision = selected.revision;
  const foreign = await get(first, other);
  assert.equal(foreign.business, null);
  assert.equal(foreign.businesses.length, 0);
  await act(
    'update_profile',
    { name: 'Attempted overwrite', goal: 'x', budget: 'y', notes: '' },
    404,
    other,
  );
  await act(
    'update_profile',
    { name: 'Old revision', goal: 'x', budget: 'y', notes: '', revision: -1 },
    409,
  );
  for (const fact of current.facts)
    await act('update_fact', {
      factId: fact.id,
      value: fact.value,
      source: fact.source,
      confidence: 'medium',
      status: 'confirmed',
    });
  await act('add_signal', {
    metric: 'Sessions',
    value: 120,
    period: '2026-09-01 to 2026-09-08',
    source: 'Integration test fixture',
    note: '',
    confidence: 'medium',
  });
  const count = current.signals.length;
  for (const value of ['', null, -1])
    await act(
      'add_signal',
      {
        metric: 'Qualified leads',
        value,
        period: 'September',
        confidence: 'medium',
      },
      400,
    );
  await act(
    'add_signal',
    {
      metric: 'Qualified leads',
      value: 1,
      period: 'September',
      confidence: 'certain',
    },
    400,
  );
  await act(
    'import_csv',
    { csv: 'metric,value,period\nLeads,unknown,Sep', fileName: 'invalid.csv' },
    400,
  );
  assert.equal((await get(first)).business.signals.length, count);
  await act('import_csv', {
    csv: 'metric,value,period,note\nQualified leads,3,2026-09-01 to 2026-09-08,"A, B"',
    fileName: 'test.csv',
  });
  await act('diagnose');
  assert.ok(current.diagnosis.evidence.length);
  await act('create_round', { name: 'First measured test' });
  assert.ok(current.rounds[0].experiments.length >= 2);
  const round = current.rounds[0];
  await act('create_round', { name: 'Duplicate open round' }, 400);
  for (const exp of round.experiments.slice(0, 2))
    await act('start_experiment', { experimentId: exp.id });
  await act('start_experiment', { experimentId: round.experiments[2].id }, 400);
  await act('close_round', { roundId: round.id }, 400);
  await act(
    'record_result',
    { experimentId: round.experiments[0].id, result: '', evidence: 'Unknown' },
    400,
  );
  await act(
    'record_result',
    {
      experimentId: round.experiments[0].id,
      result: null,
      evidence: 'Unknown',
    },
    400,
  );
  for (const exp of round.experiments.slice(0, 2))
    await act('record_result', {
      experimentId: exp.id,
      result: 1,
      evidence: 'Integration fixture: one measured result.',
      learning: 'Test audience was too broad.',
    });
  await act('close_round', { roundId: round.id });
  assert.equal(current.rounds[0].status, 'complete');
  await act('start_experiment', { experimentId: round.experiments[2].id }, 400);
  await act('generate_review');
  assert.equal(current.reviews.length, 1);
  await act('update_profile', {
    name: current.name,
    goal: 'Repeat and improve',
    budget: 'Five hours',
    notes: 'Previous tests below target.',
  });
  await act('create_round', { name: 'Follow-up test' });
  assert.equal(current.rounds.length, 2);
  assert.equal(current.rounds[0].experiments[0].result, 1);
  assert.equal(
    current.rounds[0].experiments[0].learning,
    'Test audience was too broad.',
  );
  assert.equal(
    current.rounds[0].briefSnapshot.goal,
    'Five qualified calls in 30 days',
  );
  assert.match(
    current.rounds[1].experiments[0].action,
    /Test audience was too broad/,
  );
  await act('add_prospect', {
    name: 'Test recipient',
    email: 'recipient@example.com',
    company: 'Example',
    reason: 'Owner-entered testing example.',
    source: 'Fictional test fixture',
  });
  const prospectId = current.outreach.prospects[0].id;
  await act('draft_outreach', { prospectId });
  const draft = current.outreach.drafts[0];
  await act('approve_outreach', {
    prospectId,
    subject: draft.subject,
    body: draft.body,
  });
  await act('send_approved', { prospectId, gmailToken: '' }, 400);
  await act('draft_outreach', { prospectId }, 400);
  await act(
    'approve_outreach',
    { prospectId, subject: 'Changed', body: 'Changed' },
    400,
  );
  assert.equal(
    (await get(first)).business.outreach.prospects[0].status,
    'approved',
  );
  await act('create_business', {
    name: 'Manual live test',
    url: 'https://example.com',
    key: '',
  });
  assert.equal(current.mode, 'live');
  await act('add_fact', {
    label: 'Offer',
    value: 'Test service',
    source: 'Owner input',
    confidence: 'high',
  });
  await act('update_profile', {
    name: 'Manual live test',
    goal: 'Three customer interviews',
    budget: 'Two hours',
    notes: 'Test data',
  });
  await act('create_round', { name: 'No key', key: '' }, 400);
  assert.equal((await get(current.id)).business.rounds.length, 0);
  const badOrigin = await fetch(`${base}/api/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unrelated.example',
      'x-traction-dev-user-id': owner,
    },
    body: JSON.stringify({ op: 'create_demo' }),
  });
  assert.equal(badOrigin.status, 403);
  console.log(
    'PASS API: separate businesses/users, stale-write rejection, atomic CSV import, rounds/history, weekly review, approved demo cannot send.',
  );
} finally {
  const result = spawnSync(
    'turso',
    ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'],
    { encoding: 'utf8' },
  );
  if (result.status === 0) {
    const db = createClient({
      url: 'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',
      authToken: result.stdout.trim(),
    });
    for (const id of [owner, other])
      await db.batch(
        [
          { sql: 'DELETE FROM business_documents WHERE user_id=?', args: [id] },
          { sql: 'DELETE FROM users WHERE id=?', args: [id] },
        ],
        'write',
      );
    db.close();
  }
}
