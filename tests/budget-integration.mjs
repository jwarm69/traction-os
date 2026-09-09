import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';
import {
  reserveAI,
  settleAI,
  budgetStatus,
  usageMicros,
} from '../lib/ai-budget.ts';
const t = spawnSync(
  'turso',
  ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'],
  { encoding: 'utf8' },
);
assert.equal(t.status, 0, 'Turso credential unavailable');
const r = {
  TURSO_DATABASE_URL: 'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',
  TURSO_AUTH_TOKEN: t.stdout.trim(),
  OPENAI_API_KEY: 'test-marker-not-used',
};
const c = createClient({
    url: r.TURSO_DATABASE_URL,
    authToken: r.TURSO_AUTH_TOKEN,
  }),
  pool = `test-budget-${crypto.randomUUID()}`;
try {
  await c.execute({
    sql: 'INSERT INTO ai_budgets(id,limit_micros) VALUES(?,250000)',
    args: [pool],
  });
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      reserveAI(r, `test-user-${i}`, false, pool),
    ),
  );
  const accepted = results
    .filter((x) => x.status === 'fulfilled')
    .map((x) => x.value);
  assert.equal(accepted.length, 2);
  assert.equal((await budgetStatus(r, pool)).used, 0.25);
  await settleAI(
    r,
    accepted[0],
    { id: 'test', usage: { input_tokens: 1000, output_tokens: 100 } },
    false,
  );
  const first = (await budgetStatus(r, pool)).used;
  await settleAI(
    r,
    accepted[0],
    { id: 'test', usage: { input_tokens: 0, output_tokens: 0 } },
    false,
  );
  assert.equal(
    (await budgetStatus(r, pool)).used,
    first,
    'double settlement cannot refund twice',
  );
  await settleAI(r, accepted[1], null, false);
  assert.equal((await budgetStatus(r, pool)).held, 0.125);
  assert.equal(
    usageMicros({ usage: { input_tokens: -1, output_tokens: 0 } }, false),
    null,
  );
  console.log(
    'PASS budget: concurrent cap, idempotent settlement, uncertain hold, invalid usage. No AI provider called.',
  );
} finally {
  await c.batch(
    [
      { sql: 'DELETE FROM ai_spend WHERE budget_id=?', args: [pool] },
      { sql: 'DELETE FROM ai_budgets WHERE id=?', args: [pool] },
    ],
    'write',
  );
  c.close();
}
