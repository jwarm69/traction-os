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
    summary: completed.length
      ? `${completed.length} experiment${completed.length === 1 ? '' : 's'} completed in the last seven days; ${wins.length} met target. ${running.length} still running.`
      : `No experiments completed in the last seven days. ${running.length} currently running.`,
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
