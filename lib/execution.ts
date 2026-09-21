import { addLog, uid, type BusinessDocument, type Endeavor, type ExecutionRun } from './engine.ts';
import { endeavorFor, saveArtifact } from './work.ts';

export const EXECUTION_LEASE_MS = 150_000;

export function activeExecution(endeavor: Endeavor, now = Date.now()) {
  const run = (endeavor.executionRuns || []).find((item) => item.status === 'running');
  if (!run) return undefined;
  return new Date(run.leaseExpiresAt).getTime() > now ? run : undefined;
}

/** Starts one bounded run. A stale lease is failed first so a timed out call can never block work forever. */
export function beginExecution(
  business: BusinessDocument,
  endeavorId: string,
  instruction: string,
  contextRevision: number,
  contextSnapshot?: string,
  now = new Date(),
) {
  const endeavor = endeavorFor(business, endeavorId);
  if (['completed', 'stopped'].includes(endeavor.status))
    throw Error('Only active Do work can be run. Reopen this work before executing it.');
  const runs = (endeavor.executionRuns ||= []);
  const current = runs.find((item) => item.status === 'running');
  if (current) {
    if (new Date(current.leaseExpiresAt).getTime() > now.getTime())
      throw Error('This work is already running. Wait for it to finish before starting another run.');
    current.status = 'failed';
    current.finishedAt = now.toISOString();
    current.error = 'The previous run lease expired before it could finish.';
  }
  const run: ExecutionRun = {
    id: uid('run'),
    status: 'running',
    startedAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + EXECUTION_LEASE_MS).toISOString(),
    contextRevision,
    contextSnapshot: contextSnapshot?.slice(0, 28000),
    instruction,
  };
  runs.unshift(run);
  endeavor.updatedAt = now.toISOString();
  addLog(business, `Do run started: ${endeavor.title}.`);
  return run;
}

export function finishExecution(
  business: BusinessDocument,
  endeavorId: string,
  runId: string,
  result: { artifactId: string; nextDecision: string },
  now = new Date(),
) {
  const endeavor = endeavorFor(business, endeavorId);
  const run = (endeavor.executionRuns || []).find((item) => item.id === runId);
  if (!run) throw Error('Execution run not found.');
  if (run.status !== 'running') throw Error('Execution run is already settled.');
  if (new Date(run.leaseExpiresAt).getTime() <= now.getTime()) {
    run.status = 'failed';
    run.finishedAt = now.toISOString();
    run.error = 'The run exceeded its execution lease.';
    throw Error('The run exceeded its execution lease.');
  }
  run.status = 'succeeded';
  run.finishedAt = now.toISOString();
  run.artifactId = result.artifactId;
  run.nextDecision = result.nextDecision;
  endeavor.updatedAt = now.toISOString();
  addLog(business, `Do run completed: ${endeavor.title}.`);
  return run;
}

export function failExecution(
  business: BusinessDocument,
  endeavorId: string,
  runId: string,
  error: string,
  now = new Date(),
) {
  const endeavor = endeavorFor(business, endeavorId);
  const run = (endeavor.executionRuns || []).find((item) => item.id === runId);
  if (!run) throw Error('Execution run not found.');
  if (run.status !== 'running') return run;
  run.status = 'failed';
  run.finishedAt = now.toISOString();
  run.error = error.slice(0, 2000);
  endeavor.updatedAt = now.toISOString();
  addLog(business, `Do run failed: ${endeavor.title}.`);
  return run;
}

export function executionPrompt(business: BusinessDocument, endeavor: Endeavor, instruction: string) {
  return `Execute one bounded internal work run. Return exactly one JSON object shaped like {"content":"editable draft text","nextDecision":"one concise decision for the owner"}. Both values must be plain strings: content must be at most 18,000 characters and nextDecision at most 1,500 characters. Do not nest sections inside content as an object or array; write the artifact as readable Markdown inside the content string. Create a useful editable artifact, with no claim that anything was sent, published, deployed, purchased, or approved. Cite supporting source URLs beside researched claims. Preserve unknowns for owner review. ${instruction || 'Produce the smallest useful next deliverable.'} Context: ${JSON.stringify({
    business: { name: business.name, url: business.url, goal: business.goal, budget: business.budget, notes: business.notes },
    confirmedFacts: business.facts.filter((fact) => fact.status !== 'unreviewed').slice(0, 12),
    markets: business.markets || [],
    endeavor: { title: endeavor.title, kind: endeavor.kind, description: endeavor.description, deliverables: endeavor.intendedDeliverables, budget: endeavor.effortBudget, completion: endeavor.completionCriteria, recentArtifacts: endeavor.artifacts.slice(-3).map((a) => ({ title: a.title, content: a.versions.at(-1)?.content?.slice(0, 1600) })), recentObservations: endeavor.observations.slice(0, 3) },
  })}`.slice(0, 28000);
}

/** Keep safe structured provider output as an editable artifact. */
export function executionText(value: unknown, label: 'content' | 'nextDecision', max: number) {
  let text = typeof value === 'string' ? value : '';
  if (!text && value && typeof value === 'object') {
    try { text = JSON.stringify(value, null, 2); } catch { text = ''; }
  }
  text = text.trim();
  if (!text) throw Error(`AI returned no usable ${label === 'content' ? 'draft' : 'next decision'}.`);
  if (text.length > max) throw Error(`AI returned a ${label === 'content' ? 'draft' : 'next decision'} that was too long to save safely.`);
  return text;
}

export function saveExecutionArtifact(
  business: BusinessDocument,
  endeavorId: string,
  kind: Parameters<typeof saveArtifact>[2]['kind'],
  content: string,
  title: string,
  sourceEvidence: string[],
) {
  return saveArtifact(business, endeavorId, { kind, title, content, source: 'assistant', sourceEvidence });
}
