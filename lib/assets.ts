import {
  addLog,
  campaignMetrics,
  renderFormats,
  type BusinessDocument,
  type CampaignAsset,
  type CampaignMetric,
  type Endeavor,
  type RenderFormat,
} from './engine.ts';
import { correctionsFor, STALE_FACT_DAYS } from './knowledge.ts';
import { parseBriefData, type Concept } from './skills.ts';
import { campaignAssetName, campaignLink, endeavorFor } from './work.ts';
import { MIN_DENOMINATOR } from './pipeline.ts';

/**
 * Per-asset tracking and render specs. An asset is one trackable creative,
 * usually a rendered video, inside a campaign. Its name is the join key: it is
 * the file name, the utm_content value, and the `asset` on a signal or CSV row.
 */

export const MAX_ASSETS = 50;
export const RENDER_SPEC_SCHEMA = 'traction.render-spec/v1';
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;
const DAY = 86_400_000;

export const formatSizes: Record<RenderFormat, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

export const isRenderFormat = (value: unknown): value is RenderFormat =>
  typeof value === 'string' && (renderFormats as string[]).includes(value);

export function assetsOf(endeavor: Endeavor) {
  return endeavor.assets || [];
}

export function assetByName(endeavor: Endeavor, name: string) {
  return assetsOf(endeavor).find((item) => item.name === name.trim());
}

/** The brief concept at the exact version an asset was exported from. */
export function conceptFor(endeavor: Endeavor, ref: { briefArtifactId: string; briefVersion?: number; index: number }) {
  const artifact = endeavor.artifacts.find((item) => item.id === ref.briefArtifactId);
  if (!artifact) throw Error('Campaign brief not found.');
  const version =
    ref.briefVersion === undefined
      ? artifact.versions.find((item) => item.id === artifact.activeVersionId) || artifact.versions.at(-1)
      : artifact.versions.find((item) => item.number === ref.briefVersion);
  const data = parseBriefData(version?.data);
  if (!version || !data)
    throw Error('This brief version has no concepts. Export from the latest assistant brief.');
  const concept: Concept | undefined = Number.isInteger(ref.index) ? data.concepts[ref.index] : undefined;
  if (!concept) throw Error('Concept not found.');
  return { artifact, version, concept, data };
}

function checkRoom(endeavor: Endeavor) {
  if (assetsOf(endeavor).length >= MAX_ASSETS)
    throw Error(`A campaign holds at most ${MAX_ASSETS} tracked assets.`);
}

/**
 * Register the next motion asset for a brief concept. Each export is a new
 * version with its own name, so two cuts of the same concept stay separable.
 */
export function registerMotionAsset(
  business: BusinessDocument,
  endeavorId: string,
  input: {
    briefArtifactId: string;
    index: number;
    formats: RenderFormat[];
    hook?: string;
    ctaText?: string;
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  checkRoom(endeavor);
  const { version, concept } = conceptFor(endeavor, input);
  const formats = [...new Set(input.formats)].filter(isRenderFormat);
  if (!formats.length) throw Error('Choose at least one format.');
  const hook = input.hook?.trim() || undefined;
  if (hook && (hook.length < 10 || hook.length > 200))
    throw Error('An alternate hook must be 10 to 200 characters.');
  const ctaText = input.ctaText?.trim() || undefined;
  if (ctaText && ctaText.length > 60) throw Error('Keep the call to action under 60 characters.');
  const siblings = assetsOf(endeavor).filter(
    (item) =>
      item.kind === 'motion' &&
      item.concept?.briefArtifactId === input.briefArtifactId &&
      item.concept.index === input.index,
  );
  const next = Math.max(0, ...siblings.map((item) => item.version || 0)) + 1;
  const asset: CampaignAsset = {
    name: campaignAssetName(endeavor.code, concept.angle, 'motion', next),
    kind: 'motion',
    createdAt: new Date().toISOString(),
    concept: {
      briefArtifactId: input.briefArtifactId,
      briefVersion: version.number,
      index: input.index,
      angle: concept.angle,
    },
    version: next,
    ...(hook ? { hook } : {}),
    ...(ctaText ? { ctaText } : {}),
    formats,
  };
  if (assetByName(endeavor, asset.name)) throw Error(`${asset.name} is already registered.`);
  (endeavor.assets ||= []).push(asset);
  endeavor.updatedAt = asset.createdAt;
  addLog(business, `Render spec exported: ${asset.name}.`);
  return asset;
}

/** Register a creative made outside Traction so its results can be tracked by name. */
export function registerExternalAsset(business: BusinessDocument, endeavorId: string, suffix: string) {
  const endeavor = endeavorFor(business, endeavorId);
  checkRoom(endeavor);
  const clean = suffix.trim().replace(/\s+/g, '-');
  const name = clean.toUpperCase().startsWith(`${endeavor.code}_`) ? clean : `${endeavor.code}_${clean}`;
  if (!ASSET_NAME.test(name))
    throw Error('Use letters, numbers, dashes, and underscores, up to 80 characters.');
  if (assetByName(endeavor, name)) throw Error(`${name} is already registered.`);
  const asset: CampaignAsset = { name, kind: 'external', createdAt: new Date().toISOString() };
  (endeavor.assets ||= []).push(asset);
  endeavor.updatedAt = asset.createdAt;
  addLog(business, `Asset registered: ${name}.`);
  return asset;
}

const httpsOrEmpty = (value: string | undefined, label: string) => {
  const text = value?.trim();
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw Error(`${label} must be an https URL.`);
  }
  if (url.protocol !== 'https:') throw Error(`${label} must be an https URL.`);
  return url.toString();
};

export function setAssetLinks(
  business: BusinessDocument,
  endeavorId: string,
  name: string,
  links: { mediaUrl?: string; publishedUrl?: string },
) {
  const endeavor = endeavorFor(business, endeavorId);
  const asset = assetByName(endeavor, name);
  if (!asset) throw Error('Asset not found.');
  asset.mediaUrl = httpsOrEmpty(links.mediaUrl, 'The file link');
  asset.publishedUrl = httpsOrEmpty(links.publishedUrl, 'The published link');
  endeavor.updatedAt = new Date().toISOString();
  addLog(business, `Links updated for ${asset.name}.`);
  return asset;
}

/** Resolve an asset name for a signal. Unknown names reject, so a typo cannot invent a video. */
export function resolveSignalAsset(endeavor: Endeavor, name: string) {
  const asset = assetByName(endeavor, name);
  if (!asset)
    throw Error(`${name.trim()} is not a registered asset of ${endeavor.code}. Register it under Videos first.`);
  return asset.name;
}

export type AssetRow = {
  /** Asset name, or null for classified campaign signals not assigned to any asset. */
  name: string | null;
  kind: CampaignAsset['kind'] | 'unassigned';
  spend: number | null;
  leads: number | null;
  qualified: number | null;
  deals: number | null;
  revenue: number | null;
  churned: number | null;
  /** Spend / leads, only when both exist and leads meet MIN_DENOMINATOR. */
  costPerLead: number | null;
  lastEvidenceAt: string | null;
  unknowns: string[];
};

/**
 * Classified signals of one campaign split by asset. Rows sum to the campaign
 * row's signal metrics. Pipeline contacts are campaign-level and are not split.
 * Like the campaign table, this joins records by name and attributes nothing
 * causally.
 */
export function assetTable(business: BusinessDocument, endeavorId: string): AssetRow[] {
  const endeavor = endeavorFor(business, endeavorId);
  const empty = (name: string | null, kind: AssetRow['kind']): AssetRow => ({
    name,
    kind,
    spend: null,
    leads: null,
    qualified: null,
    deals: null,
    revenue: null,
    churned: null,
    costPerLead: null,
    lastEvidenceAt: null,
    unknowns: [],
  });
  const rows = new Map<string | null, AssetRow>(
    assetsOf(endeavor).map((asset) => [asset.name, empty(asset.name, asset.kind)]),
  );
  for (const signal of business.signals) {
    if (signal.endeavorId !== endeavorId || !signal.campaignMetric) continue;
    if (!campaignMetrics.includes(signal.campaignMetric)) continue;
    const key = signal.asset && rows.has(signal.asset) ? signal.asset : null;
    if (!rows.has(key)) rows.set(key, empty(null, 'unassigned'));
    const row = rows.get(key)!;
    const metric: CampaignMetric = signal.campaignMetric;
    row[metric] = (row[metric] || 0) + signal.value;
    if (!row.lastEvidenceAt || signal.observedAt > row.lastEvidenceAt) row.lastEvidenceAt = signal.observedAt;
  }
  for (const row of rows.values()) {
    if (row.spend === null) row.unknowns.push('Spend is unknown: no spend signal names this asset.');
    if (row.leads === null) row.unknowns.push('Leads are unknown: no leads signal names this asset.');
    if (row.spend !== null && row.leads !== null) {
      if (row.leads >= MIN_DENOMINATOR) row.costPerLead = row.spend / row.leads;
      else
        row.unknowns.push(
          `Cost per lead is unknown: ${row.leads} lead${row.leads === 1 ? '' : 's'} is below the ${MIN_DENOMINATOR} needed for a rate.`,
        );
    }
  }
  const unassigned = rows.get(null);
  rows.delete(null);
  return [...rows.values(), ...(unassigned ? [unassigned] : [])];
}

const csvColumns: (keyof AssetRow)[] = [
  'name',
  'kind',
  'spend',
  'leads',
  'qualified',
  'deals',
  'revenue',
  'churned',
  'costPerLead',
  'lastEvidenceAt',
];
const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : String(value as string);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The asset table as CSV with the campaign code on every row. Unknown is an empty cell. */
export function assetTableCsv(business: BusinessDocument, endeavorId: string) {
  const endeavor = endeavorFor(business, endeavorId);
  const header = ['campaign', 'asset', 'kind', 'spend', 'leads', 'qualified', 'deals', 'revenue', 'churned', 'cost_per_lead', 'last_evidence_at'];
  const lines = assetTable(business, endeavorId).map((row) =>
    [endeavor.code, ...csvColumns.map((key) => row[key])].map(csvCell).join(','),
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

export type RenderSpec = {
  schema: typeof RENDER_SPEC_SCHEMA;
  generatedAt: string;
  business: { name: string; url: string };
  campaign: { code: string; title: string; audience: string | null; hypothesis: string };
  asset: {
    name: string;
    version: number;
    angle: string;
    concept: { briefArtifactId: string; briefVersion: number; index: number };
  };
  script: {
    hook: string;
    /** Body copy split into sentences, in order. The renderer decides timing. */
    lines: string[];
    cta: { text: string | null; url: string | null };
  };
  visual: { direction: string; productionBrief: string };
  formats: { aspect: RenderFormat; width: number; height: number; fileName: string }[];
  /** Confirmed facts the creative may rely on, by knowledge-library category. */
  brand: { offer: string[]; product: string[]; positioning: string[]; voice: string[]; proof: string[] };
  /** Standing corrections in scope for campaign creative. The renderer's copy must follow them. */
  rules: string[];
  claimsToVerify: string[];
  flags: string[];
  tracking: {
    campaign: string;
    asset: string;
    utm: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string };
    /** Report results as signals or CSV rows with campaign and asset set to these values. */
    report: string;
  };
};

const sentences = (text: string) =>
  (text.match(/[^.!?\n]+[.!?]*/g) || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

/**
 * The render spec for a registered motion asset. Pure: the same business and
 * asset always produce the same spec apart from generatedAt.
 */
export function buildRenderSpec(
  business: BusinessDocument,
  endeavorId: string,
  assetName: string,
  now = Date.now(),
): RenderSpec {
  const endeavor = endeavorFor(business, endeavorId);
  const asset = assetByName(endeavor, assetName);
  if (!asset || asset.kind !== 'motion' || !asset.concept)
    throw Error('Render specs exist only for motion assets exported from a brief concept.');
  const { concept, data } = conceptFor(endeavor, asset.concept);
  const flags = [...concept.flags];
  let url: string | null = null;
  try {
    url = campaignLink(business.url, endeavor.code, 'video', asset.name);
  } catch {
    flags.push('The business has no https site URL, so the call to action has no tracked link.');
  }
  if (!asset.ctaText) flags.push('No call-to-action text was set; add one in the renderer before publishing.');
  const confirmed = business.facts.filter((fact) => fact.status === 'confirmed' || fact.status === 'corrected');
  const byCategory = (category: string) =>
    confirmed
      .filter((fact) => fact.category === category)
      .map((fact) =>
        `${fact.label}: ${fact.value}${now - Date.parse(fact.observedAt) > STALE_FACT_DAYS * DAY ? ` (verify: observed ${fact.observedAt.slice(0, 10)})` : ''}`,
      );
  const formats = asset.formats?.length ? asset.formats : (['9:16'] as RenderFormat[]);
  return {
    schema: RENDER_SPEC_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    business: { name: business.name, url: business.url },
    campaign: {
      code: endeavor.code,
      title: endeavor.title,
      audience: endeavor.audience || null,
      hypothesis: concept.hypothesis,
    },
    asset: {
      name: asset.name,
      version: asset.version || 1,
      angle: concept.angle,
      concept: {
        briefArtifactId: asset.concept.briefArtifactId,
        briefVersion: asset.concept.briefVersion,
        index: asset.concept.index,
      },
    },
    script: {
      hook: asset.hook || concept.hook,
      lines: sentences(concept.copy),
      cta: { text: asset.ctaText || null, url },
    },
    visual: { direction: concept.visual, productionBrief: concept.productionBrief },
    formats: formats.map((aspect) => ({
      aspect,
      ...formatSizes[aspect],
      fileName: `${asset.name}_${aspect.replace(':', 'x')}.mp4`,
    })),
    brand: {
      offer: byCategory('offer'),
      product: byCategory('product'),
      positioning: byCategory('positioning'),
      voice: byCategory('voice'),
      proof: byCategory('proof'),
    },
    rules: correctionsFor(business, 'campaign_brief').map((item) => item.text),
    claimsToVerify: data.claimsToVerify,
    flags,
    tracking: {
      campaign: endeavor.code,
      asset: asset.name,
      utm: { utm_source: 'traction', utm_medium: 'video', utm_campaign: endeavor.code, utm_content: asset.name },
      report: `Record results with campaign ${endeavor.code} and asset ${asset.name}, by hand under Results or as CSV columns campaign, campaign_metric, asset.`,
    },
  };
}

