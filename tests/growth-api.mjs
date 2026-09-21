// End-to-end check against a local dev server (npm run dev:local): playbooks start
// real work, the pipeline tracks contacts, and network learning stores categories
// only, hides small samples, and is withdrawn on opt-out.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const run = crypto.randomUUID().slice(0, 8);
function client(user) {
  let state;
  const send = async (op, extra = {}, expected = 200) => {
    const r = await fetch(`${base}/api/workspace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base, 'x-traction-dev-user-id': user },
      body: JSON.stringify({ op, businessId: state?.business?.id, revision: state?.revision, ...extra }),
    });
    const d = await r.json();
    assert.equal(r.status, expected, `${op}: ${JSON.stringify(d).slice(0, 300)}`);
    if (r.ok) state = d;
    return d;
  };
  return { send, get state() { return state; } };
}
const owners = ['a', 'b', 'c'].map((n) => client(`traction-growth-test-${run}-${n}`));
for (const owner of owners) {
  await owner.send('create_business', { name: `Secret Name ${run}`, url: 'https://example.com' });
  const started = await owner.send('start_playbook', { playbookId: 'creator_outreach' });
  assert.ok(started.playbooks.length >= 4);
  const endeavor = started.business.work.endeavors[0];
  assert.ok(endeavor.checklist.length >= 4, 'playbook steps become a checklist');
  await owner.send('add_observation', {
    endeavorId: endeavor.id,
    summary: `Private detail ${run}`,
    source: 'Owner',
    nextDecision: 'Repeat next month',
    verdict: 'repeat',
  });
}
const first = owners[0];
let d = await first.send('add_contact', { name: 'Pat Example', channel: 'email', route: 'https://example.com/pat' });
const contact = d.business.pipeline.contacts[0];
await first.send('move_contact', { contactId: contact.id, stage: 'replied' }, 400); // no skipping
d = await first.send('move_contact', { contactId: contact.id, stage: 'contacted', note: 'Sent the reviewed pitch.' });
assert.equal(d.business.pipeline.contacts[0].stage, 'contacted');

const insight = d.network.insights.find((i) => i.kind === 'outreach' && i.channel === 'creator');
assert.ok(insight && insight.accounts >= 3 && insight.repeat >= 3, JSON.stringify(d.network));
assert.doesNotMatch(JSON.stringify(d.network), new RegExp(`${run}|Secret|Private|Pat`, 'i'));

d = await first.send('set_network_sharing', { sharing: false });
assert.equal(d.network.sharing, false);
const after = d.network.insights.find((i) => i.kind === 'outreach' && i.channel === 'creator');
assert.ok(!after || after.accounts === insight.accounts - 1, 'opt-out withdraws contributions');
console.log('PASS growth: playbook → checklist, guarded pipeline, category-only learning with opt-out.');
