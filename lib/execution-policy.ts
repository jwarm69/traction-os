import type { Endeavor } from './engine.ts';

export type ExecutionRoute = 'in_app' | 'codex' | 'computer' | 'human';
export type ExecutionPlan = {
  route: ExecutionRoute;
  label: string;
  reason: string;
  provider?: 'deepseek' | 'openai';
  workload?: 'routine' | 'strategic' | 'research';
  maximumSharedReservationMicros: number;
  requiresApproval: boolean;
};

const externalAction =
  /\b(send|email|message|dm|publish|post|launch|submit|buy|purchase|pay|book|schedule|upload|deploy|change|edit|create account|sign up|log in|contact|outreach)\b/i;

const textFor = (endeavor: Endeavor) =>
  [
    endeavor.title,
    endeavor.description,
    ...endeavor.intendedDeliverables,
    endeavor.completionCriteria,
  ].join('\n');

export function planExecution(endeavor: Endeavor): ExecutionPlan {
  if (['completed', 'stopped', 'blocked'].includes(endeavor.status))
    return {
      route: 'human',
      label: 'Owner decision',
      reason: `This work is ${endeavor.status}; reopen or unblock it before spending or acting.`,
      maximumSharedReservationMicros: 0,
      requiresApproval: true,
    };

  if (endeavor.kind === 'product_improvement')
    return {
      route: 'codex',
      label: 'Codex on your Mac',
      reason:
        'Product implementation needs repository context and a reviewable local workspace.',
      maximumSharedReservationMicros: 0,
      requiresApproval: true,
    };

  const asksForExternalAction = externalAction.test(textFor(endeavor));
  const reviewedArtifact = endeavor.artifacts.some((item) => item.reviewedAt);
  if (asksForExternalAction && reviewedArtifact)
    return {
      route: 'computer',
      label: 'Jev on your Mac',
      reason:
        'The work calls for an external action and has an owner-reviewed artifact. Jev may act, but consequential steps still pause for approval.',
      maximumSharedReservationMicros: 0,
      requiresApproval: true,
    };

  if (endeavor.kind === 'research' || endeavor.kind === 'outreach')
    return {
      route: 'in_app',
      label: 'OpenAI research',
      reason:
        asksForExternalAction && !reviewedArtifact
          ? 'Prepare sourced, reviewable material before any external action.'
          : 'This work needs inspectable web sources before a decision.',
      provider: 'openai',
      workload: 'research',
      maximumSharedReservationMicros: 1_250_000,
      requiresApproval: false,
    };

  if (endeavor.kind === 'experiment')
    return {
      route: 'in_app',
      label: 'OpenAI strategy',
      reason:
        'Experiment design is a high-judgment decision; produce a bounded plan before acting.',
      provider: 'openai',
      workload: 'strategic',
      maximumSharedReservationMicros: 125_000,
      requiresApproval: false,
    };

  return {
    route: 'in_app',
    label: 'DeepSeek draft',
    reason:
      asksForExternalAction && !reviewedArtifact
        ? 'Create and review the deliverable before allowing an external action.'
        : 'This is bounded drafting work, so the lower-cost routine model is sufficient.',
    provider: 'deepseek',
    workload: 'routine',
    maximumSharedReservationMicros: 25_000,
    requiresApproval: false,
  };
}

export const executionCostLabel = (plan: ExecutionPlan) => {
  if (!plan.maximumSharedReservationMicros)
    return plan.route === 'human'
      ? 'No AI spend'
      : 'Uses your local account or Jev credits';
  return `Shared API reservation up to $${(
    plan.maximumSharedReservationMicros / 1_000_000
  ).toFixed(plan.maximumSharedReservationMicros < 100_000 ? 3 : 2)}`;
};
