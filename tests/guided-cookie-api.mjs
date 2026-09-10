import assert from 'node:assert/strict';

const base = process.env.TRACTION_TEST_BASE || 'http://localhost:3091';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const usernames = [`relA_${suffix}`, `relB_${suffix}`];
async function account(username) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username, pin: '843217' }),
  });
  assert.equal(response.status, 200, await response.text());
  return response.headers.get('set-cookie').split(';')[0];
}
const [cookieA, cookieB] = await Promise.all(usernames.map(account));
let business;
let revision = 0;
async function post(cookie, op, extra = {}, expected = 200) {
  const response = await fetch(`${base}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify({ op, businessId: business?.id, revision, ...extra }),
  });
  const json = await response.json();
  assert.equal(response.status, expected, JSON.stringify(json));
  if (response.ok && json.business) {
    business = json.business;
    revision = json.revision;
  }
  return json;
}

await post(cookieA, 'create_demo');
const id = business.id;
const fields = {
  offer: 'A review service',
  audience: 'Independent coaches',
  readiness: 'The review workflow is usable today',
  objective: 'Observe first value in 14 days',
  resources: 'Two owner hours and $0 external spend',
};
await post(cookieA, 'confirm_guided_brief', {
  fields,
  confirmations: Object.fromEntries(Object.keys(fields).map((key) => [key, true])),
  ownerNotes: 'Exact test owner note.',
});
assert.equal(business.guided.briefVersions.length, 1);
await post(cookieA, 'agree_guided_decision', {
  hypothesis: 'Activation is unknown.',
  nextObservation: 'Whether an eligible coach reaches first value.',
  alternatives: ['Acquisition may be limiting demand.'],
});
await post(cookieA, 'propose_guided_experiment');
assert.equal(business.guided.proposal.status, 'proposed');
assert.equal(business.guided.proposal.briefVersionId, business.guided.activeBriefVersionId);
assert.match(business.guided.proposal.stoppingRule, /Stop/i);
assert.equal(business.outreach.prospects.length, 0);
await post(cookieA, 'accept_guided_experiment');
assert.equal(business.guided.proposal.status, 'accepted');
assert.equal(business.rounds.length, 0);

const foreign = await fetch(`${base}/api/workspace?businessId=${encodeURIComponent(id)}`, { headers: { Cookie: cookieB } });
const foreignJson = await foreign.json();
assert.equal(foreign.status, 200);
assert.equal(foreignJson.business, null);
const staleRevision = revision - 1;
await post(cookieA, 'save_guided_draft', { revision: staleRevision, fields, confirmations: {}, ownerNotes: '' }, 409);

console.log(`PASS cookie-auth Release A API: guided resume state, one proposal, no execution, stale-write rejection, account isolation. Cleanup accounts: ${usernames.join(', ')}`);
