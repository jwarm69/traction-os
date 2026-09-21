import assert from 'node:assert/strict';
import test from 'node:test';
import { grantDomain, parseGrant } from '../lib/runner-grant.ts';

await test('plan grant accepts named domains and a bounded step budget', () => {
  assert.equal(parseGrant(undefined), undefined);
  assert.deepEqual(
    parseGrant({ domains: ['Example.com', 'https://www.example.com/submit', 'b.io'] }),
    { domains: ['example.com', 'b.io'], steps: 40 },
  );
  assert.deepEqual(parseGrant({ domains: ['a.dev'], steps: 12 }), { domains: ['a.dev'], steps: 12 });
  assert.equal(grantDomain(' www.Site.co '), 'site.co');
});

await test('plan grant rejects wildcards, insecure URLs, and out-of-range budgets', () => {
  for (const bad of [
    'yes',
    {},
    { domains: [] },
    { domains: ['*'] },
    { domains: ['com'] },
    { domains: ['http://example.com'] },
    { domains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'] },
    { domains: ['a.com'], steps: 41 },
    { domains: ['a.com'], steps: 7 },
    { domains: ['a.com'], steps: 9.5 },
    { domains: [42] },
  ])
    assert.throws(() => parseGrant(bad), JSON.stringify(bad));
});
