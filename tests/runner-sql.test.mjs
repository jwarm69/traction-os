import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sqliteClient } from './helpers/sqlite-client.mjs';
import * as store from '../lib/runner-store.ts';

async function fixture(t) {
  const client = sqliteClient();
  t.after(() => client.dispose());
  await client.executeMultiple('CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'alice\'),(\'bob\');');
  await client.executeMultiple(readFileSync(new URL('../migrations/007_runner.sql', import.meta.url), 'utf8'));
  return { client, runtime: store.withRunnerClient({ RUNNER_ENABLED: 'true' }, client) };
}
async function paired(runtime, owner = 'alice') {
  const code = await store.createPairCode(runtime, owner);
  return store.redeemPairCode(runtime, code.code, `${owner} laptop`);
}
async function queued(runtime, device, overrides = {}) {
  return store.queueJob(runtime, device.ownerId, { businessId: 'biz', endeavorId: 'endeavor', deviceId: device.deviceId, revision: 1, brief: 'Draft a plan. Do not publish.', ...overrides });
}

test('pairing is one-time, expiring, hashed, owner-bound, and revocable', async (t) => {
  const { runtime, client } = await fixture(t);
  const code = await store.createPairCode(runtime, 'alice');
  const device = await store.redeemPairCode(runtime, code.code, 'Laptop');
  await assert.rejects(store.redeemPairCode(runtime, code.code, 'Second laptop'), /invalid|expired|used/i);
  assert.deepEqual(await store.authenticateDevice(runtime, device.token), { deviceId: device.deviceId, ownerId: 'alice' });
  assert.equal(await store.authenticateDevice(runtime, 'invalid-token'), null);
  const persisted = await client.execute('SELECT token_hash FROM runner_devices');
  assert.notEqual(persisted.rows[0].token_hash, device.token);
  assert.equal((await store.listRunner(runtime, 'bob')).devices.length, 0);
  assert.equal(await store.revokeDevice(runtime, 'bob', device.deviceId), false);
  assert.equal(await store.revokeDevice(runtime, 'alice', device.deviceId), true);
  assert.equal(await store.authenticateDevice(runtime, device.token), null);
  const expired = await store.createPairCode(runtime, 'alice', -1);
  await assert.rejects(store.redeemPairCode(runtime, expired.code, 'Late laptop'), /invalid|expired/i);
});

test('a job can only be claimed and settled by its assigned live device and lease', async (t) => {
  const { runtime } = await fixture(t);
  const a = await paired(runtime), b = await paired(runtime, 'bob');
  await queued(runtime, a);
  assert.equal(await store.claimJob(runtime, b.deviceId, b.ownerId), null);
  const claim = await store.claimJob(runtime, a.deviceId, a.ownerId);
  assert.ok(claim?.job.id);
  assert.equal(await store.claimJob(runtime, a.deviceId, a.ownerId), null);
  assert.equal(await store.finishJob(runtime, 'bob', b.deviceId, claim.job.id, claim.leaseToken, 'stolen'), false);
  assert.equal(await store.finishJob(runtime, 'alice', a.deviceId, claim.job.id, 'wrong-token', 'stolen'), false);
  assert.equal(await store.finishJob(runtime, 'alice', a.deviceId, claim.job.id, claim.leaseToken, 'A draft'), true);
  assert.equal(await store.finishJob(runtime, 'alice', a.deviceId, claim.job.id, claim.leaseToken, 'Replacement'), true);
  assert.equal(await store.finishJob(runtime, 'alice', a.deviceId, claim.job.id, 'wrong-token', 'Replacement'), false);
  const job = (await store.listRunner(runtime, 'alice')).jobs[0];
  assert.equal(job.result, 'A draft');
  assert.equal(job.status, 'completed');
});

test('failed device creation rolls back pairing consumption', async (t) => {
  const { runtime, client } = await fixture(t);
  const code = await store.createPairCode(runtime, 'alice');
  await client.executeMultiple("CREATE TRIGGER reject_test_device BEFORE INSERT ON runner_devices BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(store.redeemPairCode(runtime, code.code, 'Laptop'), /test failure/);
  await client.executeMultiple('DROP TRIGGER reject_test_device;');
  assert.ok((await store.redeemPairCode(runtime, code.code, 'Laptop')).deviceId);
});

test('duplicate active endeavor work is not queued twice', async (t) => {
  const { runtime } = await fixture(t);
  const a = await paired(runtime);
  await queued(runtime, a);
  await assert.rejects(queued(runtime, a), /active|already|queued|duplicate/i);
  assert.equal((await store.listRunner(runtime, a.ownerId)).jobs.length, 1);
});

test('expired jobs never replay and cancellation rejects late results', async (t) => {
  const { runtime, client } = await fixture(t);
  const a = await paired(runtime);
  await queued(runtime, a);
  const claim = await store.claimJob(runtime, a.deviceId, a.ownerId);
  await client.execute({ sql: 'UPDATE runner_jobs SET lease_expires_at=? WHERE id=?', args: ['2000-01-01T00:00:00.000Z', claim.job.id] });
  assert.equal(await store.claimJob(runtime, a.deviceId, a.ownerId), null);
  assert.equal((await store.listRunner(runtime, a.ownerId)).jobs[0].status, 'failed');
  assert.equal(await store.finishJob(runtime, a.ownerId, a.deviceId, claim.job.id, claim.leaseToken, 'Late output'), false);
  await queued(runtime, a);
  const next = await store.claimJob(runtime, a.deviceId, a.ownerId);
  assert.equal(await store.cancelJob(runtime, 'bob', next.job.id), false);
  assert.equal(await store.cancelJob(runtime, a.ownerId, next.job.id), true);
  assert.equal(await store.finishJob(runtime, a.ownerId, a.deviceId, next.job.id, next.leaseToken, 'Canceled output'), false);
});

test('approval decisions are owner-only, immutable, scoped to a job, and expire with the lease', async (t) => {
  const { runtime, client } = await fixture(t);
  const a = await paired(runtime), b = await paired(runtime, 'bob');
  await queued(runtime, a);
  await queued(runtime, b);
  const first = await store.claimJob(runtime, a.deviceId, a.ownerId);
  const second = await store.claimJob(runtime, b.deviceId, b.ownerId);
  const event = { requestId: 'rpc_1', method: 'item/commandExecution/requestApproval', details: { command: 'echo hello' }, decision: 'approved' };
  assert.equal(await store.recordEvent(runtime, a.ownerId, a.deviceId, first.job.id, first.leaseToken, event), true);
  let decisions = (await store.heartbeat(runtime, a.ownerId, a.deviceId, first.job.id, first.leaseToken)).decisions;
  assert.equal(decisions[0].decision, null, 'a runner cannot grant itself permission');
  assert.equal(await store.decideApproval(runtime, 'bob', first.job.id, 'rpc_1', 'approved'), false);
  assert.equal(await store.decideApproval(runtime, 'alice', first.job.id, 'rpc_1', 'approved'), true);
  assert.equal(await store.decideApproval(runtime, 'alice', first.job.id, 'rpc_1', 'denied'), false);
  await store.recordEvent(runtime, a.ownerId, a.deviceId, first.job.id, first.leaseToken, { ...event, details: { command: 'different command' }, decision: 'denied' });
  decisions = (await store.heartbeat(runtime, a.ownerId, a.deviceId, first.job.id, first.leaseToken)).decisions;
  assert.deepEqual(decisions[0].details, event.details);
  assert.equal(decisions[0].decision, 'approved');
  assert.equal(await store.recordEvent(runtime, b.ownerId, b.deviceId, second.job.id, second.leaseToken, event), true);
  const other = (await store.heartbeat(runtime, b.ownerId, b.deviceId, second.job.id, second.leaseToken)).decisions;
  assert.equal(other.length, 1, 'JSON-RPC ids may repeat across jobs');
  assert.equal(other[0].decision, null);
  await client.execute({ sql: 'UPDATE runner_jobs SET lease_expires_at=? WHERE id=?', args: ['2000-01-01T00:00:00.000Z', second.job.id] });
  assert.equal(await store.decideApproval(runtime, 'bob', second.job.id, 'rpc_1', 'approved'), false);
});

test('revocation stops claims, events, heartbeats, and result settlement', async (t) => {
  const { runtime } = await fixture(t);
  const a = await paired(runtime);
  await queued(runtime, a);
  const claim = await store.claimJob(runtime, a.deviceId, a.ownerId);
  await store.revokeDevice(runtime, a.ownerId, a.deviceId);
  assert.equal(await store.claimJob(runtime, a.deviceId, a.ownerId), null);
  assert.equal(await store.recordEvent(runtime, a.ownerId, a.deviceId, claim.job.id, claim.leaseToken, { requestId: 'late', method: 'item/commandExecution/requestApproval', details: {}, decision: null }), false);
  assert.equal(await store.finishJob(runtime, a.ownerId, a.deviceId, claim.job.id, claim.leaseToken, 'late'), false);
  const beat = await store.heartbeat(runtime, a.ownerId, a.deviceId, claim.job.id, claim.leaseToken);
  assert.ok(beat === null || beat.cancel === true);
});
