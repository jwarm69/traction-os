import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addContact, moveContact, MIN_DENOMINATOR } from '../lib/pipeline.ts';
import { defaultWorkBrief, selectIdea, transitionEndeavor } from '../lib/work.ts';
import { campaignRow, campaignTable, isClassified } from '../lib/campaigns.ts';

const idea = (title, kind = 'outreach') => ({
  title,
  kind,
  description: `Fixture ${title}`,
  audience: 'Owners',
  outcome: 'A reviewed result',
  ownerNotes: '',
  sources: [],
});

function signal(business, over) {
  business.signals.push({
    id: `sig_${business.signals.length + 1}`,
    metric: 'Fixture',
    value: 1,
    period: 'Aug',
    note: '',
    source: 'Fixture',
    observedAt: '2026-08-01T00:00:00.000Z',
    confidence: 'medium',
    ...over,
  });
}

function fixture() {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.signals = [];
  const a = selectIdea(business, createIdea(business, idea('Alpha')).id, defaultWorkBrief(idea('Alpha')));
  const z = selectIdea(business, createIdea(business, idea('Zeta', 'content')).id, defaultWorkBrief(idea('Zeta', 'content')));
  return { business, a, z };
}

await test('only classified signals for the same endeavor count, unknown stays null', () => {
  const { business, a, z } = fixture();
  signal(business, { metric: 'Ad spend', value: 100, endeavorId: a.id, campaignMetric: 'spend' });
  signal(business, { metric: 'Ad spend', value: 50, endeavorId: a.id, campaignMetric: 'spend', observedAt: '2026-08-09T00:00:00.000Z' });
  signal(business, { metric: 'Revenue', value: 900, endeavorId: z.id, campaignMetric: 'revenue' });
  // Business-level and half-classified signals never leak into a row.
  signal(business, { metric: 'Sessions', value: 4000 });
  signal(business, { metric: 'Mystery', value: 7, endeavorId: a.id });
  signal(business, { metric: 'Mystery', value: 7, campaignMetric: 'deals' });
  assert.equal(business.signals.filter(isClassified).length, 3);

  const row = campaignRow(business, a.id);
  assert.equal(row.code, 'AG001');
  assert.equal(row.spend, 150);
  assert.equal(row.revenue, null);
  assert.equal(row.deals, null);
  assert.equal(row.leads, null);
  assert.equal(row.lastEvidenceAt, '2026-08-09T00:00:00.000Z');
  assert.ok(row.unknowns.some((item) => /Revenue is unknown/.test(item)));
  assert.ok(row.unknowns.some((item) => /Deals is unknown/.test(item)));
  assert.ok(row.unknowns.some((item) => /Cost per deal is unknown: deals are not recorded/.test(item)));

  const other = campaignRow(business, z.id);
  assert.equal(other.spend, null);
  assert.equal(other.revenue, 900);
  assert.ok(other.unknowns.some((item) => /Cost per conversation is unknown: spend is not recorded/.test(item)));
  assert.throws(() => campaignRow(business, 'work_missing'), /not found/);
});

await test('pipeline counts follow stage history and ratios respect MIN_DENOMINATOR', () => {
  const { business, a, z } = fixture();
  signal(business, { metric: 'Ad spend', value: 500, endeavorId: a.id, campaignMetric: 'spend' });
  signal(business, { metric: 'Deals', value: 2, endeavorId: a.id, campaignMetric: 'deals' });
  for (let i = 0; i < MIN_DENOMINATOR; i++) {
    const contact = addContact(business, { name: `Owner ${i}`, channel: 'email', source: 'owner', endeavorId: a.id });
    moveContact(business, contact.id, 'contacted');
    moveContact(business, contact.id, 'replied');
    moveContact(business, contact.id, 'conversation');
  }
  const extra = addContact(business, { name: 'Lost one', channel: 'social', source: 'owner', endeavorId: a.id });
  moveContact(business, extra.id, 'lost');
  addContact(business, { name: 'Unrelated', channel: 'email', source: 'owner', endeavorId: z.id });
  addContact(business, { name: 'Unlinked', channel: 'email', source: 'owner' });

  const row = campaignRow(business, a.id);
  assert.equal(row.contacts, MIN_DENOMINATOR + 1);
  assert.equal(row.contacted, MIN_DENOMINATOR);
  assert.equal(row.replied, MIN_DENOMINATOR);
  assert.equal(row.conversations, MIN_DENOMINATOR);
  assert.equal(row.lost, 1);
  assert.equal(row.won, 0);
  assert.equal(row.costPerConversation, 100);
  // Two deals is below the denominator: the ratio stays unknown and says why.
  assert.equal(row.costPerDeal, null);
  assert.ok(row.unknowns.some((item) => /Cost per deal is unknown: 2 deals is below/.test(item)));
  assert.equal(campaignRow(business, z.id).contacts, 1);
  assert.equal(campaignRow(business, z.id).conversations, 0);

  // Four conversations: cost per conversation goes back to unknown.
  const fewer = fixture();
  signal(fewer.business, { metric: 'Ad spend', value: 500, endeavorId: fewer.a.id, campaignMetric: 'spend' });
  for (let i = 0; i < MIN_DENOMINATOR - 1; i++) {
    const contact = addContact(fewer.business, { name: `Owner ${i}`, channel: 'email', source: 'owner', endeavorId: fewer.a.id });
    moveContact(fewer.business, contact.id, 'contacted');
    moveContact(fewer.business, contact.id, 'replied');
    moveContact(fewer.business, contact.id, 'conversation');
  }
  const few = campaignRow(fewer.business, fewer.a.id);
  assert.equal(few.costPerConversation, null);
  assert.ok(few.unknowns.some((item) => /4 conversations is below the 5 needed/.test(item)));
});

await test('the campaign table orders by status then recency and is read-only', () => {
  const { business, a, z } = fixture();
  transitionEndeavor(business, a.id, 'ready');
  transitionEndeavor(business, a.id, 'in_progress');
  transitionEndeavor(business, z.id, 'stopped');
  const before = JSON.stringify(business);
  const table = campaignTable(business);
  assert.deepEqual(table.map((row) => row.code), ['AG001', 'AG002']);
  assert.deepEqual(table.map((row) => row.status), ['in_progress', 'stopped']);
  assert.equal(JSON.stringify(business), before);
  assert.deepEqual(campaignTable(demoBusiness()), []);
});

await test('rows flag stale in-progress work and honor a date window', () => {
  const { business, a } = fixture();
  const NOW = Date.parse('2026-09-01T00:00:00.000Z');
  signal(business, { metric: 'Ad spend', value: 100, endeavorId: a.id, campaignMetric: 'spend', observedAt: '2026-08-01T00:00:00.000Z' });
  signal(business, { metric: 'Ad spend', value: 40, endeavorId: a.id, campaignMetric: 'spend', observedAt: '2026-08-20T00:00:00.000Z' });
  // Not in progress: never stale.
  assert.equal(campaignRow(business, a.id, undefined, NOW).stale, false);
  transitionEndeavor(business, a.id, 'ready');
  transitionEndeavor(business, a.id, 'in_progress');
  assert.equal(campaignRow(business, a.id, undefined, NOW).stale, false);
  const later = Date.parse('2026-09-15T00:00:00.000Z');
  assert.equal(campaignRow(business, a.id, undefined, later).stale, true);
  const windowed = campaignRow(business, a.id, { since: '2026-08-10T00:00:00.000Z' }, NOW);
  assert.equal(windowed.spend, 40);
  assert.equal(windowed.lastEvidenceAt, '2026-08-20T00:00:00.000Z');
  const none = campaignRow(business, a.id, { until: '2026-07-01T00:00:00.000Z' }, NOW);
  assert.equal(none.spend, null);
  assert.equal(none.lastEvidenceAt, null);
  assert.equal(campaignTable(business, { since: '2026-08-10T00:00:00.000Z' }, NOW)[0].spend, 40);
});
