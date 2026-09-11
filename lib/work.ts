import {
  addLog,
  uid,
  type ArtifactKind,
  type BusinessDocument,
  type Endeavor,
  type EndeavorStatus,
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

function ideaFor(business: BusinessDocument, ideaId: string) {
  const idea = business.explore?.ideas.find((value) => value.id === ideaId);
  if (!idea) throw Error('Explore idea not found.');
  return idea;
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
    sourceIdeaId: idea.id,
    sourceIdeaSnapshot: structuredClone(idea),
    sourceIdeaUpdatedAt: idea.updatedAt,
    title: idea.title,
    kind: idea.kind,
    description: idea.description,
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
  work(business).endeavors.unshift(endeavor);
  addLog(business, `Explore idea selected for Do: ${idea.title}.`);
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
    sourceGuidedProposalId: proposal.id,
    title: proposal.title,
    kind: 'experiment',
    description: `${proposal.uncertainty} ${proposal.rationale}`,
    intendedDeliverables: [proposal.action, proposal.measurementPlan],
    effortBudget: `${proposal.ownerContribution}; ${proposal.cost}; ${proposal.timeWindow}`,
    completionCriteria: `${proposal.successRule} Stop: ${proposal.stoppingRule}`,
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
  work(business).endeavors.unshift(endeavor);
  addLog(business, `Accepted guided proposal opened in Do: ${proposal.title}.`);
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
  },
) {
  const endeavor = endeavorFor(business, endeavorId);
  Object.assign(endeavor, input, { updatedAt: now() });
  addLog(business, `Do brief updated: ${endeavor.title}.`);
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
    };
    endeavor.artifacts.push(artifact);
  } else {
    artifact.title = input.title;
    artifact.kind = input.kind;
    artifact.versions.push(version);
    artifact.activeVersionId = version.id;
    artifact.reviewedAt = undefined;
    artifact.updatedAt = at;
  }
  endeavor.updatedAt = at;
  addLog(business, `Artifact version saved: ${artifact.title}.`);
  return artifact;
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
