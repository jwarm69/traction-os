'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Circle, History, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  ensureGuided,
  type BriefFieldKey,
  type BusinessDocument,
} from '@/lib/engine';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
const fieldCopy: Record<BriefFieldKey, { label: string; help: string }> = {
  offer: {
    label: 'Offer',
    help: 'What can this audience actually use or buy now?',
  },
  audience: {
    label: 'Audience',
    help: 'Who should this first experiment serve?',
  },
  readiness: {
    label: 'Readiness',
    help: 'Which useful workflow is available today?',
  },
  objective: {
    label: 'Outcome',
    help: 'What would make the next two weeks useful?',
  },
  resources: {
    label: 'Resources',
    help: 'Owner time and external spend available for this test.',
  },
};
const keys = Object.keys(fieldCopy) as BriefFieldKey[];

export default function GuidedWorkspace({
  b,
  act,
  busy,
  username,
  revision,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
  username: string;
  revision: number;
}) {
  const flow = useMemo(() => ensureGuided(structuredClone(b)), [b]);
  const cacheBaseline = b.guided?.draft.savedAt || `legacy:${revision}`;
  const localKey = `traction-guided-draft:${username}:${b.id}`;
  const [values, setValues] = useState<Record<BriefFieldKey, string>>(
    Object.fromEntries(keys.map((key) => [key, flow.draft.fields[key].value])) as Record<BriefFieldKey, string>,
  );
  const [confirmed, setConfirmed] = useState<Record<BriefFieldKey, boolean>>(
    Object.fromEntries(keys.map((key) => [key, flow.draft.fields[key].confirmed])) as Record<BriefFieldKey, boolean>,
  );
  const [ownerNotes, setOwnerNotes] = useState(flow.draft.ownerNotes);
  const [editingKey, setEditingKey] = useState<BriefFieldKey | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [decision, setDecision] = useState(
    flow.draft.decisionDraft?.hypothesis || flow.diagnosis?.hypothesis ||
      'We do not yet have enough comparable evidence to know whether acquisition or activation is the limiting factor.',
  );
  const [observation, setObservation] = useState(
    flow.draft.decisionDraft?.nextObservation || flow.diagnosis?.nextObservation ||
      'Observe whether eligible people can reach the first useful outcome in the currently available workflow.',
  );
  const hydrated = useRef(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(localKey) || 'null');
        if (cached && cached.serverSavedAt === cacheBaseline && cached.revision === revision) {
          if (cached.values) setValues(cached.values);
          if (cached.confirmed) setConfirmed(cached.confirmed);
          if (typeof cached.ownerNotes === 'string') setOwnerNotes(cached.ownerNotes);
          if (typeof cached.decision === 'string') setDecision(cached.decision);
          if (typeof cached.observation === 'string') setObservation(cached.observation);
        }
      } catch {}
      hydrated.current = true;
    });
  }, [cacheBaseline, localKey, revision]);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(localKey, JSON.stringify({ values, confirmed, ownerNotes, decision, observation, serverSavedAt: cacheBaseline, revision }));
    } catch {}
  }, [cacheBaseline, decision, localKey, observation, ownerNotes, confirmed, revision, values]);
  const allConfirmed = keys.every((key) => values[key].trim() && confirmed[key]);
  const activeKey = editingKey || keys.find((key) => !confirmed[key]) || 'resources';
  const save = () =>
    act('save_guided_draft', {
      fields: values,
      confirmations: confirmed,
      ownerNotes,
    });
  const confirmBrief = () => act('confirm_guided_brief', { fields: values, confirmations: confirmed, ownerNotes });
  const version = flow.briefVersions.find((item) => item.id === flow.activeBriefVersionId);
  const draftDiffers = Boolean(
    version &&
      (keys.some(
        (key) =>
          version.fields[key].value !== values[key] ||
          version.fields[key].confirmed !== confirmed[key],
      ) || version.ownerNotes !== ownerNotes),
  );
  const correctionView = !version || correcting || draftDiffers;
  const stages = ['Understanding', 'Outcome', 'Decision', 'Experiment'];
  const stageIndex = correctionView
    ? keys.indexOf(activeKey) >= keys.indexOf('objective')
      ? 1
      : 0
    : !flow.diagnosis
      ? 2
      : flow.proposal
        ? 3
        : 2;

  return (
    <section className="guided-shell">
      <div className="guided-progress" aria-label="Calibration progress">
        {stages.map((stage, index) => (
          <div className={index <= stageIndex ? 'active' : ''} key={stage}>
            {index < stageIndex ? <Check size={14} /> : <Circle size={11} />}
            <span>{stage}</span>
          </div>
        ))}
      </div>

      {correctionView ? (
        <div className="guided-card">
          <p className="eyebrow">WHERE WE ARE · NEEDS YOUR REVIEW</p>
          <h2>Let’s agree on the business before choosing a move.</h2>
          <p className="guided-lede">
            Research and older plans are shown as proposals until you confirm them. A website address alone never confirms the offer, audience, or readiness.
          </p>
          {flow.contextChangeNotice && <div className="evidence-note"><ShieldCheck size={18} /><span>{flow.contextChangeNotice}</span></div>}
          <div className="confirmed-summary">
            {keys.filter((key) => confirmed[key] && key !== activeKey).map((key) => (
              <button key={key} onClick={() => setEditingKey(key)}>
                <Check size={14} /><span><strong>{fieldCopy[key].label}</strong>{values[key]}</span>
              </button>
            ))}
          </div>
          <div className="brief-fields">
            {keys.filter((key) => key === activeKey).map((key) => {
              const original = flow.draft.fields[key];
              return (
                <div className="brief-field" key={key}>
                  <div className="brief-field-head">
                    <div>
                      <label htmlFor={`guided-${key}`}>{fieldCopy[key].label}</label>
                      <p>{fieldCopy[key].help}</p>
                    </div>
                    <span className={`source-badge ${original.source}`}>
                      {original.source.replace('_', ' ')}
                    </span>
                  </div>
                  <Textarea
                    id={`guided-${key}`}
                    value={values[key]}
                    placeholder="Unknown — add what you know"
                    onChange={(event) => {
                      const value = event.target.value;
                      setValues((current) => ({ ...current, [key]: value }));
                      setConfirmed((current) => ({ ...current, [key]: false }));
                    }}
                  />
                  <div className="confirmation-row">
                    <Checkbox
                      aria-label={`Confirm ${fieldCopy[key].label}`}
                      checked={confirmed[key]}
                      disabled={!values[key].trim()}
                      onCheckedChange={(checked) => {
                        setConfirmed((current) => ({ ...current, [key]: checked === true }));
                        if (checked === true) setEditingKey(null);
                      }}
                    />
                    I confirm this is accurate enough for the first experiment.
                  </div>
                </div>
              );
            })}
          </div>
          <p className="draft-note">Question {keys.indexOf(activeKey) + 1} of 5 · Your answer changes which experiment is feasible and worth measuring.</p>
          <label htmlFor="guided-notes">Correction or context, in your words</label>
          <Textarea
            id="guided-notes"
            value={ownerNotes}
            onChange={(event) => setOwnerNotes(event.target.value)}
            placeholder="For example: We are targeting coaches first, but the coach workflow is not ready yet."
          />
          <p className="draft-note">Saved drafts stay with this business. Your exact note is kept alongside extracted fields.</p>
          <div className="guided-actions">
            <Button variant="outline" onClick={save} disabled={busy}>Save draft</Button>
            <Button onClick={confirmBrief} disabled={busy || !allConfirmed}>
              Agree and continue <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      ) : !flow.diagnosis ? (
        <div className="guided-card narrow">
          <p className="eyebrow">THE DECISION TO MAKE</p>
          <h2>Choose the uncertainty worth testing first.</h2>
          <p className="guided-lede">
            The confirmed outcome is “{version.fields.objective.value}.” Existing metrics are evidence, but missing analytics remain unknown rather than zero.
          </p>
          <label htmlFor="decision-hypothesis">Suspected limiting factor</label>
          <Textarea id="decision-hypothesis" value={decision} onChange={(e) => setDecision(e.target.value)} />
          <label htmlFor="decision-observation">What observation would change the decision?</label>
          <Textarea id="decision-observation" value={observation} onChange={(e) => setObservation(e.target.value)} />
          <div className="evidence-note">
            <ShieldCheck size={18} />
            <span>{b.signals.length ? `${b.signals.length} recorded signal${b.signals.length === 1 ? '' : 's'} will be cited.` : 'No baseline is recorded. A small discovery test can still proceed with a manual observation plan.'}</span>
          </div>
          <Button
            disabled={busy || !decision.trim() || !observation.trim()}
            onClick={() => act('agree_guided_decision', {
              hypothesis: decision,
              nextObservation: observation,
              alternatives: ['Acquisition may be limiting qualified demand.', 'Activation may be preventing people from reaching value.', 'The offer or intended user may still be unclear.'],
            })}
          >
            Agree this decision is useful <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => act('save_guided_decision_draft', { hypothesis: decision, nextObservation: observation })}>Save and finish later</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setCorrecting(true)}>Correct brief</Button>
        </div>
      ) : !flow.proposal ? (
        <div className="guided-card narrow">
          <p className="eyebrow">ONE RECOMMENDED MOVE</p>
          <h2>Prepare the smallest useful experiment.</h2>
          <p className="guided-lede">The proposal will use brief v{version.number}, the agreed uncertainty, confirmed resources, recent signals, and relevant completed-test learnings. It will include measurement and stopping rules.</p>
          <div className="decision-summary">
            <strong>{flow.diagnosis.hypothesis}</strong>
            <span>Next observation: {flow.diagnosis.nextObservation}</span>
          </div>
          <Button disabled={busy} onClick={() => act('propose_guided_experiment')}>
            Propose one experiment <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setCorrecting(true)}>Correct brief</Button>
        </div>
      ) : (
        <div className="guided-card proposal-card">
          <div className="proposal-head">
            <div>
              <p className="eyebrow">{flow.proposal.status === 'accepted' ? 'AGREED NEXT MOVE' : 'PROPOSED · REVIEW BEFORE ACCEPTING'}</p>
              <h2>{flow.proposal.title}</h2>
            </div>
            <span className="version-badge">Brief v{version.number}</span>
          </div>
          <p className="guided-lede">{flow.proposal.rationale}</p>
          <div className="proposal-grid">
            <ProposalItem label="Audience" value={flow.proposal.audience} />
            <ProposalItem label="Action" value={flow.proposal.action} />
            <ProposalItem label="Owner contribution" value={flow.proposal.ownerContribution} />
            <ProposalItem label="Time and cost" value={`${flow.proposal.timeWindow} · ${flow.proposal.cost}`} />
            <ProposalItem label="Measurement" value={`${flow.proposal.metric}. ${flow.proposal.measurementPlan}`} />
            <ProposalItem label="Success rule" value={flow.proposal.successRule} />
            <ProposalItem label="Stopping rule" value={flow.proposal.stoppingRule} />
          </div>
          <details>
            <summary>Why other directions wait</summary>
            {flow.proposal.alternatives.map((item) => <p key={item}>{item}</p>)}
          </details>
          {flow.proposal.status === 'proposed' ? (
            <div className="guided-actions">
              <Button variant="outline" onClick={() => setCorrecting(true)} disabled={busy}>Correct the brief</Button>
              <Button onClick={() => act('accept_guided_experiment')} disabled={busy}>
                Accept this experiment <Check size={16} />
              </Button>
            </div>
          ) : (
            <>
              <div className="accepted-note"><Check size={18} /> Accepted. Next, prepare the work. Nothing has been sent or started.</div>
              <Button variant="outline" onClick={() => setCorrecting(true)} disabled={busy}>Correct brief</Button>
            </>
          )}
          {!!flow.proposalHistory?.length && (
            <details>
              <summary><History size={15} /> Earlier proposals preserved</summary>
              {flow.proposalHistory.map((item) => <p key={item.id}>{item.title} · {item.status}</p>)}
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function ProposalItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>;
}
