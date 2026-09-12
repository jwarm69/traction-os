export type Provenance = {
  source: string;
  observedAt: string;
  confidence: 'low' | 'medium' | 'high';
};
export type Fact = Provenance & {
  id: string;
  label: string;
  value: string;
  status: 'unreviewed' | 'confirmed' | 'corrected';
};
export type Signal = Provenance & {
  id: string;
  metric: string;
  value: number;
  period: string;
  note: string;
};
export type Diagnosis = {
  bottleneck: string;
  evidence: string[];
  unknowns: string[];
  recommendation: string;
  generatedAt: string;
};
export type Experiment = {
  id: string;
  channel: string;
  hypothesis: string;
  action: string;
  metric: string;
  target: number;
  status: 'draft' | 'running' | 'complete';
  startedAt?: string;
  endedAt?: string;
  result?: number;
  evidence?: string;
  learning?: string;
};
export type ExperimentProposal = Pick<
  Experiment,
  'channel' | 'hypothesis' | 'action' | 'metric' | 'target'
>;
export type Round = {
  id: string;
  name: string;
  createdAt: string;
  status: 'planning' | 'active' | 'complete';
  experiments: Experiment[];
  briefSnapshot?: {
    goal: string;
    budget: string;
    notes: string;
    facts: Fact[];
    diagnosis: Diagnosis;
  };
  rationale?: string;
};
export type Review = {
  id: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  summary: string;
  wins: string[];
  misses: string[];
  decisions: string[];
  nextReviewDue: string;
};
export type Prospect = {
  id: string;
  name: string;
  email: string;
  company: string;
  reason: string;
  source: string;
  addedAt: string;
  status:
    | 'new'
    | 'drafted'
    | 'approved'
    | 'sending'
    | 'sent'
    | 'replied'
    | 'failed'
    | 'uncertain';
  approvedAt?: string;
  approvedFrom?: string;
  messageId?: string;
  gmailId?: string;
  threadId?: string;
  sentAt?: string;
  sendAttemptedAt?: string;
  replyCount?: number;
  lastReplyAt?: string | null;
  snippets?: string[];
  error?: string;
};
export type OutreachDraft = {
  prospectId: string;
  subject: string;
  body: string;
  createdAt: string;
  reviewedAt?: string;
};
export type BriefFieldKey =
  | 'offer'
  | 'audience'
  | 'readiness'
  | 'objective'
  | 'resources';
export type BriefField = {
  value: string;
  source: 'owner' | 'research' | 'legacy_proposal' | 'unknown';
  confirmed: boolean;
};
export type BusinessBriefVersion = {
  id: string;
  number: number;
  createdAt: string;
  ownerNotes: string;
  fields: Record<BriefFieldKey, BriefField>;
};
export type GuidedExperiment = {
  id: string;
  briefVersionId: string;
  title: string;
  uncertainty: string;
  rationale: string;
  audience: string;
  action: string;
  ownerContribution: string;
  timeWindow: string;
  cost: string;
  metric: string;
  successRule: string;
  stoppingRule: string;
  measurementPlan: string;
  alternatives: string[];
  status: 'proposed' | 'accepted';
  createdAt: string;
  acceptedAt?: string;
};
export type GuidedFlow = {
  step: 'understanding' | 'outcome' | 'decision' | 'proposal' | 'complete';
  draft: {
    fields: Record<BriefFieldKey, BriefField>;
    ownerNotes: string;
    savedAt: string;
    decisionDraft?: { hypothesis: string; nextObservation: string };
  };
  briefVersions: BusinessBriefVersion[];
  activeBriefVersionId?: string;
  diagnosis?: {
    hypothesis: string;
    evidence: string[];
    alternatives: string[];
    nextObservation: string;
    confidence: 'low' | 'medium' | 'high';
    agreedAt: string;
  };
  proposal?: GuidedExperiment;
  proposalHistory?: GuidedExperiment[];
  contextChangeNotice?: string;
  updatedAt: string;
};
export type IdeaKind =
  | 'research'
  | 'content'
  | 'outreach'
  | 'campaign'
  | 'experiment'
  | 'product_improvement';
export type ExploreSuggestion = {
  title: string;
  kind: IdeaKind;
  description: string;
  audience: string;
  outcome: string;
};
export type MarketingIdea = ExploreSuggestion & {
  id: string;
  ownerNotes: string;
  sources: string[];
  status: 'active' | 'parked';
  parkedReason?: string;
  createdAt: string;
  updatedAt: string;
};
export type ExploreMessage = {
  id: string;
  role: 'owner' | 'assistant';
  content: string;
  createdAt: string;
  ideaId?: string;
  suggestions?: ExploreSuggestion[];
  recommendedSuggestionIndex?: number;
  recommendationReason?: string;
  nextQuestion?: string;
};
export type ExploreState = {
  ideas: MarketingIdea[];
  messages: ExploreMessage[];
};
export type EndeavorStatus =
  | 'preparing'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'stopped';
export type ArtifactKind =
  | 'content'
  | 'outreach'
  | 'research_notes'
  | 'product_brief';
export type ArtifactVersion = {
  id: string;
  number: number;
  content: string;
  createdAt: string;
  source: 'owner' | 'assistant';
};
export type WorkArtifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  versions: ArtifactVersion[];
  activeVersionId: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type ResearchCandidate = {
  id: string;
  name: string;
  url: string;
  retrievedAt: string;
  observedFacts: string[];
  fitRationale: string;
  uncertainties: string[];
  status: 'unreviewed' | 'shortlisted' | 'rejected';
  rejectionReason?: string;
};
export type WorkObservation = {
  id: string;
  summary: string;
  evidenceUrls: string[];
  observedAt: string;
  source: string;
  actualEffort: string;
  nextDecision: string;
};
export type Endeavor = {
  id: string;
  sourceIdeaId?: string;
  sourceGuidedProposalId?: string;
  sourceIdeaSnapshot?: MarketingIdea;
  sourceIdeaUpdatedAt?: string;
  title: string;
  kind: IdeaKind;
  description: string;
  intendedDeliverables: string[];
  effortBudget: string;
  completionCriteria: string;
  status: EndeavorStatus;
  blockedReason?: string;
  checklist: { id: string; text: string; done: boolean }[];
  artifacts: WorkArtifact[];
  research: ResearchCandidate[];
  observations: WorkObservation[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
export type PortfolioState = {
  priority: 'now' | 'next' | 'maintain' | 'paused';
  ownerHours: number | null;
  note: string;
  updatedAt: string;
};
export type WorkState = { endeavors: Endeavor[] };
export type BusinessDocument = {
  version: 2;
  id: string;
  name: string;
  url: string;
  mode: 'demo' | 'live';
  createdAt: string;
  updatedAt: string;
  goal: string;
  budget: string;
  notes: string;
  contextDraft?: { summary: string; questions: string[]; generatedAt: string };
  guided?: GuidedFlow;
  explore?: ExploreState;
  work?: WorkState;
  portfolio?: PortfolioState;
  facts: Fact[];
  signals: Signal[];
  diagnosis?: Diagnosis;
  rounds: Round[];
  reviews: Review[];
  outreach: { prospects: Prospect[]; drafts: OutreachDraft[] };
  log: { text: string; at: string }[];
};

const iso = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export function addLog(business: BusinessDocument, text: string) {
  const at = iso();
  business.log.unshift({ text, at });
  business.updatedAt = at;
}

const briefKeys: BriefFieldKey[] = [
  'offer',
  'audience',
  'readiness',
  'objective',
  'resources',
];
const blankField = (): BriefField => ({
  value: '',
  source: 'unknown',
  confirmed: false,
});
export function ensureGuided(business: BusinessDocument): GuidedFlow {
  if (business.guided) return business.guided;
  const find = (pattern: RegExp) =>
    business.facts.find((fact) => pattern.test(fact.label));
  const fromFact = (fact?: Fact): BriefField =>
    fact
      ? {
          value: fact.value,
          source: fact.source === 'Owner input' ? 'owner' : 'research',
          confirmed: fact.status !== 'unreviewed',
        }
      : blankField();
  const now = iso();
  business.guided = {
    step: 'understanding',
    draft: {
      fields: {
        offer: fromFact(find(/offer|product|service/i)),
        audience: fromFact(find(/audience|customer|buyer|user/i)),
        readiness: fromFact(find(/readiness|available|workflow|capabilit/i)),
        objective: business.goal
          ? { value: business.goal, source: 'legacy_proposal', confirmed: false }
          : blankField(),
        resources: business.budget
          ? { value: business.budget, source: 'legacy_proposal', confirmed: false }
          : blankField(),
      },
      ownerNotes: business.notes,
      savedAt: now,
    },
    briefVersions: [],
    updatedAt: now,
  };
  return business.guided;
}

export function saveGuidedDraft(
  business: BusinessDocument,
  values: Record<BriefFieldKey, string>,
  confirmations: Partial<Record<BriefFieldKey, boolean>>,
  ownerNotes: string,
) {
  const flow = ensureGuided(business);
  for (const key of briefKeys) {
    const value = values[key]?.trim() || '';
    const prior = flow.draft.fields[key];
    const changed = value !== prior.value;
    flow.draft.fields[key] = {
      value,
      source: changed ? (value ? 'owner' : 'unknown') : prior.source,
      confirmed: value ? Boolean(confirmations[key]) : false,
    };
  }
  flow.draft.ownerNotes = ownerNotes.trim();
  flow.draft.savedAt = iso();
  flow.updatedAt = flow.draft.savedAt;
  addLog(business, 'Guided business draft saved.');
  return flow;
}

export function confirmGuidedBrief(business: BusinessDocument) {
  const flow = ensureGuided(business);
  for (const key of briefKeys) {
    const field = flow.draft.fields[key];
    if (!field.value || !field.confirmed)
      throw Error(`Confirm ${key} before continuing.`);
  }
  const now = iso();
  const version: BusinessBriefVersion = {
    id: uid('brief'),
    number: (flow.briefVersions.at(-1)?.number || 0) + 1,
    createdAt: now,
    ownerNotes: flow.draft.ownerNotes,
    fields: structuredClone(flow.draft.fields),
  };
  flow.briefVersions.push(version);
  flow.activeBriefVersionId = version.id;
  flow.step = 'decision';
  if (
    flow.proposal &&
    !(flow.proposalHistory || []).some((item) => item.id === flow.proposal?.id)
  )
    (flow.proposalHistory ||= []).push(structuredClone(flow.proposal));
  flow.proposal = undefined;
  flow.diagnosis = undefined;
  flow.updatedAt = now;
  flow.contextChangeNotice = undefined;
  addLog(business, `Business brief version ${version.number} confirmed by owner.`);
  return version;
}

export function agreeGuidedDiagnosis(
  business: BusinessDocument,
  diagnosis: NonNullable<GuidedFlow['diagnosis']>,
) {
  const flow = ensureGuided(business);
  if (!flow.activeBriefVersionId) throw Error('Confirm the business brief first.');
  if (
    flow.proposal &&
    !(flow.proposalHistory || []).some((item) => item.id === flow.proposal?.id)
  )
    (flow.proposalHistory ||= []).push(structuredClone(flow.proposal));
  flow.diagnosis = diagnosis;
  flow.proposal = undefined;
  flow.step = 'proposal';
  flow.updatedAt = iso();
  addLog(business, 'Owner agreed on the uncertainty to test.');
}

export function saveGuidedDecisionDraft(
  business: BusinessDocument,
  hypothesis: string,
  nextObservation: string,
) {
  const flow = ensureGuided(business);
  flow.draft.decisionDraft = {
    hypothesis: hypothesis.trim(),
    nextObservation: nextObservation.trim(),
  };
  flow.draft.savedAt = iso();
  flow.updatedAt = flow.draft.savedAt;
  addLog(business, 'Decision draft saved.');
}

export function guidedDraftMatchesActive(flow: GuidedFlow) {
  const active = flow.briefVersions.find(
    (version) => version.id === flow.activeBriefVersionId,
  );
  return Boolean(
    active &&
      !briefKeys.some(
        (key) =>
          active.fields[key].value !== flow.draft.fields[key].value ||
          active.fields[key].confirmed !== flow.draft.fields[key].confirmed,
      ) &&
      active.ownerNotes === flow.draft.ownerNotes,
  );
}

export function invalidateGuidedBrief(business: BusinessDocument) {
  const flow = business.guided;
  if (!flow?.activeBriefVersionId) return;
  if (
    flow.proposal &&
    !(flow.proposalHistory || []).some((item) => item.id === flow.proposal?.id)
  )
    (flow.proposalHistory ||= []).push(structuredClone(flow.proposal));
  flow.proposal = undefined;
  flow.diagnosis = undefined;
  flow.activeBriefVersionId = undefined;
  flow.step = 'understanding';
  for (const key of briefKeys) flow.draft.fields[key].confirmed = false;
  if (business.notes && !flow.draft.ownerNotes.includes(business.notes))
    flow.draft.ownerNotes = [flow.draft.ownerNotes, business.notes]
      .filter(Boolean)
      .join('\n\n');
  flow.draft.savedAt = iso();
  flow.contextChangeNotice =
    'Business context changed outside this guide. Review and reconfirm these answers before planning.';
  flow.updatedAt = iso();
}

export function setGuidedProposal(
  business: BusinessDocument,
  proposal: Omit<GuidedExperiment, 'id' | 'briefVersionId' | 'status' | 'createdAt'>,
) {
  const flow = ensureGuided(business);
  if (!flow.activeBriefVersionId || !flow.diagnosis)
    throw Error('Agree on the business brief and decision first.');
  if (!guidedDraftMatchesActive(flow))
    throw Error('The draft changed after this brief. Confirm a new version before proposing an experiment.');
  for (const value of Object.values(proposal)) {
    if (typeof value === 'string' && !value.trim())
      throw Error('The experiment proposal is incomplete.');
  }
  if (!proposal.alternatives.length)
    throw Error('Explain at least one alternative before proposing the experiment.');
  if (
    flow.proposal &&
    !(flow.proposalHistory || []).some((item) => item.id === flow.proposal?.id)
  )
    (flow.proposalHistory ||= []).push(structuredClone(flow.proposal));
  flow.proposal = {
    ...proposal,
    id: uid('guided_exp'),
    briefVersionId: flow.activeBriefVersionId,
    status: 'proposed',
    createdAt: iso(),
  };
  flow.updatedAt = iso();
  addLog(business, 'One bounded experiment proposed for owner review.');
  return flow.proposal;
}

export function acceptGuidedProposal(business: BusinessDocument) {
  const flow = ensureGuided(business);
  if (!flow.proposal) throw Error('Create an experiment proposal first.');
  if (flow.proposal.briefVersionId !== flow.activeBriefVersionId)
    throw Error('The proposal uses an older brief. Regenerate it before accepting.');
  if (!guidedDraftMatchesActive(flow))
    throw Error('The draft changed after this proposal. Confirm a new brief before accepting it.');
  flow.proposal.status = 'accepted';
  flow.proposal.acceptedAt = iso();
  flow.step = 'complete';
  flow.updatedAt = iso();
  addLog(business, 'Guided experiment accepted. Preparation remains pending.');
}

export function demoBusiness(): BusinessDocument {
  const now = iso();
  const facts: [string, string, Provenance['confidence']][] = [
    [
      'Offer',
      'Monthly bookkeeping and cash-flow guidance for creative agencies.',
      'high',
    ],
    [
      'Ideal customer',
      'US creative agency owners with 5–20 employees.',
      'medium',
    ],
    [
      'Current traction',
      'Most customers arrive through founder referrals.',
      'medium',
    ],
  ];
  return {
    version: 2,
    id: uid('biz'),
    name: 'Cedar & Co.',
    url: 'https://cedar.example',
    mode: 'demo',
    createdAt: now,
    updatedAt: now,
    goal: 'Book 5 qualified discovery calls in 30 days',
    budget: '$300 and 4 hours per week',
    notes: 'Fictional demo business.',
    facts: facts.map(([label, value, confidence]) => ({
      id: uid('fact'),
      label,
      value,
      source: 'Fictional demo brief',
      observedAt: now,
      confidence,
      status: 'unreviewed',
    })),
    signals: [
      {
        id: uid('sig'),
        metric: 'Qualified conversations',
        value: 2,
        period: 'Last 30 days',
        note: 'Owner-entered demo signal',
        source: 'Fictional demo data',
        observedAt: now,
        confidence: 'low',
      },
    ],
    rounds: [],
    reviews: [],
    outreach: { prospects: [], drafts: [] },
    log: [
      { text: 'Fictional demo loaded. No live research or messages.', at: now },
    ],
  };
}

// Diagnose only the observed funnel. Missing values never become zero, and
// metrics from different reporting periods cannot establish a conversion gap.
export function diagnose(business: BusinessDocument): Diagnosis {
  const signals = [...business.signals]
    .filter((s) => Number.isFinite(s.value) && s.value >= 0)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const demand = signals.find((s) =>
    /^(sessions|visitors|website visitors|traffic|active users)$/i.test(
      s.metric.trim(),
    ),
  );
  const conversion = signals.find((s) =>
    /^(qualified (conversations|leads|calls)|leads|new customers|sales|conversions|booked calls)$/i.test(
      s.metric.trim(),
    ),
  );
  const churn = signals.find((s) =>
    /^(churned customers|lost customers|cancellations)$/i.test(s.metric.trim()),
  );
  const unknowns: string[] = [];
  if (!demand)
    unknowns.push('Traffic or audience reach has not been measured.');
  if (!conversion)
    unknowns.push(
      'Qualified leads or conversions have not been measured; their value is unknown.',
    );
  if (
    demand &&
    conversion &&
    demand.period.trim().toLowerCase() !==
      conversion.period.trim().toLowerCase()
  )
    unknowns.push(
      'Demand and conversion metrics cover different periods; no conversion rate can be inferred.',
    );
  if (business.facts.some((f) => f.status === 'unreviewed'))
    unknowns.push('Some research facts still need owner confirmation.');
  if (signals.some((s) => s.confidence === 'low'))
    unknowns.push(
      'Some evidence is low confidence; verify it before increasing spend.',
    );
  unknowns.push(
    'Channel attribution and cost per qualified outcome are not yet established by these totals.',
  );
  let bottleneck = 'Evidence gap';
  let recommendation =
    'Measure demand and qualified outcomes for the same date range, then run one small test. Current evidence cannot locate the bottleneck.';
  const samePeriod =
    demand &&
    conversion &&
    demand.period.trim().toLowerCase() ===
      conversion.period.trim().toLowerCase();
  if (samePeriod && demand.value > 0 && conversion.value === 0) {
    bottleneck = 'Possible conversion gap';
    recommendation =
      'Verify conversion tracking, then test one clearer offer and call to action. Observed traffic with zero recorded outcomes is a clue, not proof of the cause.';
  } else if (samePeriod && demand.value === 0 && conversion.value === 0) {
    bottleneck = 'Possible demand gap';
    recommendation =
      'Verify traffic tracking and test one tightly scoped audience channel before investing in a larger campaign.';
  } else if (conversion && conversion.value > 0) {
    bottleneck = 'Acquisition repeatability to test';
    recommendation =
      'Trace the observed qualified outcomes to their source. Repeat a small version of that channel and measure cost and effort; these totals alone do not prove which channel works.';
  }
  if (churn && churn.value > 0) {
    unknowns.push(
      `${churn.value} lost customers were recorded for ${churn.period}; customer base size and cancellation reasons are needed to judge retention.`,
    );
  }
  const diagnosis: Diagnosis = {
    bottleneck,
    evidence: signals
      .slice(0, 8)
      .map(
        (s) =>
          `${s.metric}: ${s.value} (${s.period}; ${s.source}; observed ${s.observedAt.slice(0, 10)}; ${s.confidence} confidence)`,
      ),
    unknowns,
    recommendation,
    generatedAt: iso(),
  };
  business.diagnosis = diagnosis;
  addLog(business, `Bottleneck diagnosis updated: ${bottleneck}.`);
  return diagnosis;
}

export function createRound(
  business: BusinessDocument,
  name: string,
  proposals?: ExperimentProposal[],
): Round {
  if (business.rounds.some((r) => r.status !== 'complete'))
    throw new Error('Close the current round before starting another.');
  if (!business.goal.trim() || !business.budget.trim())
    throw new Error('Set a goal and a time or money budget before planning.');
  if (!business.facts.some((f) => f.status !== 'unreviewed'))
    throw new Error('Confirm at least one business fact before planning.');
  const diagnosis = diagnose(business);
  const completed = business.rounds
    .flatMap((r) => r.experiments)
    .filter((e) => e.status === 'complete' && Number.isFinite(e.result));
  const previous = new Map(completed.map((e) => [e.channel, e]));
  const audience =
    business.facts.find(
      (f) =>
        f.status !== 'unreviewed' && /customer|audience|buyer/i.test(f.label),
    )?.value || 'the owner-confirmed target audience';
  const choices: ExperimentProposal[] = proposals || [
    {
      channel: 'Founder-led email outreach',
      hypothesis: `A personal, researched message to ${audience} can generate qualified replies.`,
      action:
        'Research ten relevant prospects, cite why each fits, and prepare individual messages for owner approval. Track positive replies separately from all replies.',
      metric: 'Positive replies',
      target: 3,
    },
    {
      channel: 'Customer referrals',
      hypothesis:
        'A specific introduction request to existing advocates can produce qualified conversations.',
      action:
        'Owner: select five customers or trusted contacts who can credibly recommend the offer. Prepare a short introduction request and log the responses.',
      metric: 'Qualified introductions',
      target: 2,
    },
    {
      channel: 'Offer page conversations',
      hypothesis:
        'A clearer offer and one concrete call to action can turn interested visitors into conversations.',
      action:
        'Draft one headline, proof point, and call to action using confirmed business facts. Owner: publish the approved copy and record visits and qualified conversations for the same period.',
      metric: 'Qualified conversations',
      target: 3,
    },
    {
      channel: 'Partner introductions',
      hypothesis:
        'A complementary service provider already reaching this audience may refer suitable buyers.',
      action:
        'Research five complementary providers and draft a specific mutual referral proposal. Owner: approve partners and contact details before any outreach.',
      metric: 'Partner conversations',
      target: 2,
    },
    {
      channel: 'Founder expertise content',
      hypothesis:
        'A useful answer to one narrow customer problem can start relevant sales conversations.',
      action:
        'Draft one practical post grounded in the confirmed offer. Owner: choose an existing audience, publish the approved post, and record qualified inbound conversations.',
      metric: 'Qualified inbound conversations',
      target: 2,
    },
  ];
  if (choices.length < 3 || choices.length > 8)
    throw new Error('A round needs three to eight channel suggestions.');
  for (const choice of choices) {
    if (
      ![choice.channel, choice.hypothesis, choice.action, choice.metric].every(
        (s) => typeof s === 'string' && s.trim(),
      ) ||
      !Number.isFinite(choice.target) ||
      choice.target <= 0
    )
      throw new Error(
        'Every experiment needs a channel, hypothesis, action, metric, and positive target.',
      );
  }
  const experiments: Experiment[] = choices.map((choice) => {
    const last = previous.get(choice.channel);
    const adaptation =
      !proposals && last
        ? last.result! >= last.target
          ? ` Prior test met its target (${last.result}/${last.target} ${last.metric}); repeat its recorded approach with one controlled audience change. Owner learning: ${last.learning || last.evidence || 'not recorded'}.`
          : ` Prior test missed its target (${last.result}/${last.target} ${last.metric}); review the evidence and change one element before retrying. Owner learning: ${last.learning || last.evidence || 'not recorded'}.`
        : '';
    return {
      ...choice,
      action: choice.action + adaptation,
      id: uid('exp'),
      status: 'draft',
    };
  });
  const round: Round = {
    id: uid('round'),
    name: name.trim() || `Round ${business.rounds.length + 1}`,
    createdAt: iso(),
    status: 'planning',
    experiments,
    briefSnapshot: structuredClone({
      goal: business.goal,
      budget: business.budget,
      notes: business.notes,
      facts: business.facts.filter((f) => f.status !== 'unreviewed'),
      diagnosis,
    }),
    rationale: `${completed.length} prior completed tests considered. Pick one or two suggestions within ${business.budget}. Targets are test commitments, not forecasts.${business.mode === 'demo' ? ' Demo suggestions use a local template adapted to recorded results.' : ''}`,
  };
  business.rounds.push(round);
  addLog(
    business,
    `${round.name} created with ${round.experiments.length} suggestions and a saved business brief.`,
  );
  return round;
}

export function weeklyReview(business: BusinessDocument): Review {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const all = business.rounds.flatMap((r) => r.experiments);
  const completed = all.filter(
    (e) =>
      e.status === 'complete' &&
      e.endedAt &&
      new Date(e.endedAt) >= start &&
      new Date(e.endedAt) <= end,
  );
  const measured = completed.filter((e) => Number.isFinite(e.result));
  const describe = (e: Experiment) =>
    `${e.channel}: ${e.result}/${e.target} ${e.metric.toLowerCase()}${e.learning ? `. Learning: ${e.learning}` : ''}`;
  const wins = measured.filter((e) => e.result! >= e.target).map(describe);
  const misses = measured.filter((e) => e.result! < e.target).map(describe);
  const running = all.filter((e) => e.status === 'running');
  const pending = business.outreach.prospects.filter((p) =>
    ['drafted', 'approved', 'sending', 'uncertain'].includes(p.status),
  );
  const endeavors = business.work?.endeavors || [];
  const completedWork = endeavors.filter(
    (item) =>
      item.status === 'completed' &&
      item.completedAt &&
      new Date(item.completedAt) >= start &&
      new Date(item.completedAt) <= end,
  );
  const activeWork = endeavors.filter((item) =>
    ['preparing', 'ready', 'in_progress', 'blocked'].includes(item.status),
  );
  const blockedWork = activeWork.filter((item) => item.status === 'blocked');
  const decisions: string[] = [];
  if (wins.length)
    decisions.push(
      'Repeat one test that met its target, retaining its evidence and changing only one variable. A single result is not proof of causality.',
    );
  if (misses.length)
    decisions.push(
      'Review the missed tests with the owner. Change the audience, message, or offer before retrying; do not assume the cause from totals.',
    );
  if (running.length)
    decisions.push(
      `Record outcomes for ${running.length} running test${running.length === 1 ? '' : 's'} before opening more work.`,
    );
  if (pending.length)
    decisions.push(
      `Resolve ${pending.length} outreach item${pending.length === 1 ? '' : 's'} awaiting review, sending, or delivery reconciliation.`,
    );
  if (completed.length !== measured.length)
    decisions.push(
      'Some completed tests lack numeric results; keep their outcomes unknown until measured.',
    );
  if (completedWork.length)
    decisions.push(
      `${completedWork.length} work item${completedWork.length === 1 ? '' : 's'} completed. Review recorded observations before treating any deliverable as an external action or business outcome.`,
    );
  if (blockedWork.length)
    decisions.push(
      `Resolve, resume, or stop ${blockedWork.length} blocked Do item${blockedWork.length === 1 ? '' : 's'}.`,
    );
  if (!decisions.length)
    decisions.push(
      business.diagnosis?.recommendation ||
        'Confirm the business brief, gather demand and outcome signals, then start one measurable test.',
    );
  const review: Review = {
    id: uid('review'),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    createdAt: end.toISOString(),
    summary: `${
      completed.length
        ? `${completed.length} experiment${completed.length === 1 ? '' : 's'} completed in the last seven days; ${wins.length} met target. ${running.length} still running.`
        : `No experiments completed in the last seven days. ${running.length} currently running.`
    } ${completedWork.length} Do work item${completedWork.length === 1 ? '' : 's'} completed; ${activeWork.length} active. Work completion does not itself establish acquisition or business impact.`,
    wins,
    misses,
    decisions,
    nextReviewDue: new Date(
      end.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
  business.reviews.unshift(review);
  addLog(business, 'Weekly review generated on demand.');
  return review;
}
