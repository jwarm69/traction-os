import {
  campaignMetrics,
  type BusinessDocument,
  type CampaignMetric,
  type EndeavorStatus,
  type IdeaKind,
  type Signal,
} from './engine.ts';
import { MIN_DENOMINATOR, pipelineState, reachedStage } from './pipeline.ts';
import { workState } from './work.ts';

/**
 * The campaign table: one derived row per endeavor, computed at read time from
 * the business document. Never stored, never fed to a model here. null means
 * "no evidence recorded", never zero. Nothing in this module attributes an
 * outcome to a campaign causally; it only joins records that carry the same id.
 */
export const STALE_EVIDENCE_DAYS = 14;

/** Optional window on signal observedAt and stage event timestamps. */
export type CampaignWindow = { since?: string; until?: string };

export type CampaignRow = {
  endeavorId: string;
  code: string;
  title: string;
  status: EndeavorStatus;
  kind: IdeaKind;
  // From pipeline contacts linked to this endeavor.
  contacts: number;
  contacted: number;
  replied: number;
  conversations: number;
  won: number;
  lost: number;
  // From classified signals. null means no signal recorded, not zero.
  spend: number | null;
  leads: number | null;
  qualified: number | null;
  deals: number | null;
  revenue: number | null;
  churned: number | null;
  // Derived only when both inputs exist and denominators meet MIN_DENOMINATOR.
  costPerConversation: number | null;
  costPerDeal: number | null;
  /** Human-readable reasons a cell is null, for the UI to show on hover. */
  unknowns: string[];
  lastEvidenceAt: string | null;
  /** True for in_progress work whose last evidence is missing or older than STALE_EVIDENCE_DAYS. */
  stale: boolean;
};

const statusOrder: Record<EndeavorStatus, number> = {
  in_progress: 0,
  ready: 1,
  preparing: 2,
  blocked: 3,
  completed: 4,
  stopped: 5,
};

export const campaignMetricLabels: Record<CampaignMetric, string> = {
  spend: 'Spend',
  leads: 'Leads',
  qualified: 'Qualified',
  deals: 'Deals',
  revenue: 'Revenue',
  churned: 'Churned',
};

/** A signal counts toward a campaign only when the owner classified it. */
export function isClassified(
  signal: Signal,
): signal is Signal & { endeavorId: string; campaignMetric: CampaignMetric } {
  return (
    typeof signal.endeavorId === 'string' &&
    !!signal.endeavorId &&
    typeof signal.campaignMetric === 'string' &&
    campaignMetrics.includes(signal.campaignMetric)
  );
}

const later = (a: string | null, b: string | undefined) =>
  !b ? a : !a || b > a ? b : a;

const inWindow = (at: string, window?: CampaignWindow) =>
  !window || ((!window.since || at >= window.since) && (!window.until || at <= window.until));

export function campaignRow(
  business: BusinessDocument,
  endeavorId: string,
  window?: CampaignWindow,
  now = Date.now(),
): CampaignRow {
  const endeavor = workState(business).endeavors.find(
    (item) => item.id === endeavorId,
  );
  if (!endeavor) throw Error('Do work item not found.');

  const contacts = pipelineState(business).contacts.filter(
    (contact) => contact.endeavorId === endeavorId,
  );
  let contacted = 0,
    replied = 0,
    conversations = 0,
    won = 0,
    lost = 0;
  let lastEvidenceAt: string | null = null;
  const reachedIn = (contact: (typeof contacts)[number], stage: Parameters<typeof reachedStage>[1]) =>
    window
      ? contact.stageHistory.some((event) => event.stage === stage && inWindow(event.at, window))
      : reachedStage(contact, stage);
  for (const contact of contacts) {
    if (reachedIn(contact, 'contacted')) contacted += 1;
    if (reachedIn(contact, 'replied')) replied += 1;
    if (reachedIn(contact, 'conversation')) conversations += 1;
    if (window ? reachedIn(contact, 'won') : contact.stage === 'won') won += 1;
    if (window ? reachedIn(contact, 'lost') : contact.stage === 'lost') lost += 1;
    for (const event of contact.stageHistory)
      if (inWindow(event.at, window)) lastEvidenceAt = later(lastEvidenceAt, event.at);
  }

  const sums: Record<CampaignMetric, number | null> = {
    spend: null,
    leads: null,
    qualified: null,
    deals: null,
    revenue: null,
    churned: null,
  };
  for (const signal of business.signals) {
    if (!isClassified(signal) || signal.endeavorId !== endeavorId) continue;
    if (!inWindow(signal.observedAt, window)) continue;
    sums[signal.campaignMetric] = (sums[signal.campaignMetric] || 0) + signal.value;
    lastEvidenceAt = later(lastEvidenceAt, signal.observedAt);
  }
  for (const observation of endeavor.observations)
    if (inWindow(observation.observedAt, window))
      lastEvidenceAt = later(lastEvidenceAt, observation.observedAt);
  const stale =
    endeavor.status === 'in_progress' &&
    (!lastEvidenceAt ||
      now - new Date(lastEvidenceAt).getTime() > STALE_EVIDENCE_DAYS * 24 * 60 * 60 * 1000);

  const unknowns: string[] = [];
  for (const metric of campaignMetrics)
    if (sums[metric] === null)
      unknowns.push(
        `${campaignMetricLabels[metric]} is unknown: no signal has been classified as ${metric} for ${endeavor.code}.`,
      );

  let costPerConversation: number | null = null;
  if (sums.spend === null)
    unknowns.push('Cost per conversation is unknown: spend is not recorded.');
  else if (conversations < MIN_DENOMINATOR)
    unknowns.push(
      `Cost per conversation is unknown: ${conversations} conversation${conversations === 1 ? '' : 's'} is below the ${MIN_DENOMINATOR} needed for a rate.`,
    );
  else costPerConversation = sums.spend / conversations;

  let costPerDeal: number | null = null;
  if (sums.spend === null)
    unknowns.push('Cost per deal is unknown: spend is not recorded.');
  else if (sums.deals === null)
    unknowns.push('Cost per deal is unknown: deals are not recorded.');
  else if (sums.deals < MIN_DENOMINATOR)
    unknowns.push(
      `Cost per deal is unknown: ${sums.deals} deal${sums.deals === 1 ? '' : 's'} is below the ${MIN_DENOMINATOR} needed for a rate.`,
    );
  else costPerDeal = sums.spend / sums.deals;

  return {
    endeavorId,
    code: endeavor.code,
    title: endeavor.title,
    status: endeavor.status,
    kind: endeavor.kind,
    contacts: contacts.length,
    contacted,
    replied,
    conversations,
    won,
    lost,
    ...sums,
    costPerConversation,
    costPerDeal,
    unknowns,
    lastEvidenceAt,
    stale,
  };
}

export function campaignTable(
  business: BusinessDocument,
  window?: CampaignWindow,
  now = Date.now(),
): CampaignRow[] {
  return workState(business)
    .endeavors.slice()
    .sort(
      (a, z) =>
        statusOrder[a.status] - statusOrder[z.status] ||
        z.createdAt.localeCompare(a.createdAt),
    )
    .map((item) => campaignRow(business, item.id, window, now));
}
