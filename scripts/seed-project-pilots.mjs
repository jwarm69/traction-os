import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createClient } from '@libsql/client/web';
import { runAI } from '../lib/ai.ts';
import { budgetStatus } from '../lib/ai-budget.ts';
import { uid, createRound } from '../lib/engine.ts';
const lines = createInterface({ input: process.stdin, terminal: false });
const key = await new Promise((resolve) => lines.once('line', resolve));
lines.close();
const t = spawnSync(
  'turso',
  ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'],
  { encoding: 'utf8' },
);
if (t.status !== 0) throw Error('Turso unavailable');
const r = {
  TURSO_DATABASE_URL: 'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',
  TURSO_AUTH_TOKEN: t.stdout.trim(),
  OPENAI_API_KEY: key,
};
const c = createClient({
    url: r.TURSO_DATABASE_URL,
    authToken: r.TURSO_AUTH_TOKEN,
  }),
  email = 'jj.warman16@gmail.com';
const specs = [
  {
    id: 'biz_owner_astrolog',
    name: 'Astro-Log',
    url: 'https://astro-log.org',
    source: 'Astro-Log project README, reviewed September 9, 2026',
    facts: [
      [
        'Offer',
        'Natal-aware daily astrology briefs. The free tier shares a brief per Sun sign; Natal and Premium readers get individually computed briefs.',
      ],
      [
        'Retention surface',
        'Morning email delivery is the core experience; daily briefs and weekly/monthly Premium reports are described in the project.',
      ],
      [
        'Monetization',
        'Subscriptions and gifts use Stripe. Confirm that the live paid checkout and delivery pipeline are ready before sending paid traffic.',
      ],
      [
        'Positioning constraint',
        'Astrology content is for entertainment and reflection. Avoid promises of scientific prediction or guaranteed personal outcomes.',
      ],
    ],
    goal: 'Proposed: 10 readers return for three daily briefs within 14 days.',
    notes:
      'Public URL verified from the existing Astro-Log repository. Product findings are documented, not owner-calibrated. Revenue, signup counts, current prices, and email delivery success are unknown.',
  },
  {
    id: 'biz_owner_tonight',
    name: 'Tonight',
    url: 'https://tonight-ashen.vercel.app',
    source:
      'Tonight project README and deployment task, reviewed September 9, 2026',
    facts: [
      [
        'Offer',
        'Dinner discovery and decision app for the Boca Raton–Jupiter corridor.',
      ],
      [
        'Current flow',
        'People filter by location and cuisine, save restaurants, shortlist contenders, and create shared dinner links where participants can like places.',
      ],
      [
        'Conversion handoff',
        'The product links to restaurant websites, menus, and directions. It does not submit food orders or payments.',
      ],
      [
        'Product boundary',
        'Enhanced final shared decisions and fresh-round improvements were reported as local review work, not yet confirmed in production. Do not market them as live.',
      ],
      [
        'Data quality',
        'Directory records are sourced, but current hours, prices, independent ownership, and openings must not be assumed when unknown.',
      ],
    ],
    goal: 'Proposed: 10 local pairs use a shared dinner shortlist in 14 days.',
    notes:
      'Focus the first pilot on the Boca Raton–Jupiter corridor. Validate actual dinner decisions and repeat use before restaurant monetization. No restaurant partnership or paid promotion is assumed.',
  },
];
try {
  for (const spec of specs) {
    const now = new Date().toISOString();
    const b = {
      version: 2,
      id: spec.id,
      name: spec.name,
      url: spec.url,
      mode: 'live',
      createdAt: now,
      updatedAt: now,
      goal: spec.goal,
      budget:
        'Proposed: founder-led testing, up to two hours per week, no ad spend.',
      notes: spec.notes + ' Goal and budget are provisional for owner review.',
      facts: [
        {
          id: uid('fact'),
          label: 'Pilot business',
          value: spec.name,
          source: 'Owner request in this task',
          observedAt: now,
          confidence: 'high',
          status: 'confirmed',
        },
        ...spec.facts.map(([label, value]) => ({
          id: uid('fact'),
          label,
          value,
          source: spec.source,
          observedAt: now,
          confidence: 'medium',
          status: 'unreviewed',
        })),
      ],
      signals: [],
      rounds: [],
      reviews: [],
      outreach: { prospects: [], drafts: [] },
      log: [],
    };
    const a = await runAI(
      r,
      'owner-setup',
      '',
      'Return JSON {experiments:[{channel,hypothesis,action,metric,target}]}, exactly 3 distinct GTM experiments with positive integer targets for this business. Treat documented but unreviewed facts as provisional; first actions must include owner calibration. Respect resources and product boundaries. Each action names what can be drafted and what requires the owner. No messages, partnerships, revenue, users or completed work may be claimed. Context: ' +
        JSON.stringify(b),
    );
    createRound(
      b,
      'Proposed first pilot — review before starting',
      a.experiments,
    );
    await c.execute({
      sql: 'INSERT INTO owner_starters(owner_email,business_id,data) VALUES(?,?,?) ON CONFLICT(owner_email,business_id) DO UPDATE SET data=excluded.data',
      args: [email, b.id, JSON.stringify(b)],
    });
    console.log(
      `Saved ${b.name}: ${b.facts.length} facts and ${b.rounds[0].experiments.length} proposed channels.`,
    );
  }
  const row = (
    await c.execute({
      sql: 'SELECT data FROM owner_starters WHERE owner_email=? AND business_id=?',
      args: [email, 'biz_owner_aligniq'],
    })
  ).rows[0];
  if (row) {
    const b = JSON.parse(row.data);
    if (!b.rounds.length) {
      b.facts.push({
        id: uid('fact'),
        label: 'Pilot website',
        value: 'https://aligniqgolf.com',
        source: 'Owner request',
        observedAt: new Date().toISOString(),
        confidence: 'high',
        status: 'confirmed',
      });
      b.goal =
        'Proposed: five golfers complete a first logged round within 14 days.';
      b.budget = 'Proposed: founder-led beta recruitment, no ad spend.';
      b.notes += ' Goal and resources are provisional.';
      const a = await runAI(
        r,
        'owner-setup',
        '',
        'Return JSON {experiments:[{channel,hypothesis,action,metric,target}]}, exactly 3 GTM experiments with positive integer targets. Use the sourced findings provisionally and require owner calibration before executing. Respect private-beta availability, confirm coach capabilities before promising them, and avoid invented performance claims. Focus on first-round activation and repeat practice/logging. Context: ' +
          JSON.stringify(b),
      );
      createRound(
        b,
        'Proposed first golf pilot — review before starting',
        a.experiments,
      );
      await c.execute({
        sql: 'UPDATE owner_starters SET data=? WHERE owner_email=? AND business_id=?',
        args: [JSON.stringify(b), email, b.id],
      });
      console.log('Saved AlignIQ Golf: three proposed experiments.');
    }
  }
  console.log(JSON.stringify(await budgetStatus(r)));
} finally {
  c.close();
}
