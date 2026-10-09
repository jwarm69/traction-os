import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sqliteClient } from './helpers/sqlite-client.mjs';
import * as store from '../lib/memo-store.ts';

async function fixture(t) {
  const client = sqliteClient();
  t.after(() => client.dispose());
  await client.executeMultiple("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('alice'),('bob');");
  await client.executeMultiple(readFileSync(new URL('../migrations/013_memo_schedules.sql', import.meta.url), 'utf8'));
  return { client, runtime: store.withMemoClient({}, client) };
}

await test('next slot lands on the requested weekday and hour, strictly in the future', () => {
  const friday = new Date('2026-10-09T12:00:00Z');
  assert.equal(store.nextSlot(1, 7, friday), '2026-10-12T07:00:00.000Z');
  assert.equal(store.nextSlot(5, 12, friday), '2026-10-16T12:00:00.000Z', 'same weekday and hour rolls a week');
  assert.equal(store.nextSlot(5, 13, friday), '2026-10-09T13:00:00.000Z');
  assert.throws(() => store.validateSchedule({ weekday: 7, hourUtc: 7 }), /weekday/);
  assert.throws(() => store.validateSchedule({ weekday: 1, hourUtc: 24 }), /hour/);
  assert.deepEqual(store.validateSchedule({ weekday: '1', hourUtc: '7' }), { weekday: 1, hourUtc: 7, enabled: true });
});

await test('schedules upsert, list when due, lease exclusively, and advance from the slot', async (t) => {
  const { runtime } = await fixture(t);
  const friday = new Date('2026-10-09T12:00:00Z');
  const saved = await store.upsertSchedule(runtime, 'alice', 'biz_1', { weekday: 1, hourUtc: 7, enabled: true }, friday);
  assert.equal(saved.nextDueAt, '2026-10-12T07:00:00.000Z');
  await store.upsertSchedule(runtime, 'bob', 'biz_2', { weekday: 1, hourUtc: 7, enabled: false }, friday);
  assert.deepEqual(await store.listDue(runtime, friday), []);
  const monday = new Date('2026-10-12T07:05:00Z');
  const due = await store.listDue(runtime, monday);
  assert.deepEqual(due.map((s) => s.businessId), ['biz_1'], 'disabled schedules never list');
  assert.equal(await store.claimDue(runtime, 'alice', 'biz_1', 120_000, monday), true);
  assert.equal(await store.claimDue(runtime, 'alice', 'biz_1', 120_000, monday), false, 'second claim loses');
  assert.deepEqual(await store.listDue(runtime, monday), [], 'leased rows are hidden');
  const late = new Date('2026-10-12T07:10:00Z');
  assert.equal(await store.claimDue(runtime, 'alice', 'biz_1', 120_000, late), true, 'an expired lease can be reclaimed');
  const runAt = new Date('2026-10-14T03:00:00Z');
  const next = await store.markGenerated(runtime, 'alice', 'biz_1', '2026-W42', runAt);
  assert.equal(next, '2026-10-19T07:00:00.000Z', 'advances from the Monday slot, not the Wednesday run');
  const after = await store.getSchedule(runtime, 'alice', 'biz_1');
  assert.equal(after.lastGeneratedWeek, '2026-W42');
  assert.equal(after.leaseUntil, null);
  await store.claimDue(runtime, 'alice', 'biz_1', 120_000, new Date('2026-10-19T08:00:00Z'));
  await store.releaseLease(runtime, 'alice', 'biz_1');
  assert.equal((await store.getSchedule(runtime, 'alice', 'biz_1')).leaseUntil, null);
  assert.equal(await store.getSchedule(runtime, 'alice', 'biz_missing'), null);
});
