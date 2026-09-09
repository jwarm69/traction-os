import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';
import {
  importOwnerStarters,
  listBusinesses,
  loadBusiness,
} from '../lib/turso.ts';
const t = spawnSync(
  'turso',
  ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'],
  { encoding: 'utf8' },
);
assert.equal(t.status, 0);
const r = {
  TURSO_DATABASE_URL: 'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',
  TURSO_AUTH_TOKEN: t.stdout.trim(),
};
const c = createClient({
  url: r.TURSO_DATABASE_URL,
  authToken: r.TURSO_AUTH_TOKEN,
});
const owner = {
    id: `starter-test-${crypto.randomUUID()}`,
    email: 'jj.warman16@gmail.com',
    name: 'Temporary import test',
  },
  other = {
    id: `starter-test-${crypto.randomUUID()}`,
    email: 'unrelated@example.com',
    name: 'Other test',
  };
try {
  await importOwnerStarters(r, owner);
  await importOwnerStarters(r, owner);
  await importOwnerStarters(r, other);
  const list = await listBusinesses(r, owner.id);
  assert.equal(list.length, 4);
  assert.equal((await listBusinesses(r, other.id)).length, 0);
  for (const item of list) {
    const b = JSON.parse((await loadBusiness(r, owner.id, item.id)).data);
    assert.ok(new URL(b.url));
    assert.equal(b.rounds[0].experiments.length, 3);
    assert.ok(b.facts.length >= 3);
  }
  assert.equal(await loadBusiness(r, other.id, list[0].id), null);
  console.log(
    'PASS private starters: four pilots, valid websites, three channels each, idempotent import, other account isolation.',
  );
} finally {
  for (const u of [owner, other])
    await c.batch(
      [
        { sql: 'DELETE FROM business_documents WHERE user_id=?', args: [u.id] },
        { sql: 'DELETE FROM users WHERE id=?', args: [u.id] },
      ],
      'write',
    );
  c.close();
}
