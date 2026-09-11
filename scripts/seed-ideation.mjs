import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';
import { addLog } from '../lib/engine.ts';
import { addExploreMessage } from '../lib/explore.ts';

const ownerEmail = 'jj.warman16@gmail.com';
const marker = 'Initial Explore ideation pass — September 11, 2026';
const text = (value) => typeof value === 'string' ? value : '';
const runs = {
  'AlignIQ Golf': [
    { title: 'Coach-led first-round cohort', kind: 'campaign', description: 'Recruit a very small owner-approved cohort through golf coaches, then observe whether eligible golfers complete a first logged round and return to review it.', audience: 'Coaches and golfers already seeking structured improvement', outcome: 'A measured first-value cohort with recorded friction' },
    { title: 'One-shot reflection content series', kind: 'content', description: 'Develop a repeatable short-form series showing how a golfer turns one round observation into one focused practice decision without making performance promises.', audience: 'Improvement-minded recreational golfers', outcome: 'A reviewed content format tied to the product’s first-value loop' },
    { title: 'Golf instructor distribution shortlist', kind: 'research', description: 'Research instructors and small golf communities whose public teaching emphasizes reflection, practice planning, or on-course decision-making.', audience: 'Potential instructor and community audiences', outcome: 'A sourced shortlist with fit, contact-route, and capability unknowns' },
  ],
  'Astro-Log': [
    { title: 'Seven-morning reflection ritual', kind: 'content', description: 'Create a seven-part morning content sequence that demonstrates the reflective habit around daily briefs while avoiding scientific or guaranteed-outcome claims.', audience: 'Astrology readers who already use morning reflection rituals', outcome: 'A reviewed series that can support a small retention test' },
    { title: 'Astrology creator collaboration shortlist', kind: 'research', description: 'Research a small set of creators whose public content fits thoughtful daily astrology and transparent entertainment positioning.', audience: 'Creator audiences interested in astrology and reflection', outcome: 'A sourced, owner-reviewed shortlist before any outreach' },
    { title: 'Email-to-first-value friction brief', kind: 'product_improvement', description: 'Inspect the path from signup through the first useful morning brief and document where readiness, comprehension, or delivery may break.', audience: 'New eligible readers', outcome: 'One implementation-ready first-value improvement brief' },
  ],
  Tonight: [
    { title: 'Ten-pair dinner decision pilot', kind: 'campaign', description: 'Recruit a small local cohort to create and use shared dinner shortlists, then record whether the product helps them reach an actual decision.', audience: 'Pairs and small groups choosing dinner in the Boca Raton–Jupiter corridor', outcome: 'Observed shared-decision usage and product friction' },
    { title: 'Local food creator decision challenge', kind: 'content', description: 'Develop a collaboration concept where a local food creator builds a constrained shortlist and invites followers to make a shared choice without implying a restaurant partnership.', audience: 'Local diners following South Florida food creators', outcome: 'A reviewable creator-content format and distribution hypothesis' },
    { title: 'Share-to-final-choice improvement brief', kind: 'product_improvement', description: 'Review the shared-link experience from invitation through final choice and specify the smallest change most likely to reduce indecision.', audience: 'People receiving a shared dinner shortlist', outcome: 'A prioritized brief with acceptance criteria and unknowns' },
  ],
  'Traction OS': [
    { title: 'Four-business proof narrative', kind: 'content', description: 'Document how Explore, Do, evidence, and portfolio prioritization change real owner decisions across the four businesses, clearly separating artifacts from outcomes.', audience: 'Multi-project founders and small holding-company operators', outcome: 'A credible build-in-public proof series grounded in recorded evidence' },
    { title: 'Founder-operator guided pilot', kind: 'outreach', description: 'Define a small owner-approved pilot for founders managing several products, with a reviewed pitch and explicit first-use observation before any sending.', audience: 'Founders actively allocating attention across multiple products', outcome: 'A reviewed recruitment brief and measurable first-value criterion' },
    { title: 'Evidence-to-next-action product brief', kind: 'product_improvement', description: 'Improve the surface that distinguishes drafted work, executed actions, observed results, and the next owner decision.', audience: 'Owners reviewing a week of mixed product and marketing work', outcome: 'An implementation-ready proof and decision interface brief' },
  ],
};

const token = spawnSync('turso', ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'], { encoding: 'utf8' });
if (token.status !== 0 || !token.stdout.trim()) throw Error('Turso authentication is unavailable.');
const client = createClient({
  url: 'libsql://traction-memory-jwarm16.aws-us-east-1.turso.io',
  authToken: token.stdout.trim(),
});

function applyRun(business) {
  const suggestions = runs[business.name];
  if (!suggestions) return false;
  if (business.explore?.messages.some((message) => message.content.startsWith(marker))) return false;
  addExploreMessage(business, {
    role: 'assistant',
    content: `${marker}. These are proposals based on the saved business context, not researched evidence or authorized work. Compare them, edit the strongest direction, and save only what deserves owner attention.`,
    suggestions,
  });
  addLog(business, `Initial Explore ideation pass added for ${business.name}.`);
  return true;
}

let starterUpdates = 0;
let liveUpdates = 0;
try {
  const starters = await client.execute({
    sql: 'SELECT business_id,data FROM owner_starters WHERE owner_email=?',
    args: [ownerEmail],
  });
  for (const row of starters.rows) {
    const business = JSON.parse(text(row.data));
    if (!applyRun(business)) continue;
    const result = await client.execute({
      sql: 'UPDATE owner_starters SET data=? WHERE owner_email=? AND business_id=?',
      args: [JSON.stringify(business), ownerEmail, text(row.business_id)],
    });
    starterUpdates += result.rowsAffected;
  }
  const live = await client.execute({
    sql: 'SELECT b.user_id,b.id,b.data,b.revision FROM business_documents b JOIN users u ON u.id=b.user_id WHERE lower(u.email)=?',
    args: [ownerEmail],
  });
  for (const row of live.rows) {
    const business = JSON.parse(text(row.data));
    if (!applyRun(business)) continue;
    const result = await client.execute({
      sql: 'UPDATE business_documents SET data=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?',
      args: [JSON.stringify(business), new Date().toISOString(), text(row.user_id), text(row.id), Number(row.revision)],
    });
    if (result.rowsAffected !== 1) throw Error(`Concurrent update prevented seeding ${business.name}.`);
    liveUpdates += 1;
  }
  console.log(JSON.stringify({ ideationRuns: Object.keys(runs).length, starterUpdates, liveUpdates }));
} finally {
  client.close();
}
