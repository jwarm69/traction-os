import {
  addLog,
  uid,
  type ArtifactKind,
  type BusinessDocument,
  type Endeavor,
  type EndeavorStatus,
  type EvidenceBar,
  type GuidedExperiment,
  type MarketingIdea,
  type PortfolioState,
  type ResearchCandidate,
  type WorkArtifact,
} from './engine.ts';

const now = () => new Date().toISOString();
const work = (business: BusinessDocument) =>
  (business.work ||= { endeavors: [] });

export function workState(business: BusinessDocument) {
  return business.work || { endeavors: [] };
}

export const CAMPAIGN_FALLBACK_PREFIX = 'CMP';

/**
 * Deterministic campaign prefix: the initial of each of the first three words
 * that start with a letter, uppercased. Fewer than two usable initials falls
 * back to CMP. Not owner-editable in this slice.
 */
export function campaignPrefix(business: Pick<BusinessDocument, 'name'>) {
  const letters = business.name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .filter((char) => /\p{L}/u.test(char))
    .slice(0, 3)
    .join('')
    .toUpperCase();
  return letters.length >= 2 ? letters : CAMPAIGN_FALLBACK_PREFIX;
}

/** Assigns the next immutable campaign code. Numbers are never reused. */
export function assignCampaignCode(business: BusinessDocument, endeavor: Endeavor) {
  const state = work(business);
  const number = state.nextCampaignNumber || 1;
  state.nextCampaignNumber = number + 1;
  endeavor.code = `${campaignPrefix(business)}${String(number).padStart(3, '0')}`;
  return endeavor.code;
}

/**
 * Backfill codes for endeavors created before campaign codes existed, in
 * createdAt order so numbering matches history. Returns true if anything changed.
 */
export function ensureCampaignCodes(business: BusinessDocument) {
  const missing = (business.work?.endeavors || [])
    .filter((item) => !item.code)
    .sort((a, z) => a.createdAt.localeCompare(z.createdAt));
  for (const endeavor of missing) assignCampaignCode(business, endeavor);
  return missing.length > 0;
}

export function endeavorByCode(business: BusinessDocument, code: string) {
  const wanted = code.trim().toUpperCase();
  return workState(business).endeavors.find((item) => item.code === wanted);
}

/**
 * A copy of the URL carrying the campaign code as UTM parameters, and the
 * asset name as utm_content when one is given. Traction writes these for the
 * owner to paste; it does not read them back.
 */
export function campaignLink(url: string, code: string, medium = 'owner', content?: string) {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw Error('Campaign link needs a valid https URL.');
  }
  if (parsed.protocol !== 'https:')
    throw Error('Campaign link needs a valid https URL.');
  if (!code.trim()) throw Error('Campaign link needs a campaign code.');
  parsed.searchParams.set('utm_source', 'traction');
  parsed.searchParams.set('utm_medium', slug(medium) || 'owner');
  parsed.searchParams.set('utm_campaign', code.trim());
  if (content?.trim()) parsed.searchParams.set('utm_content', content.trim());
  return parsed.toString();
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Suggested asset name, e.g. AG003_dinner-angle_ugc_v2. Never enforced. */
export function campaignAssetName(
  code: string,
  angle: string,
  format: string,
  version = 1,
) {
  const safeVersion = Number.isInteger(version) && version > 0 ? version : 1;
  return `${code.trim()}_${slug(angle) || 'angle'}_${slug(format) || 'format'}_v${safeVersion}`;
}

function ideaFor(business: BusinessDocument, ideaId: string) {
  const idea = business.explore?.ideas.find((value) => value.id === ideaId);
  if (!idea) throw Error('Explore idea not found.');
  return idea;
}

export function defaultWorkBrief(idea: MarketingIdea) {
  const deliverables: Record<MarketingIdea['kind'], string[]> = {
    research: [
      `Research the strongest candidates or channels for ${idea.title}`,
      'Record sourced findings and a clear recommendation',
    ],
    content: [
      `Draft the first usable version of ${idea.title}`,
      'Review the draft and choose the smallest distribution test',
    ],
    outreach: [
      `Build a small, relevant prospect list for ${idea.title}`,
      'Draft one owner-reviewed outreach message',
    ],
    campaign: [
      `Create a one-page campaign brief for ${idea.title}`,
      'Prepare the first owner-reviewed campaign asset',
    ],
    experiment: [
      `Define the smallest test for ${idea.title}`,
      'Record the result and the next decision',
    ],
    product_improvement: [
      `Create an implementation-ready brief for ${idea.title}`,
      'Define how the improvement will be checked after release',
    ],
  };
  return {
    intendedDeliverables: deliverables[idea.kind],
    effortBudget:
      'Start with one focused work session; require owner approval before any external spend or send.',
    completionCriteria:
      idea.outcome ||
      'The first deliverable is reviewed and the next decision is recorded.',
  };
}

export function selectIdea(
  business: BusinessDocument,
  ideaId: string,
  input: {
    intendedDeliverables: string[];
    effortBudget: string;
    completionCriteria: string;
  },
) {
  const existing = work(business).endeavors.find(
    (value) => value.sourceIdeaId === ideaId && value.status !== 'stopped',
  );
  if (existing) return existing;
  const idea = ideaFor(business, ideaId);
  const at = now();
  const endeavor: Endeavor = {
    id: uid('work'),
    code: '',
    sourceIdeaId: idea.id,
    sourceIdeaSnapshot: structuredClone(idea),
    sourceIdeaUpdatedAt: idea.updatedAt,
    title: idea.title,
    kind: idea.kind,
    description: idea.description,
    ...(idea.audience?.trim() ? { audience: idea.audience.trim() } : {}),
    intendedDeliverables: input.intendedDeliverables,
    effortBudget: input.effortBudget,
    completionCriteria: input.completionCriteria,
    status: 'preparing',
    checklist: input.intendedDeliverables.map((text) => ({
      id: uid('step'),
      text,
      done: false,
    })),
    artifacts: [],
    research: [],
    observations: [],
    createdAt: at,
    updatedAt: at,
  };
  assignCampaignCode(business, endeavor);
  work(business).endeavors.unshift(endeavor);
  addLog(business, `Explore idea selected for Do: ${idea.title} (${endeavor.code}).`);
  return endeavor;
}

export function prepareGuidedProposal(business: BusinessDocument) {
  const proposal = business.guided?.proposal;
  if (!proposal || proposal.status !== 'accepted')
    throw Error('Accept a guided proposal before preparing it in Do.');
  const existing = work(business).endeavors.find(
    (value) => value.sourceGuidedProposalId === proposal.id,
  );
  if (existing) return existing;
  const at = now();
  const endeavor: Endeavor = {
    id: uid('work'),
    code: '',
    sourceGuidedProposalId: proposal.id,
    title: proposal.title,
    kind: 'experiment',
    description: `${proposal.uncertainty} ${proposal.rationale}`,
    ...(proposal.audience?.trim() ? { audience: proposal.audience.trim() } : {}),
    intendedDeliverables: [proposal.action, proposal.measurementPlan],
    effortBudget: `${proposal.ownerContribution}; ${proposal.cost}; ${proposal.timeWindow}`,
    completionCriteria: `${proposal.successRule} Stop: ${proposal.stoppingRule}`,
    evidenceBar: proposedEvidenceBar(proposal),
    status: 'preparing',
    checklist: [proposal.action, proposal.measurementPlan].map((text) => ({
      id: uid('step'),
      text,
      done: false,
    })),
    artifacts: [],
    research: [],
    observations: [],
    createdAt: at,
    updatedAt: at,
  };
  assignCampaignCode(business, endeavor);
  work(business).endeavors.unshift(endeavor);
  addLog(business, `Accepted guided proposal opened in Do: ${proposal.title} (${endeavor.code}).`);
  return endeavor;
}

export function endeavorFor(business: BusinessDocument, endeavorId: string) {
  const endeavor = work(business).endeavors.find(
    (value) => value.id === endeavorId,
  );
  if (!endeavor) throw Error('Do work item not found.');
  return endeavor;
}

const transitions: Record<EndeavorStatus, EndeavorStatus[]> = {
  preparing: ['ready', 'blocked', 'stopped'],
  ready: ['in_progress', 'blocked', 'stopped'],
  in_progress: ['blocked', 'completed', 'stopped'],
  blocked: ['preparing', 'ready', 'in_progress', 'stopped'],
  completed: ['in_progress'],
  stopped: ['preparing'],
};

export function transitionEndeavor(
  business: BusinessDocument,
  endeavorId: string,
  status: EndeavorStatus,
  reason = '',
) {
  const endeavor = endeavorFor(business, endeavorId);
  if (endeavor.status === status) return endeavor;
  if (!transitions[endeavor.status].includes(status))
    throw Error(`Cannot move work from ${endeavor.status} to ${status}.`);
  if (status === 'blocked' && !reason.trim())
    throw Error('Record what is blocking this work.');
  endeavor.status = status;
  if (status === 'in_progress' && endeavor.evidenceBar?.setAt && !endeavor.evidenceBar.startedAt)
    endeavor.evidenceBar.startedAt = now();
  endeavor.blockedReason = status === 'blocked' ? reason.trim() : undefined;
  endeavor.completedAt = status === 'completed' ? now() : undefined;
  endeavor.updatedAt = now();
  addLog(business, `Do work ${status.replace('_', ' ')}: ${endeavor.title}.`);
  return endeavor;
}

export function updateEndeavor(
  business: BusinessDocument,
  endeavorId: string,
  input: {
    title: string;
    description: string;
    intendedDeliverables: string[];
    effortBudget: string;
    completionCriteria: string;
    audience?: string;
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  const { audience, ...rest } = input;
  Object.assign(endeavor, rest, { updatedAt: now() });
  if (audience !== undefined) endeavor.audience = audience.trim() || undefined;
  addLog(business, `Do brief updated: ${endeavor.title}.`);
  return endeavor;
}

const successMetrics: EvidenceBar['successMetric'][] = [
  'conversations',
  'spend',
  'leads',
  'qualified',
  'deals',
  'revenue',
  'churned',
];
export const isSuccessMetric = (value: unknown): value is EvidenceBar['successMetric'] =>
  typeof value === 'string' && (successMetrics as string[]).includes(value);

const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Set or replace the evidence bar. Changing a confirmed bar after the clock
 * started is allowed and logged, because moving the goalposts is exactly what
 * the memo should mention.
 */
export function setEvidenceBar(
  business: BusinessDocument,
  endeavorId: string,
  input: {
    successMetric: EvidenceBar['successMetric'];
    successTarget: number;
    maxSpend?: number;
    maxDays?: number;
    maxContacts?: number;
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  if (endeavor.status === 'completed' || endeavor.status === 'stopped')
    throw Error('Reopen this work before setting its evidence bar.');
  if (!isSuccessMetric(input.successMetric)) throw Error('Choose what counts as a win.');
  if (!positive(input.successTarget)) throw Error('The win target must be a positive number.');
  for (const key of ['maxSpend', 'maxDays', 'maxContacts'] as const)
    if (input[key] !== undefined && !positive(input[key]))
      throw Error('Limits must be positive numbers.');
  if (input.maxDays !== undefined && !Number.isInteger(input.maxDays))
    throw Error('The day limit must be a whole number.');
  if (input.maxContacts !== undefined && !Number.isInteger(input.maxContacts))
    throw Error('The contact limit must be a whole number.');
  if (input.maxSpend === undefined && input.maxDays === undefined && input.maxContacts === undefined)
    throw Error('Set at least one limit: spend, days, or contacts.');
  const previous = endeavor.evidenceBar?.setAt ? endeavor.evidenceBar : undefined;
  const at = now();
  const startedAt =
    previous?.startedAt || (endeavor.status === 'in_progress' ? at : undefined);
  const bar: EvidenceBar = {
    successMetric: input.successMetric,
    successTarget: input.successTarget,
    ...(input.maxSpend !== undefined ? { maxSpend: input.maxSpend } : {}),
    ...(input.maxDays !== undefined ? { maxDays: input.maxDays } : {}),
    ...(input.maxContacts !== undefined ? { maxContacts: input.maxContacts } : {}),
    ...(startedAt ? { startedAt } : {}),
    setAt: previous?.setAt || at,
  };
  const changed =
    previous &&
    JSON.stringify({ ...previous, setAt: '', startedAt: '', revisedAt: '' }) !==
      JSON.stringify({ ...bar, setAt: '', startedAt: '', revisedAt: '' });
  if (changed && previous.startedAt) {
    bar.revisedAt = at;
    const days = Math.floor((Date.parse(at) - Date.parse(previous.startedAt)) / 86_400_000);
    addLog(business, `Evidence bar changed for ${endeavor.code} after ${days} day${days === 1 ? '' : 's'} of activity.`);
  } else {
    if (previous?.revisedAt) bar.revisedAt = previous.revisedAt;
    addLog(business, `Evidence bar ${previous ? 'updated' : 'set'} for ${endeavor.code}.`);
  }
  endeavor.evidenceBar = bar;
  endeavor.updatedAt = at;
  return bar;
}

const metricWords: [RegExp, EvidenceBar['successMetric']][] = [
  [/^conversations?\b|^calls?\b|^meetings?\b/i, 'conversations'],
  [/^qualified\b/i, 'qualified'],
  [/^leads?\b|^sign-?ups?\b/i, 'leads'],
  [/^deals?\b|^sales?\b/i, 'deals'],
];
const amount = (text: string) => {
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

/**
 * A proposed bar parsed from a guided experiment's own words. It never guesses:
 * anything it cannot read stays empty, and setAt stays empty until the owner
 * confirms. Returns undefined when no metric and target can be read.
 */
export function proposedEvidenceBar(
  proposal: Pick<GuidedExperiment, 'successRule' | 'cost' | 'timeWindow'>,
): EvidenceBar | undefined {
  const rule = proposal.successRule.replace(/,/g, '');
  const match = rule.match(/(\d+(?:\.\d+)?)\s+(?:or more\s+|\+\s*)?([a-z-]+(?:\s+[a-z-]+)?)/i);
  if (!match) return undefined;
  const target = Number(match[1]);
  const metric = metricWords.find(([pattern]) => pattern.test(match[2]))?.[1];
  if (!metric || !positive(target)) return undefined;
  const bar: EvidenceBar = { successMetric: metric, successTarget: target, setAt: '' };
  if (/[$€£]|usd|dollars?/i.test(proposal.cost)) {
    const spend = amount(proposal.cost);
    if (positive(spend)) bar.maxSpend = spend;
  }
  const window = proposal.timeWindow.match(/(\d+)\s*(day|week)s?/i);
  if (window) {
    const days = Number(window[1]) * (window[2].toLowerCase() === 'week' ? 7 : 1);
    if (positive(days)) bar.maxDays = days;
  }
  return bar;
}

export function setAudience(business: BusinessDocument, endeavorId: string, audience: string) {
  const endeavor = endeavorFor(business, endeavorId);
  endeavor.audience = audience.trim() || undefined;
  endeavor.updatedAt = now();
  addLog(business, `Audience ${endeavor.audience ? 'set' : 'cleared'} for ${endeavor.code}.`);
  return endeavor;
}

export function setChecklistItem(
  business: BusinessDocument,
  endeavorId: string,
  itemId: string,
  done: boolean,
) {
  const endeavor = endeavorFor(business, endeavorId);
  const item = endeavor.checklist.find((value) => value.id === itemId);
  if (!item) throw Error('Checklist item not found.');
  item.done = done;
  endeavor.updatedAt = now();
  return item;
}

export function addChecklistItem(
  business: BusinessDocument,
  endeavorId: string,
  text: string,
) {
  const endeavor = endeavorFor(business, endeavorId);
  const item = { id: uid('step'), text, done: false };
  endeavor.checklist.push(item);
  endeavor.updatedAt = now();
  return item;
}

export function saveArtifact(
  business: BusinessDocument,
  endeavorId: string,
  input: {
    artifactId?: string;
    kind: ArtifactKind;
    title: string;
    content: string;
    source: 'owner' | 'assistant';
    sourceEvidence?: string[];
    data?: string;
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  const at = now();
  let artifact: WorkArtifact | undefined = input.artifactId
    ? endeavor.artifacts.find((value) => value.id === input.artifactId)
    : undefined;
  if (input.artifactId && !artifact) throw Error('Artifact not found.');
  const version = {
    id: uid('version'),
    number: (artifact?.versions.at(-1)?.number || 0) + 1,
    content: input.content,
    source: input.source,
    createdAt: at,
    ...(input.data && input.source === 'assistant' && input.data.length <= 20_000 ? { data: input.data } : {}),
  };
  if (!artifact) {
    artifact = {
      id: uid('artifact'),
      kind: input.kind,
      title: input.title,
      versions: [version],
      activeVersionId: version.id,
      createdAt: at,
      updatedAt: at,
      sourceEvidence: input.sourceEvidence?.slice(0, 50),
    };
    endeavor.artifacts.push(artifact);
  } else {
    artifact.title = input.title;
    artifact.kind = input.kind;
    artifact.versions.push(version);
    artifact.activeVersionId = version.id;
    artifact.reviewedAt = undefined;
    artifact.sourceEvidence = input.sourceEvidence?.slice(0, 50);
    artifact.updatedAt = at;
  }
  endeavor.updatedAt = at;
  addLog(business, `Artifact version saved: ${artifact.title}.`);
  return artifact;
}

/**
 * Import a completed runner job's text as an unreviewed artifact version.
 * Idempotent per job: the job reference in sourceEvidence marks prior imports.
 */
export function importRunnerResult(
  business: BusinessDocument,
  endeavorId: string,
  jobId: string,
  result: unknown,
) {
  const endeavor = endeavorFor(business, endeavorId);
  const reference = `runner-job:${jobId}`;
  if (endeavor.artifacts.some((item) => item.sourceEvidence?.includes(reference)))
    return null;
  const value =
    result && typeof result === 'object' && 'text' in result
      ? (result as { text: unknown }).text
      : result;
  const content = (typeof value === 'string' ? value : '').trim();
  if (!content) return null;
  const kind: ArtifactKind =
    endeavor.kind === 'research'
      ? 'research_notes'
      : endeavor.kind === 'outreach'
        ? 'outreach'
        : endeavor.kind === 'product_improvement'
          ? 'product_brief'
          : 'content';
  return saveArtifact(business, endeavorId, {
    kind,
    title: `Runner result: ${endeavor.title}`.slice(0, 160),
    content: content.slice(0, 60_000),
    source: 'assistant',
    sourceEvidence: [reference],
  });
}

export function reviewArtifact(
  business: BusinessDocument,
  endeavorId: string,
  artifactId: string,
) {
  const endeavor = endeavorFor(business, endeavorId);
  const artifact = endeavor.artifacts.find((value) => value.id === artifactId);
  if (!artifact) throw Error('Artifact not found.');
  artifact.reviewedAt = now();
  artifact.updatedAt = artifact.reviewedAt;
  addLog(business, `Artifact reviewed: ${artifact.title}.`);
  return artifact;
}

export function addResearchCandidates(
  business: BusinessDocument,
  endeavorId: string,
  candidates: Omit<ResearchCandidate, 'id' | 'status'>[],
) {
  const endeavor = endeavorFor(business, endeavorId);
  const existing = new Set(endeavor.research.map((value) => value.url));
  const added = candidates
    .filter((value) => {
      if (existing.has(value.url)) return false;
      existing.add(value.url);
      return true;
    })
    .map((value) => ({ ...value, id: uid('candidate'), status: 'unreviewed' as const }));
  endeavor.research.push(...added);
  endeavor.updatedAt = now();
  addLog(business, `${added.length} sourced research candidate${added.length === 1 ? '' : 's'} added to ${endeavor.title}.`);
  return added;
}

export function reviewResearchCandidate(
  business: BusinessDocument,
  endeavorId: string,
  candidateId: string,
  status: ResearchCandidate['status'],
  reason = '',
) {
  const endeavor = endeavorFor(business, endeavorId);
  const candidate = endeavor.research.find((value) => value.id === candidateId);
  if (!candidate) throw Error('Research candidate not found.');
  if (status === 'rejected' && !reason.trim())
    throw Error('Record why this candidate was rejected.');
  candidate.status = status;
  candidate.rejectionReason = status === 'rejected' ? reason.trim() : undefined;
  endeavor.updatedAt = now();
  return candidate;
}

export function addObservation(
  business: BusinessDocument,
  endeavorId: string,
  input: {
    summary: string;
    evidenceUrls: string[];
    observedAt: string;
    source: string;
    actualEffort: string;
    nextDecision: string;
    verdict?: 'repeat' | 'adjust' | 'drop' | 'unknown';
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  const observation = { id: uid('observation'), ...input };
  endeavor.observations.unshift(observation);
  endeavor.updatedAt = now();
  if (endeavor.sourceIdeaId) {
    const idea = ideaFor(business, endeavor.sourceIdeaId);
    business.explore ||= { ideas: [], messages: [] };
    business.explore.messages.push({
      id: uid('msg'),
      role: 'assistant',
      ideaId: idea.id,
      content: `Observed result from Do — ${input.summary} Next decision: ${input.nextDecision}`,
      createdAt: observation.observedAt,
    });
  }
  addLog(business, `Observation recorded for ${endeavor.title}.`);
  return observation;
}

export function setPortfolio(
  business: BusinessDocument,
  value: Omit<PortfolioState, 'updatedAt'>,
) {
  business.portfolio = { ...value, updatedAt: now() };
  addLog(business, `Portfolio priority set to ${value.priority}.`);
  return business.portfolio;
}

export function sourceIdeaChanged(business: BusinessDocument, endeavor: Endeavor) {
  if (!endeavor.sourceIdeaId) return false;
  const idea = business.explore?.ideas.find((value) => value.id === endeavor.sourceIdeaId);
  return !!idea && (
    idea.updatedAt !== endeavor.sourceIdeaUpdatedAt ||
    JSON.stringify(idea) !== JSON.stringify(endeavor.sourceIdeaSnapshot)
  );
}

export function activeArtifact(artifact: WorkArtifact) {
  return artifact.versions.find((value) => value.id === artifact.activeVersionId) || artifact.versions.at(-1);
}

export function snapshotIdea(idea: MarketingIdea) {
  return structuredClone(idea);
}
