import type { BusinessDocument, IdeaKind } from './engine.ts';
import type { IdeaInput } from './explore.ts';

/**
 * One-click playbooks. Each playbook is static data describing *work*, never a
 * promised outcome: no rates, no volumes, no projected results. Steps follow the
 * same shape every time — research, draft, owner review, execute, measure — so a
 * caller can do createIdea -> selectIdea -> addChecklistItem for each step
 * instead of starting from a blank form.
 */
export type PlaybookId =
  | 'creator_outreach'
  | 'directory_submissions'
  | 'content_batch'
  | 'customer_interviews';

export type PlaybookStepPhase =
  | 'research'
  | 'draft'
  | 'owner_review'
  | 'execute'
  | 'measure';

export const playbookStepPhases: PlaybookStepPhase[] = [
  'research',
  'draft',
  'owner_review',
  'execute',
  'measure',
];

export type PlaybookStep = {
  phase: PlaybookStepPhase;
  /** Checklist item text, written to be pasted straight into an endeavor. */
  text: string;
};

export type Playbook = {
  id: PlaybookId;
  title: string;
  description: string;
  kind: IdeaKind;
  /** Ordered research -> draft -> owner review -> execute -> measure. */
  steps: PlaybookStep[];
  intendedDeliverables: string[];
  completionCriteria: string;
  /** Defers the size of the commitment to the owner. */
  effortBudget: string;
  /** What evidence to bring back, so an observation can be recorded. */
  observationPlan: string;
  /** Placeholder used when the caller passes no audience. */
  defaultAudience: string;
};

const PLAYBOOKS: Playbook[] = [
  {
    id: 'creator_outreach',
    title: 'Creator outreach',
    description:
      'Find a short list of creators who already publish for this audience and open one owner-reviewed conversation with each.',
    kind: 'outreach',
    steps: [
      {
        phase: 'research',
        text: 'Research creators who already publish for this audience and record each one with a source link and a published contact route.',
      },
      {
        phase: 'draft',
        text: 'Draft one specific message per creator that names why this creator, not a template blast.',
      },
      {
        phase: 'owner_review',
        text: 'Owner reviews every draft message and the list, removes anyone who does not fit, and approves what may be sent.',
      },
      {
        phase: 'execute',
        text: 'Send only the approved messages, one per creator, and record when each was actually sent.',
      },
      {
        phase: 'measure',
        text: 'Record replies and their content as observations; leave anything unanswered as unknown rather than counting it.',
      },
    ],
    intendedDeliverables: [
      'A sourced creator list with a published contact route for each entry',
      'One owner-reviewed message per creator',
      'A record of what was sent and what came back',
    ],
    completionCriteria:
      'Every creator on the list is either approved and contacted, or removed with a reason, and the replies received so far are recorded.',
    effortBudget:
      'The owner sets the list size and the number of work sessions; no message is sent and no money is spent without owner approval.',
    observationPlan:
      'Bring back who was contacted, on what date, through which route, and the verbatim reply or the fact that there is none yet.',
    defaultAudience: 'Creators who already publish for this audience',
  },
  {
    id: 'directory_submissions',
    title: 'Directory submissions',
    description:
      'Identify directories and listing sites where this business plausibly belongs and submit owner-reviewed listings to the ones that fit.',
    kind: 'campaign',
    steps: [
      {
        phase: 'research',
        text: 'Research directories and listing sites relevant to this category and record each with its URL and submission requirements.',
      },
      {
        phase: 'draft',
        text: 'Draft the listing copy, category choice, and any required assets once, in a form that can be reused per directory.',
      },
      {
        phase: 'owner_review',
        text: 'Owner reviews the directory list and the listing copy, drops directories that do not fit, and approves any that charge a fee.',
      },
      {
        phase: 'execute',
        text: 'Submit the approved listings and record the submission date and confirmation or reference for each.',
      },
      {
        phase: 'measure',
        text: 'Record which submissions were accepted, rejected, or still pending; pending stays unknown, not zero.',
      },
    ],
    intendedDeliverables: [
      'A sourced directory list with URL, requirements, and any fee stated',
      'One owner-reviewed listing description and category choice',
      'A submission record per directory with its current state',
    ],
    completionCriteria:
      'Each researched directory is submitted, deliberately skipped with a reason, or waiting on the owner, and each state is recorded.',
    effortBudget:
      'The owner decides how many directories to pursue and approves every paid listing before submission.',
    observationPlan:
      'Bring back the directory URL, the submission date, and the live listing URL once accepted — or the rejection reason.',
    defaultAudience: 'People searching category directories for this kind of business',
  },
  {
    id: 'content_batch',
    title: 'Content batch',
    description:
      'Produce a small batch of related pieces in one pass so publishing does not restart from a blank page each time.',
    kind: 'content',
    steps: [
      {
        phase: 'research',
        text: 'Research the questions this audience actually asks and record each one with the source where it was observed.',
      },
      {
        phase: 'draft',
        text: 'Draft the batch, one piece per question, keeping each draft marked as unreviewed model or owner output.',
      },
      {
        phase: 'owner_review',
        text: 'Owner reviews each draft for accuracy and voice, edits or rejects, and approves which pieces may be published.',
      },
      {
        phase: 'execute',
        text: 'Publish the approved pieces and record the live URL and publish date for each.',
      },
      {
        phase: 'measure',
        text: 'Record the response to each published piece from a named source; where no measurement exists, record unknown.',
      },
    ],
    intendedDeliverables: [
      'A sourced list of audience questions the batch answers',
      'One drafted piece per question',
      'A publish record with the live URL for each approved piece',
    ],
    completionCriteria:
      'Every drafted piece is either published with a recorded URL or rejected with a reason, and nothing unreviewed is live.',
    effortBudget:
      'The owner sets the batch size and how many sessions to spend; nothing is published without owner review.',
    observationPlan:
      'Bring back each live URL, its publish date, and whatever response was observed with its source — unknown where nothing was measured.',
    defaultAudience: 'People already searching for answers in this category',
  },
  {
    id: 'customer_interviews',
    title: 'Customer interviews',
    description:
      'Talk to a handful of people in the target audience and write down what they said, in their words, before drawing conclusions.',
    kind: 'research',
    steps: [
      {
        phase: 'research',
        text: 'Identify people in the target audience who can be reached through a published route and record each with its source.',
      },
      {
        phase: 'draft',
        text: 'Draft the interview invitation and an open question guide that does not lead the answer.',
      },
      {
        phase: 'owner_review',
        text: 'Owner reviews the invitation and the question guide and approves who may be contacted.',
      },
      {
        phase: 'execute',
        text: 'Run the approved interviews and capture notes or quotes during each conversation.',
      },
      {
        phase: 'measure',
        text: 'Record what was said as observations with attribution and date, keeping quotes separate from any interpretation.',
      },
    ],
    intendedDeliverables: [
      'A sourced list of interview candidates with a contact route',
      'An owner-reviewed invitation and open question guide',
      'Per-interview notes with dated, attributed quotes',
    ],
    completionCriteria:
      'Each approved candidate is either interviewed with notes recorded or marked as declined or unreachable.',
    effortBudget:
      'The owner decides how many interviews to run and approves every invitation before it is sent.',
    observationPlan:
      'Bring back who was interviewed, on what date, and their own words — quotes stay separate from any conclusion drawn from them.',
    defaultAudience: 'People in the target audience who have not bought yet',
  },
];

export function listPlaybooks(): Playbook[] {
  return PLAYBOOKS.map((playbook) => structuredClone(playbook));
}

export function getPlaybook(playbookId: string): Playbook {
  const playbook = PLAYBOOKS.find((value) => value.id === playbookId);
  if (!playbook) throw Error('Playbook not found.');
  return structuredClone(playbook);
}

export function playbookSteps(playbookId: string): string[] {
  return getPlaybook(playbookId).steps.map((step) => step.text);
}

export type PlaybookIdea = {
  playbook: Playbook;
  /** Pass straight to createIdea in lib/explore.ts. */
  idea: IdeaInput;
  /** Pass straight to selectIdea in lib/work.ts. */
  brief: {
    intendedDeliverables: string[];
    effortBudget: string;
    completionCriteria: string;
  };
  /** Pass one at a time to addChecklistItem in lib/work.ts. */
  checklist: string[];
};

const MAX_AUDIENCE = 200;

/**
 * Builds the inputs for createIdea -> selectIdea -> addChecklistItem from a
 * playbook. Nothing here is written to the business document; the caller runs
 * those functions so the normal logging and validation still apply.
 */
export function playbookIdea(
  business: BusinessDocument,
  playbookId: string,
  options: { audience?: string } = {},
): PlaybookIdea {
  const playbook = getPlaybook(playbookId);
  const audience = (options.audience ?? '').trim().slice(0, MAX_AUDIENCE) ||
    playbook.defaultAudience;
  const subject = business.name?.trim() || 'this business';
  return {
    playbook,
    idea: {
      title: playbook.title,
      kind: playbook.kind,
      description: `${playbook.description} Run for ${subject}.`,
      audience,
      outcome: playbook.completionCriteria,
      ownerNotes: `Started from the ${playbook.title} playbook. ${playbook.observationPlan}`,
      sources: [],
    },
    brief: {
      intendedDeliverables: [...playbook.intendedDeliverables],
      effortBudget: playbook.effortBudget,
      completionCriteria: playbook.completionCriteria,
    },
    checklist: playbook.steps.map((step) => step.text),
  };
}
