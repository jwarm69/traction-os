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
if (t.status !== 0) throw Error('Turso credential unavailable');
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
const fresh = (id, name, url) => ({
  version: 2,
  id,
  name,
  url,
  mode: 'live',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  goal: '',
  budget: '',
  notes: '',
  facts: [],
  signals: [],
  rounds: [],
  reviews: [],
  outreach: { prospects: [], drafts: [] },
  log: [],
});
async function save(b) {
  await c.execute({
    sql: 'INSERT INTO owner_starters(owner_email,business_id,data) VALUES(?,?,?) ON CONFLICT(owner_email,business_id) DO UPDATE SET data=excluded.data',
    args: [email, b.id, JSON.stringify(b)],
  });
}
try {
  const align = fresh(
    'biz_owner_aligniq',
    'AlignIQ Golf',
    'https://aligniqgolf.com',
  );
  const research = await runAI(
    r,
    'owner-setup',
    '',
    'Research https://aligniqgolf.com. Return JSON {name,facts:[{label,value,source,confidence}]}. Find 4-6 verifiable facts about the offer, audience, price if public, and conversion path. Each source must be a supporting HTTPS URL. If unavailable say so; never fabricate facts. Confidence must be low, medium, or high.',
    true,
  );
  if (!Array.isArray(research.facts) || !research.facts.length)
    throw Error('Research returned no facts');
  align.facts = research.facts.map((f) => {
    if (
      typeof f.label !== 'string' ||
      typeof f.value !== 'string' ||
      typeof f.source !== 'string' ||
      !f.source.startsWith('https://')
    )
      throw Error('Invalid research fact');
    return {
      id: uid('fact'),
      label: f.label,
      value: f.value,
      source: f.source,
      observedAt: new Date().toISOString(),
      confidence: ['low', 'medium', 'high'].includes(f.confidence)
        ? f.confidence
        : 'low',
      status: 'unreviewed',
    };
  });
  align.notes =
    'Owner-requested pilot. Confirm research, choose the growth goal and resources, and add real demand/conversion metrics before running experiments.';
  await save(align);
  console.log(
    `Saved AlignIQ Golf: ${align.facts.length} research facts awaiting calibration.`,
  );
  const astro = fresh('biz_owner_astrolog', 'Astro-log', '');
  astro.notes =
    'Owner-requested pilot. Website URL and product details are needed before research; no assumptions about the business have been made.';
  await save(astro);
  const self = fresh(
    'biz_owner_traction',
    'Traction OS',
    'https://traction-lab-jw-mvp.jwarm16.chatgpt.site',
  );
  self.goal =
    'Proposed pilot: five business owners complete one measured growth experiment in 30 days.';
  self.budget =
    'Proposed pilot: founder time only, no advertising spend. Shared app AI has a separate $10 ceiling.';
  self.notes =
    'Treat this product as a business. Validate the audience and willingness to pay before scaling. Do not claim customers, revenue, or results without evidence. Goal and resources are provisional and need owner review.';
  self.facts = [
    [
      'Offer',
      'A GTM workspace that researches businesses, captures owner corrections, proposes experiments, and preserves results.',
    ],
    [
      'Current product',
      'Public beta with private account records, shared AI budget, owner-approved Gmail outreach, and on-demand reviews.',
    ],
    [
      'Unproven assumptions',
      'Paying audience, willingness to pay, acquisition cost, and retention are not established.',
    ],
  ].map(([label, value]) => ({
    id: uid('fact'),
    label,
    value,
    source: 'Implemented product and owner-requested self-pilot',
    observedAt: new Date().toISOString(),
    confidence: 'high',
    status: 'confirmed',
  }));
  const plan = await runAI(
    r,
    'owner-setup',
    '',
    'Return JSON {experiments:[{channel,hypothesis,action,metric,target}]}, exactly 3 low-cost experiments for this product. Prioritize interviewing business owners, founder-led recruitment of 5 design partners, and publishing one measured pilot case study only after real results exist. Targets are positive integers, not forecasts. Every action must identify what the owner does; do not claim actions completed. Context: ' +
      JSON.stringify(self),
  );
  createRound(self, 'Proposed first traction round', plan.experiments);
  await save(self);
  console.log(
    'Saved Astro-log awaiting URL and Traction OS with three proposed experiments.',
  );
  console.log(JSON.stringify(await budgetStatus(r)));
} finally {
  c.close();
}
