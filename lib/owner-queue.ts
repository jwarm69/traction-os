import type { BusinessDocument } from './engine';

export type OwnerAction = {
  id: string;
  title: string;
  detail: string;
  tab: 'memory' | 'signals' | 'rounds' | 'outreach' | 'reviews';
};

/** Work that needs the owner, ordered by prerequisites and unresolved execution. */
export function ownerQueue(business: BusinessDocument): OwnerAction[] {
  const actions: OwnerAction[] = [];
  const add = (
    id: string,
    title: string,
    detail: string,
    tab: OwnerAction['tab'],
  ) => actions.push({ id, title, detail, tab });
  if (!business.goal.trim() || !business.budget.trim())
    add(
      'brief',
      'Set the goal and working budget',
      'Give the plan a measurable outcome and a limit on time or money.',
      'memory',
    );
  const unreviewed = business.facts.filter((f) => f.status === 'unreviewed');
  if (!business.facts.length)
    add(
      'facts',
      'Tell us what the business sells',
      'Add the offer and ideal customer as owner-confirmed facts.',
      'memory',
    );
  else if (unreviewed.length)
    add(
      'calibrate',
      `Review ${unreviewed.length} research finding${unreviewed.length === 1 ? '' : 's'}`,
      'Confirm or correct the evidence before it guides the next plan.',
      'memory',
    );
  const uncertain = business.outreach.prospects.filter(
    (p) => p.status === 'uncertain' || p.status === 'sending',
  );
  if (uncertain.length)
    add(
      'delivery',
      `Check ${uncertain.length} unconfirmed send${uncertain.length === 1 ? '' : 's'}`,
      'Reconcile the sent copy in the approved Gmail account. An unconfirmed send will not retry automatically.',
      'outreach',
    );
  const replies = business.outreach.prospects.filter(
    (p) => p.status === 'replied',
  );
  if (replies.length)
    add(
      'replies',
      `Review replies from ${replies.length} prospect${replies.length === 1 ? '' : 's'}`,
      'Open Gmail, assess whether each reply is qualified, and record the experiment outcome.',
      'outreach',
    );
  const drafts = business.outreach.prospects.filter(
    (p) => p.status === 'drafted',
  );
  if (drafts.length)
    add(
      'approve',
      `Review ${drafts.length} email draft${drafts.length === 1 ? '' : 's'}`,
      'Check the recipient, fit, and exact message before approving.',
      'outreach',
    );
  const approved = business.outreach.prospects.filter(
    (p) => p.status === 'approved',
  );
  if (approved.length)
    add(
      'send',
      `Send ${approved.length} approved message${approved.length === 1 ? '' : 's'}`,
      business.mode === 'demo'
        ? 'Demo approval is saved for practice. Fictional messages cannot be sent.'
        : 'Use the Gmail account bound to the approval to send each message.',
      'outreach',
    );
  const open = business.rounds.find((r) => r.status !== 'complete');
  if (open) {
    const running = open.experiments.filter((e) => e.status === 'running');
    if (running.length)
      add(
        'results',
        `Complete ${running.length} running test${running.length === 1 ? '' : 's'}`,
        'Follow the saved action instructions, then record a measured result and what you learned.',
        'rounds',
      );
    else if (open.experiments.some((e) => e.status === 'complete'))
      add(
        'close',
        'Review and close this round',
        'Keep unstarted ideas in history, then use these results to plan the next round.',
        'rounds',
      );
    else
      add(
        'start',
        'Choose your first experiment',
        'Start one or two suggestions that fit the available time and budget.',
        'rounds',
      );
  } else if (
    business.goal.trim() &&
    business.budget.trim() &&
    business.facts.some((f) => f.status !== 'unreviewed')
  )
    add(
      'plan',
      'Create the next experiment round',
      'Use the confirmed brief, latest signals, and prior outcomes to choose a small test.',
      'rounds',
    );
  if (!business.signals.length)
    add(
      'signals',
      'Add a baseline',
      'Enter current demand and qualified outcomes, or import them from CSV or analytics.',
      'signals',
    );
  const review = business.reviews[0];
  if (
    business.rounds.length &&
    (!review || Date.parse(review.nextReviewDue) <= Date.now())
  )
    add(
      'review',
      'Review this week’s progress',
      'Generate a saved review of completed tests, open work, and next decisions.',
      'reviews',
    );
  return actions;
}
