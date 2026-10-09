// End-to-end check against a local dev server started with JOB_SECRET set:
// the tick route rejects a bad secret, generates one memo per business per
// week however often it fires, and never duplicates a memo the owner's open
// already produced. No model is called.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const secret = process.env.JOB_SECRET;
assert.ok(secret, 'Set JOB_SECRET to the value the dev server was started with.');
const owner = `traction-tick-test-${crypto.randomUUID()}`;
const asOwner = { 'x-traction-dev-user-id': owner };
const post = async (path, body, headers = {}, expect = 200) => {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  assert.equal(r.status, expect, `${path} ${body.op || ''}: ${JSON.stringify(d)}`);
  return d;
};

// Static guard: the tick route never imports anything that can spend or send.
const source = readFileSync(new URL('../app/api/jobs/tick/route.ts', import.meta.url), 'utf8');
assert.equal(/lib\/ai'|lib\/ai\.ts|lib\/connections/.test(source), false, 'tick route must not import AI or connections');

await post('/api/jobs/tick', {}, {}, 401);
await post('/api/jobs/tick', {}, { Authorization: 'Bearer wrong-secret-value-00' }, 401);

let saved = await post('/api/workspace', { op: 'create_demo' }, asOwner);
const work = (op, extra) =>
  post('/api/workspace', { op, businessId: saved.business.id, revision: saved.revision, ...extra }, asOwner).then((d) => (saved = d));
await work('create_idea', { title: 'Tick check', kind: 'campaign', description: 'd', audience: 'Test', outcome: 'o', ownerNotes: '', sources: [] });
await work('select_idea', { ideaId: saved.business.explore.ideas[0].id, intendedDeliverables: ['x'], effortBudget: 'e', completionCriteria: 'c' });
// Opening the business after work exists produces this week's memo lazily.
const opened = await (await fetch(`${base}/api/workspace?businessId=${saved.business.id}`, { headers: asOwner })).json();
assert.equal(opened.business.memos.length, 1);
const lazyMemo = opened.business.memos[0];
saved = opened;
// Schedule it as already due so the tick picks it up.
await work('set_memo_schedule', { weekday: new Date().getUTCDay(), hourUtc: new Date().getUTCHours(), enabled: true });
const first = await post('/api/jobs/tick', {}, { Authorization: `Bearer ${secret}` });
const second = await post('/api/jobs/tick', {}, { Authorization: `Bearer ${secret}` });
const after = await (await fetch(`${base}/api/workspace?businessId=${saved.business.id}`, { headers: asOwner })).json();
assert.equal(after.business.memos.length, 1, 'the tick did not duplicate the lazily generated memo');
assert.equal(after.business.memos[0].id, lazyMemo.id);
console.log('tick api test passed', { first, second });
