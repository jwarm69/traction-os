import type { BusinessDocument, Endeavor } from './engine';

/** Builds a human handoff brief. It deliberately describes a manual Codex paste flow. */
export function buildAgentBrief(business: BusinessDocument, endeavor: Endeavor): string {
  const facts = business.facts.filter((fact) => fact.status !== 'unreviewed');
  const observations = endeavor.observations.slice(0, 5);
  const markets = business.markets || [];
  return `# Traction OS agent brief

Paste this brief into your Codex task (or another approved agent workspace) to carry out the work manually. This handoff does not connect an agent to Traction OS or authorize external actions.

## Business
${business.name}
Website: ${business.url}
Goal: ${business.goal || 'No goal recorded.'}
${business.notes ? `Owner notes: ${business.notes}` : ''}

## Confirmed context
${facts.length ? facts.map((fact) => `- ${fact.label}: ${fact.value} (source: ${fact.source}; observed ${fact.observedAt})`).join('\n') : '- No confirmed facts are recorded yet.'}

## Active market context
${markets.length ? markets.map((market) => `- ${market.name} (${market.location}) — ${market.status}; objective: ${market.objective}; next move: ${market.nextMove}`).join('\n') : '- No named markets are recorded.'}

## Work to do
### ${endeavor.title}
${endeavor.description}

Deliverables:
${endeavor.intendedDeliverables.map((item) => `- ${item}`).join('\n') || '- Determine the smallest useful deliverable.'}

Effort / budget: ${endeavor.effortBudget}
Completion criteria: ${endeavor.completionCriteria}

## Recent learning
${observations.length ? observations.map((item) => `- ${item.summary} — next decision: ${item.nextDecision} (source: ${item.source}; observed ${item.observedAt})`).join('\n') : '- No observations recorded yet.'}

## Permissions and output
Research and draft freely within the brief. Ask the owner before sending messages, publishing, spending money, deleting data, changing external systems, or taking an irreversible action. Return the result, source links or evidence, uncertainties, and the recommended next decision.
`;
}
