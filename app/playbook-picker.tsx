'use client';

import { useState } from 'react';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Playbook, PlaybookStepPhase } from '@/lib/playbooks';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

const phaseLabels: Record<PlaybookStepPhase, string> = {
  research: 'Research',
  draft: 'Draft',
  owner_review: 'Owner review',
  execute: 'Execute',
  measure: 'Measure',
};

export default function PlaybookPicker({
  playbooks,
  act,
  busy,
  openDo,
}: {
  playbooks: Playbook[];
  act: Act;
  busy: boolean;
  openDo: () => void;
}) {
  const [audience, setAudience] = useState<Record<string, string>>({});
  if (!playbooks.length) return null;

  const start = async (playbook: Playbook) => {
    const ok = await act('start_playbook', {
      playbookId: playbook.id,
      audience: audience[playbook.id]?.trim() || undefined,
    });
    if (ok) openDo();
  };

  return (
    <section className="playbook-panel" aria-labelledby="playbook-heading">
      <div className="playbook-heading">
        <div>
          <p className="eyebrow">START FROM A PLAYBOOK</p>
          <h3 id="playbook-heading">A known shape of work, not a promised result</h3>
        </div>
        <span className="small muted">
          Each playbook creates a direction and a checklist in Do. Nothing is
          sent or published until you review it.
        </span>
      </div>
      <div className="playbook-list">
        {playbooks.map((playbook) => (
          <article className="playbook-card" key={playbook.id}>
            <span className="idea-kind">
              <ClipboardList size={13} aria-hidden="true" /> Playbook
            </span>
            <h4>{playbook.title}</h4>
            <p>{playbook.description}</p>
            <ol className="playbook-steps" aria-label={`Steps in ${playbook.title}`}>
              {playbook.steps.map((step, index) => (
                <li key={`${playbook.id}:${index}`}>
                  <span>{phaseLabels[step.phase]}</span>
                  {step.text}
                </li>
              ))}
            </ol>
            <dl className="playbook-meta">
              <div>
                <dt>Effort you decide</dt>
                <dd>{playbook.effortBudget}</dd>
              </div>
              <div>
                <dt>Complete when</dt>
                <dd>{playbook.completionCriteria}</dd>
              </div>
            </dl>
            <label htmlFor={`playbook-audience-${playbook.id}`}>
              Audience (optional)
            </label>
            <Input
              id={`playbook-audience-${playbook.id}`}
              value={audience[playbook.id] || ''}
              placeholder={playbook.defaultAudience}
              onChange={(event) =>
                setAudience((value) => ({
                  ...value,
                  [playbook.id]: event.target.value,
                }))
              }
            />
            <div className="idea-actions">
              <Button size="sm" disabled={busy} onClick={() => void start(playbook)}>
                Start this playbook <ArrowRight size={14} />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
