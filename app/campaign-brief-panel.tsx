'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BusinessDocument, Endeavor, WorkArtifact } from '@/lib/engine';
import { executionCostLabel, planExecution } from '@/lib/execution-policy';
import { skillKinds, skills, type CampaignBriefData } from '@/lib/skills';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
const skill = skills.campaign_brief;

/**
 * The campaign brief skill: shows what is missing before anything is spent,
 * the route and cost, then three concepts traced to evidence.
 */
export default function CampaignBriefPanel({
  b,
  endeavor,
  act,
  busy,
  aiReady,
  running,
}: {
  b: BusinessDocument;
  endeavor: Endeavor;
  act: Act;
  busy: boolean;
  aiReady: boolean;
  running: boolean;
}) {
  const [audience, setAudience] = useState(endeavor.audience || '');
  const [instruction, setInstruction] = useState('');
  if (!skillKinds.campaign_brief.includes(endeavor.kind)) return null;
  const gaps = skill.gaps(b, endeavor);
  const required = gaps.filter((gap) => gap.required);
  const optional = gaps.filter((gap) => !gap.required);
  const plan = planExecution(endeavor, 'campaign_brief');
  const blocked = plan.route !== 'in_app';
  return (
    <div className="campaign-brief-panel">
      <div>
        <span className="eyebrow">SKILL</span>
        <h3>Prepare a campaign brief</h3>
        <p className="small muted">
          Three distinct concepts for {endeavor.code}, each with an insight traced to your evidence, a hook, visual, copy, a
          production brief, and the hypothesis it tests. Saved as a draft.
        </p>
      </div>
      <div className="campaign-brief-audience">
        <span className="small">Audience</span>
        <Input
          value={audience}
          maxLength={600}
          onChange={(event) => setAudience(event.target.value)}
          placeholder="Who this campaign is for, e.g. golf coaches with 10+ students"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || audience.trim() === (endeavor.audience || '')}
          onClick={() => act('set_audience', { endeavorId: endeavor.id, audience })}
        >
          Save audience
        </Button>
      </div>
      {required.length > 0 && (
        <ul className="campaign-brief-gaps required">
          {required.map((gap) => (
            <li key={gap.key}>
              <strong>Needed:</strong> {gap.hint}
            </li>
          ))}
        </ul>
      )}
      {optional.length > 0 && (
        <details className="campaign-brief-gaps">
          <summary className="small muted">
            {optional.length} optional input{optional.length === 1 ? '' : 's'} missing; the brief will treat{' '}
            {optional.length === 1 ? 'it' : 'them'} as unknown
          </summary>
          <ul className="small muted">
            {optional.map((gap) => (
              <li key={gap.key}>{gap.hint}</li>
            ))}
          </ul>
        </details>
      )}
      <Input
        value={instruction}
        maxLength={3000}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Optional direction, e.g. lead with the time saved"
      />
      <div className="campaign-brief-run">
        <span className="small muted">
          {plan.label} · {executionCostLabel(plan)}
          {blocked ? ` · ${plan.reason}` : ''}
        </span>
        <Button
          disabled={busy || running || !aiReady || required.length > 0 || blocked}
          onClick={() => act('run_work', { endeavorId: endeavor.id, skillId: 'campaign_brief', instruction })}
        >
          <Sparkles size={14} /> Prepare campaign brief
        </Button>
      </div>
    </div>
  );
}

/** Concepts from a campaign brief version, each promotable to its own production brief. */
export function ConceptList({
  b,
  data,
  endeavor,
  artifact,
  act,
  busy,
}: {
  b: BusinessDocument;
  data: CampaignBriefData;
  endeavor: Endeavor;
  artifact: WorkArtifact;
  act: Act;
  busy: boolean;
}) {
  // Show the fact a concept cites by its label, not its id.
  const evidenceLabel = (reference: string) => {
    const fact = reference.startsWith('fact:') ? b.facts.find((item) => item.id === reference.slice(5)) : undefined;
    return fact ? `${fact.label} (fact)` : reference;
  };
  const promoted = (index: number) =>
    endeavor.artifacts.some((item) => item.sourceEvidence?.includes(`concept:${artifact.id}:${index}`));
  return (
    <div className="concept-list">
      {data.flags.map((flag) => (
        <p key={flag} className="context-warning small">
          {flag}
        </p>
      ))}
      {data.concepts.map((concept, index) => (
        <article key={`${concept.angle}-${index}`} className="concept-card">
          <div className="concept-head">
            <strong>
              {index + 1}. {concept.angle || 'Untitled concept'}
            </strong>
            <Button
              size="sm"
              variant={promoted(index) ? 'ghost' : 'outline'}
              disabled={busy || promoted(index)}
              onClick={() => act('promote_concept', { endeavorId: endeavor.id, artifactId: artifact.id, index })}
            >
              {promoted(index) ? 'Promoted' : 'Promote to production brief'}
            </Button>
          </div>
          {concept.flags.length > 0 && (
            <ul className="concept-flags">
              {concept.flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
          <p className="concept-hook">“{concept.hook}”</p>
          <dl>
            <dt>Insight</dt>
            <dd>{concept.insight}</dd>
            <dt>Evidence</dt>
            <dd>{concept.evidence.length ? concept.evidence.map(evidenceLabel).join('; ') : 'None cited'}</dd>
            <dt>Visual</dt>
            <dd>{concept.visual}</dd>
            <dt>Copy</dt>
            <dd>{concept.copy}</dd>
            <dt>Production brief</dt>
            <dd>{concept.productionBrief}</dd>
            <dt>Hypothesis</dt>
            <dd>{concept.hypothesis}</dd>
          </dl>
        </article>
      ))}
      {data.gaps.length > 0 && (
        <p className="small muted">
          <strong>Missing information:</strong> {data.gaps.join('; ')}
        </p>
      )}
      {data.claimsToVerify.length > 0 && (
        <p className="context-warning small">
          <strong>Claims to verify:</strong> {data.claimsToVerify.join('; ')}
        </p>
      )}
    </div>
  );
}
