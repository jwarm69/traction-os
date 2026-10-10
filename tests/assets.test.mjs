import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import { createIdea } from '../lib/explore.ts';
import { addCorrection } from '../lib/knowledge.ts';
import { defaultWorkBrief, saveArtifact, selectIdea, campaignLink } from '../lib/work.ts';
import { campaignRow } from '../lib/campaigns.ts';
import { parseSignalsCsv } from '../lib/csv.ts';
import { skills } from '../lib/skills.ts';
import {
  assetTable,
  assetTableCsv,
  buildRenderSpec,
  registerExternalAsset,
  registerMotionAsset,
  resolveSignalAsset,
  setAssetLinks,
  RENDER_SPEC_SCHEMA,
} from '../lib/assets.ts';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const idea = { title: 'Coach launch', kind: 'campaign', description: 'Video for coaches', audience: 'Golf coaches', outcome: '', ownerNotes: '', sources: [] };
const concept = (angle, hook) => ({
  angle,
  insight: 'Coaches lose lesson time re-checking setup.',
  evidence: [],
  hook,
  visual: 'The alignment line snaps straight on a phone.',
  copy: 'Spend lessons on the swing. Not the setup! Try it free?',
  productionBrief: '20-second vertical, range footage, captions.',
  hypothesis: 'Coaches reply more to a time-saved angle.',
});

function fixture() {
  const business = demoBusiness();
  business.name = 'AlignIQ Golf';
  business.url = 'https://aligniqgolf.com';
  business.signals = [];
  business.corrections = [];
  business.facts = [
    { id: 'f1', label: 'Offer', value: 'Real-time alignment feedback', source: 'https://aligniqgolf.com', observedAt: '2026-10-01T00:00:00.000Z', confidence: 'high', status: 'confirmed', category: 'offer' },
    { id: 'f2', label: 'Tone', value: 'Plain, coach-to-coach', source: 'Owner', observedAt: '2026-04-01T00:00:00.000Z', confidence: 'high', status: 'confirmed', category: 'voice' },
    { id: 'f3', label: 'Draft claim', value: 'Lowers scores', source: 'Owner', observedAt: '2026-10-01T00:00:00.000Z', confidence: 'low', status: 'unreviewed', category: 'proof' },
  ];
  business.work = { endeavors: [] };
  const e = selectIdea(business, createIdea(business, idea).id, defaultWorkBrief(idea));
  const parsed = skills.campaign_brief.parse(
    { concepts: [concept('Time saved', 'Ten seconds to a perfect setup.'), concept('Proof first', 'Here is one real before and after.'), concept('Coach voice', 'The drill your coach would give you.')] },
    business,
    e,
    NOW,
  );
  const brief = saveArtifact(business, e.id, { kind: 'content', title: 'AG001 campaign brief', content: parsed.content, source: 'assistant', data: parsed.data });
  return { business, e, brief };
}

const signal = (business, e, metric, value, asset) =>
  business.signals.push({ id: `s${business.signals.length}`, metric, value, period: 'w41', note: '', source: 'Meta export', observedAt: '2026-10-08T00:00:00.000Z', confidence: 'medium', endeavorId: e.id, campaignMetric: metric, ...(asset ? { asset } : {}) });

await test('exporting registers a versioned motion asset per concept', () => {
  const { business, e, brief } = fixture();
  const first = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 1, formats: ['9:16', '1:1', '9:16'] });
  assert.equal(first.name, 'AG001_proof-first_motion_v1');
  assert.deepEqual(first.formats, ['9:16', '1:1']);
  assert.deepEqual(first.concept, { briefArtifactId: brief.id, briefVersion: 1, index: 1, angle: 'Proof first' });
  const second = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 1, formats: ['9:16'], hook: 'A shorter hook for the test.' });
  assert.equal(second.name, 'AG001_proof-first_motion_v2');
  assert.equal(registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 0, formats: ['16:9'] }).name, 'AG001_time-saved_motion_v1');
  assert.throws(() => registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 0, formats: [] }), /at least one format/);
  assert.throws(() => registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 9, formats: ['9:16'] }), /Concept not found/);
  assert.throws(() => registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 0, formats: ['9:16'], hook: 'short' }), /10 to 200/);
});

await test('the render spec is complete, tracked, and rebuilt from the exported brief version', () => {
  const { business, e, brief } = fixture();
  addCorrection(business, { text: 'Never promise lower scores.', scope: 'campaign_brief' });
  addCorrection(business, { text: 'Customer language rule.', scope: 'customer_language' });
  const asset = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 1, formats: ['9:16', '1:1'], ctaText: 'Try it free' });
  const spec = buildRenderSpec(business, e.id, asset.name, NOW);
  assert.equal(spec.schema, RENDER_SPEC_SCHEMA);
  assert.equal(spec.script.hook, 'Here is one real before and after.');
  assert.deepEqual(spec.script.lines, ['Spend lessons on the swing.', 'Not the setup!', 'Try it free?']);
  assert.equal(spec.script.cta.text, 'Try it free');
  assert.equal(spec.script.cta.url, 'https://aligniqgolf.com/?utm_source=traction&utm_medium=video&utm_campaign=AG001&utm_content=AG001_proof-first_motion_v1');
  assert.deepEqual(spec.formats.map((item) => [item.aspect, item.width, item.height, item.fileName]), [
    ['9:16', 1080, 1920, 'AG001_proof-first_motion_v1_9x16.mp4'],
    ['1:1', 1080, 1080, 'AG001_proof-first_motion_v1_1x1.mp4'],
  ]);
  assert.deepEqual(spec.brand.offer, ['Offer: Real-time alignment feedback']);
  assert.deepEqual(spec.brand.voice, ['Tone: Plain, coach-to-coach (verify: observed 2026-04-01)']);
  assert.deepEqual(spec.brand.proof, [], 'unreviewed facts never reach the renderer');
  assert.deepEqual(spec.rules, ['Never promise lower scores.']);
  assert.equal(spec.tracking.utm.utm_content, asset.name);
  assert.match(spec.tracking.report, /campaign AG001 and asset AG001_proof-first_motion_v1/);
  // A newer brief run does not change an exported asset's spec.
  saveArtifact(business, e.id, { artifactId: brief.id, kind: 'content', title: brief.title, content: 'new', source: 'assistant', data: JSON.stringify({ concepts: [concept('Other', 'A totally different hook here.')], gaps: [], flags: [], claimsToVerify: [] }) });
  const again = buildRenderSpec(business, e.id, asset.name, NOW);
  assert.deepEqual(again, spec);
});

await test('the spec flags a missing CTA and a non-https site instead of inventing them', () => {
  const { business, e, brief } = fixture();
  business.url = 'http://aligniqgolf.com';
  const asset = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 0, formats: ['9:16'] });
  const spec = buildRenderSpec(business, e.id, asset.name, NOW);
  assert.equal(spec.script.cta.url, null);
  assert.equal(spec.script.cta.text, null);
  assert.ok(spec.flags.some((flag) => /no https site URL/.test(flag)));
  assert.ok(spec.flags.some((flag) => /No call-to-action text/.test(flag)));
});

await test('external assets, links, and strict signal resolution', () => {
  const { business, e } = fixture();
  assert.equal(registerExternalAsset(business, e.id, 'ugc creator one').name, 'AG001_ugc-creator-one');
  assert.equal(registerExternalAsset(business, e.id, 'AG001_reel-b').name, 'AG001_reel-b');
  assert.throws(() => registerExternalAsset(business, e.id, 'reel-b'), /already registered/);
  assert.throws(() => registerExternalAsset(business, e.id, 'bad/name'), /letters, numbers/);
  assert.equal(resolveSignalAsset(e, ' AG001_reel-b '), 'AG001_reel-b');
  assert.throws(() => resolveSignalAsset(e, 'AG001_reel-c'), /not a registered asset of AG001/);
  setAssetLinks(business, e.id, 'AG001_reel-b', { publishedUrl: 'https://instagram.com/p/abc', mediaUrl: '' });
  assert.equal(e.assets[1].publishedUrl, 'https://instagram.com/p/abc');
  assert.throws(() => setAssetLinks(business, e.id, 'AG001_reel-b', { publishedUrl: 'http://x.com' }), /https/);
});

await test('the asset table splits campaign signals by asset, keeps unknown, and sums to the campaign', () => {
  const { business, e, brief } = fixture();
  const a = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 0, formats: ['9:16'] }).name;
  const b = registerMotionAsset(business, e.id, { briefArtifactId: brief.id, index: 1, formats: ['9:16'] }).name;
  registerExternalAsset(business, e.id, 'unused');
  signal(business, e, 'spend', 100, a);
  signal(business, e, 'leads', 6, a);
  signal(business, e, 'spend', 80, b);
  signal(business, e, 'leads', 2, b);
  signal(business, e, 'spend', 20);
  const rows = assetTable(business, e.id);
  assert.deepEqual(rows.map((row) => [row.name, row.kind, row.spend, row.leads, row.costPerLead]), [
    [a, 'motion', 100, 6, 100 / 6],
    [b, 'motion', 80, 2, null],
    ['AG001_unused', 'external', null, null, null],
    [null, 'unassigned', 20, null, null],
  ]);
  assert.ok(rows[1].unknowns.some((item) => /below the 5 needed/.test(item)));
  const spend = rows.reduce((sum, row) => sum + (row.spend || 0), 0);
  assert.equal(spend, campaignRow(business, e.id).spend);
  const csv = assetTableCsv(business, e.id).trim().split('\r\n');
  assert.equal(csv[0], 'campaign,asset,kind,spend,leads,qualified,deals,revenue,churned,cost_per_lead,last_evidence_at');
  assert.equal(csv[3], 'AG001,AG001_unused,external,,,,,,,,');
  assert.equal(csv[4], 'AG001,,unassigned,20,,,,,,,2026-10-08T00:00:00.000Z');
});

await test('CSV rows carry an asset only with a campaign', () => {
  const rows = parseSignalsCsv('metric,value,period,campaign,campaign_metric,asset\nSpend,50,w41,AG001,spend,AG001_proof-first_motion_v1\nLeads,3,w41,AG001,leads,');
  assert.equal(rows[0].asset, 'AG001_proof-first_motion_v1');
  assert.equal(rows[1].asset, undefined);
  assert.throws(() => parseSignalsCsv('metric,value,period,asset\nSpend,50,w41,AG001_x'), /asset without a campaign/);
});

await test('campaign links add utm_content only when asked', () => {
  assert.equal(campaignLink('https://a.com/x', 'AG001'), 'https://a.com/x?utm_source=traction&utm_medium=owner&utm_campaign=AG001');
  assert.equal(campaignLink('https://a.com/x', 'AG001', 'video', 'AG001_a_motion_v1'), 'https://a.com/x?utm_source=traction&utm_medium=video&utm_campaign=AG001&utm_content=AG001_a_motion_v1');
});
