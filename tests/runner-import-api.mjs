// End-to-end check against a local dev server (npm run dev:local): a completed
// runner job returns to its endeavor as an unreviewed artifact, exactly once.
// No model is called; this script plays the paired device.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const owner = `traction-runner-test-${crypto.randomUUID()}`;
const post = async (path, body, headers = {}) => {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.ok(r.ok, `${body.op}: ${JSON.stringify(d)}`);
  return d;
};
const asOwner = { 'x-traction-dev-user-id': owner };
let saved = await post('/api/workspace', { op: 'create_demo' }, asOwner);
const work = (op, extra) =>
  post(
    '/api/workspace',
    { op, businessId: saved.business.id, revision: saved.revision, ...extra },
    asOwner,
  ).then((d) => (saved = d));
await work('create_idea', {
  title: 'Runner import check',
  kind: 'research',
  description: 'Verify returned runner work lands on the endeavor.',
  audience: 'Test',
  outcome: 'An imported artifact',
  ownerNotes: '',
  sources: [],
});
await work('select_idea', {
  ideaId: saved.business.explore.ideas[0].id,
  intendedDeliverables: ['A returned result'],
  effortBudget: 'None',
  completionCriteria: 'Artifact imported',
});
const endeavorId = saved.business.work.endeavors[0].id;

const { code } = await post('/api/runner', { op: 'pair_code' }, asOwner);
const device = await post('/api/runner', { op: 'pair', code, deviceName: 'Import test' });
const asDevice = { Authorization: `Bearer ${device.token}` };
try {
  await post(
    '/api/runner',
    {
      op: 'queue_job',
      businessId: saved.business.id,
      endeavorId,
      deviceId: device.deviceId,
      revision: saved.revision,
      executionMode: 'codex',
    },
    asOwner,
  );
  const claim = await post('/api/runner', { op: 'claim' }, asDevice);
  const job = claim.job;
  const complete = {
    op: 'complete',
    jobId: job.id,
    leaseToken: claim.leaseToken,
    result: { text: 'Returned shortlist with sources.', sourceJobId: job.id },
  };
  await post('/api/runner', complete, asDevice);
  await post('/api/runner', complete, asDevice); // a retried completion must not import twice

  const r = await fetch(`${base}/api/workspace?businessId=${saved.business.id}`, {
    headers: asOwner,
  });
  const artifacts = (await r.json()).business.work.endeavors[0].artifacts;
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].kind, 'research_notes');
  assert.equal(artifacts[0].reviewedAt, undefined);
  assert.deepEqual(artifacts[0].sourceEvidence, [`runner-job:${job.id}`]);
  assert.equal(artifacts[0].versions[0].content, 'Returned shortlist with sources.');
  console.log('PASS runner import: completed job became one unreviewed artifact.');
} finally {
  await post('/api/runner', { op: 'revoke_device', deviceId: device.deviceId }, asOwner);
}
