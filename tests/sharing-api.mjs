// End-to-end check against a local dev server (npm run dev:local): a partner
// sees only the one shared business, cannot change it, and loses access on removal.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
const names = { owner: `own_${suffix}`, partner: `par_${suffix}`, outsider: `out_${suffix}` };
async function account(username) {
  const r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username, pin: '843217' }),
  });
  assert.equal(r.status, 200, await r.text());
  return r.headers.get('set-cookie').split(';')[0];
}
const get = async (cookie, id) =>
  (
    await fetch(`${base}/api/workspace${id ? `?businessId=${encodeURIComponent(id)}` : ''}`, {
      headers: { Cookie: cookie },
    })
  ).json();
const post = async (cookie, body, expected = 200) => {
  const r = await fetch(`${base}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, expected, JSON.stringify(d));
  return d;
};
const [owner, partner, outsider] = await Promise.all(
  [names.owner, names.partner, names.outsider].map(account),
);
const create = (name) => post(owner, { op: 'create_business', name, url: 'https://example.com' });
const shared = await create('Shared venture');
const secret = await create('Private venture');

let state = await post(owner, {
  op: 'share_business',
  businessId: shared.business.id,
  revision: shared.revision,
  username: names.partner.toUpperCase(),
});
assert.deepEqual(state.members.map((m) => m.username), [names.partner]);
await post(
  owner,
  { op: 'share_business', businessId: shared.business.id, revision: state.revision, username: 'nobody_here' },
  400,
);

const view = await get(partner);
assert.equal(view.access.role, 'viewer');
assert.equal(view.access.sharedBy, names.owner);
assert.equal(view.business.name, 'Shared venture');
assert.deepEqual(view.businesses.map((b) => b.name), ['Shared venture']);
assert.equal(view.members, undefined);

// The partner cannot write, cannot reach the owner's other business, and cannot re-share.
for (const op of ['update_profile', 'share_business', 'create_idea'])
  await post(partner, { op, businessId: view.business.id, revision: view.revision, name: 'x', username: names.outsider }, 403);
const forged = view.business.id.replace(shared.business.id, secret.business.id);
assert.equal((await get(partner, forged)).business, null);
assert.equal((await get(outsider, view.business.id)).business, null);
assert.deepEqual((await get(outsider)).businesses, []);

state = await post(owner, {
  op: 'unshare_business',
  businessId: shared.business.id,
  revision: state.revision,
  memberId: state.members[0].memberId,
});
assert.deepEqual(state.members, []);
assert.equal((await get(partner, view.business.id)).business, null);
console.log('PASS sharing: partner sees one business read-only; removal revokes access.');
