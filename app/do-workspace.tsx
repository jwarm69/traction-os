'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ArtifactKind,
  BusinessDocument,
  Endeavor,
  EndeavorStatus,
} from '@/lib/engine';
import { activeArtifact, sourceIdeaChanged } from '@/lib/work';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
const statusLabels: Record<EndeavorStatus, string> = {
  preparing: 'Preparing',
  ready: 'Ready',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  stopped: 'Stopped',
};
const artifactLabels: Record<ArtifactKind, string> = {
  content: 'Content or script',
  outreach: 'Outreach pitch',
  research_notes: 'Research notes',
  product_brief: 'Product improvement brief',
};
const possible: Record<EndeavorStatus, EndeavorStatus[]> = {
  preparing: ['ready', 'blocked', 'stopped'],
  ready: ['in_progress', 'blocked', 'stopped'],
  in_progress: ['blocked', 'completed', 'stopped'],
  blocked: ['preparing', 'ready', 'in_progress', 'stopped'],
  completed: ['in_progress'],
  stopped: ['preparing'],
};

export default function DoWorkspace({
  b,
  act,
  busy,
  aiReady,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
  aiReady: boolean;
}) {
  const endeavors = b.work?.endeavors || [];
  const [selectedId, setSelectedId] = useState(endeavors[0]?.id || '');
  const selected = endeavors.find((item) => item.id === selectedId) || endeavors[0];
  const [prepareId, setPrepareId] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [effort, setEffort] = useState('');
  const [criteria, setCriteria] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [step, setStep] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>('content');
  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactContent, setArtifactContent] = useState('');
  const [artifactInstruction, setArtifactInstruction] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [candidate, setCandidate] = useState({ name: '', url: '', facts: '', rationale: '', uncertainties: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [observation, setObservation] = useState({ summary: '', evidence: '', source: '', effort: '', decision: '' });
  const activeIdeas = (b.explore?.ideas || []).filter(
    (idea) =>
      idea.status === 'active' &&
      !endeavors.some((work) => work.sourceIdeaId === idea.id && work.status !== 'stopped'),
  );
  const artifact = useMemo(
    () => selected?.artifacts.find((item) => item.id === artifactId),
    [selected, artifactId],
  );

  const prepare = async () => {
    const ok = await act('select_idea', {
      ideaId: prepareId,
      intendedDeliverables: deliverables.split('\n').map((value) => value.trim()).filter(Boolean),
      effortBudget: effort,
      completionCriteria: criteria,
    });
    if (ok) {
      setPrepareId('');
      setDeliverables('');
      setEffort('');
      setCriteria('');
    }
  };
  const changeStatus = async (status: EndeavorStatus) => {
    const ok = await act('transition_work', {
      endeavorId: selected.id,
      status,
      reason: status === 'blocked' ? blockedReason : '',
    });
    if (ok) setBlockedReason('');
  };
  const loadArtifact = (value: NonNullable<Endeavor['artifacts'][number]>) => {
    const version = activeArtifact(value);
    setArtifactId(value.id);
    setArtifactKind(value.kind);
    setArtifactTitle(value.title);
    setArtifactContent(version?.content || '');
  };
  const clearArtifact = () => {
    setArtifactId('');
    setArtifactTitle('');
    setArtifactContent('');
    setArtifactInstruction('');
  };
  const saveDraft = async () => {
    if (await act('save_artifact', { endeavorId: selected.id, artifactId: artifactId || undefined, kind: artifactKind, title: artifactTitle, content: artifactContent })) clearArtifact();
  };
  const generate = async () => {
    if (await act('generate_artifact', { endeavorId: selected.id, artifactId: artifactId || undefined, kind: artifactKind, title: artifactTitle, instruction: artifactInstruction })) clearArtifact();
  };
  const copy = async (content: string) => navigator.clipboard.writeText(content);
  const download = (title: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'artifact'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const saveResearchNotes = async () => {
    const shortlisted = selected.research.filter((item) => item.status === 'shortlisted');
    const content = shortlisted.map((item) => `## ${item.name}\n\nSource: ${item.url}\nRetrieved: ${item.retrievedAt}\n\nObserved facts:\n${item.observedFacts.map((fact) => `- ${fact}`).join('\n')}\n\nFit rationale:\n${item.fitRationale}\n\nUnknowns:\n${item.uncertainties.map((value) => `- ${value}`).join('\n')}`).join('\n\n');
    await act('save_artifact', { endeavorId: selected.id, kind: 'research_notes', title: `${selected.title} — shortlisted research`, content });
  };

  return (
    <section className="do-shell">
      <div className="explore-intro">
        <div><p className="eyebrow">DO</p><h2>Turn a chosen direction into reviewable work.</h2><p className="muted">Preparation, artifacts, research, external actions, and outcomes stay distinct.</p></div>
      </div>

      <div className="do-prepare">
        <h3>Move an Explore idea into Do</h3>
        {activeIdeas.length ? <>
          <select value={prepareId} onChange={(event) => setPrepareId(event.target.value)}><option value="">Choose an active idea</option>{activeIdeas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}</select>
          {prepareId && <div className="do-prepare-form">
            <Textarea value={deliverables} onChange={(event) => setDeliverables(event.target.value)} placeholder="One intended deliverable per line" />
            <Input value={effort} onChange={(event) => setEffort(event.target.value)} placeholder="Owner time and budget available" />
            <Textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="What makes this work item complete?" />
            <Button disabled={busy || !deliverables.trim() || !effort.trim() || !criteria.trim()} onClick={prepare}>Prepare in Do</Button>
          </div>}
        </> : <p className="small muted">Save an active idea in Explore, or open an accepted guided proposal.</p>}
        {b.guided?.proposal?.status === 'accepted' && !endeavors.some((item) => item.sourceGuidedProposalId === b.guided?.proposal?.id) && <Button variant="outline" disabled={busy} onClick={() => act('prepare_guided_work')}>Prepare accepted guided proposal</Button>}
      </div>

      {!!endeavors.length && <div className="do-layout">
        <nav className="work-list" aria-label="Do work items">{endeavors.map((item) => <button key={item.id} className={selected?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><strong>{item.title}</strong><span>{statusLabels[item.status]}</span></button>)}</nav>
        {selected && <div className="work-detail">
          <div className="work-title"><div><span className={`idea-status ${selected.status}`}>{statusLabels[selected.status]}</span><h2>{selected.title}</h2></div></div>
          <p>{selected.description}</p>
          {sourceIdeaChanged(b, selected) && <p className="context-warning">The Explore idea changed after this work was selected. This brief still uses the frozen version.</p>}
          <div className="work-brief-grid"><div><strong>Effort / budget</strong><p>{selected.effortBudget}</p></div><div><strong>Completion means</strong><p>{selected.completionCriteria}</p></div></div>
          {selected.blockedReason && <p className="parked-reason">Blocked: {selected.blockedReason}</p>}
          <div className="status-actions">{possible[selected.status].map((status) => <Button key={status} size="sm" variant="outline" disabled={busy || (status === 'blocked' && !blockedReason.trim())} onClick={() => changeStatus(status)}>Move to {statusLabels[status]}</Button>)}</div>
          {possible[selected.status].includes('blocked') && <Input value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="Required before marking blocked" />}

          <div className="work-section"><h3>Checklist</h3>{selected.checklist.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={(event) => act('set_checklist_item', { endeavorId: selected.id, itemId: item.id, done: event.target.checked })} /><span>{item.text}</span></label>)}<div className="inline-add"><Input value={step} onChange={(event) => setStep(event.target.value)} placeholder="Add a preparation step" /><Button size="sm" disabled={busy || !step.trim()} onClick={async () => { if (await act('add_checklist_item', { endeavorId: selected.id, text: step })) setStep(''); }}><Plus size={14} /> Add</Button></div></div>

          <div className="work-section"><h3>Artifacts</h3><p className="small muted">Drafting never means sent, published, or deployed. Every edit creates a version.</p>{selected.artifacts.map((item) => { const version = activeArtifact(item); return <article className="artifact-card" key={item.id}><div><span className="idea-kind">{artifactLabels[item.kind]}</span><h4>{item.title}</h4><small>{item.versions.length} version{item.versions.length === 1 ? '' : 's'} · {item.reviewedAt ? 'Reviewed' : 'Needs review'}</small></div><pre>{version?.content}</pre><div className="idea-actions"><Button size="sm" variant="outline" onClick={() => loadArtifact(item)}>Edit / new version</Button><Button size="sm" variant="ghost" onClick={() => copy(version?.content || '')}><Copy size={14} /> Copy</Button><Button size="sm" variant="ghost" onClick={() => download(item.title, version?.content || '')}><Download size={14} /> Markdown</Button>{!item.reviewedAt && <Button size="sm" onClick={() => act('review_artifact', { endeavorId: selected.id, artifactId: item.id })}><Check size={14} /> Mark reviewed</Button>}</div></article>; })}
            <div className="artifact-editor"><select value={artifactKind} onChange={(event) => setArtifactKind(event.target.value as ArtifactKind)}>{Object.entries(artifactLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder="Artifact title" /><Textarea value={artifactContent} onChange={(event) => setArtifactContent(event.target.value)} placeholder="Write or paste a manual draft" /><Input value={artifactInstruction} onChange={(event) => setArtifactInstruction(event.target.value)} placeholder="Optional instructions for an AI draft" /><div className="idea-actions"><Button variant="outline" disabled={busy || !artifactTitle.trim() || !artifactContent.trim()} onClick={saveDraft}>Save manual version</Button><Button disabled={busy || !aiReady || !artifactTitle.trim()} onClick={generate}>Generate draft</Button>{artifact && <Button variant="ghost" onClick={clearArtifact}>Cancel edit</Button>}</div></div>
          </div>

          <div className="work-section"><h3>Research</h3><p className="small muted">Source-backed observations are kept separate from fit rationale and unknowns.</p><div className="inline-add"><Input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Research creators, channels, partners, or examples" /><Button disabled={busy || !aiReady || !researchQuery.trim()} onClick={async () => { if (await act('research_work', { endeavorId: selected.id, query: researchQuery })) setResearchQuery(''); }}><Search size={14} /> Research</Button></div>
            {selected.research.map((item) => <article className="research-card" key={item.id}><div><h4>{item.name}</h4><a href={item.url} target="_blank" rel="noreferrer">Source <ExternalLink size={12} /></a></div><strong>Observed</strong><ul>{item.observedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul><strong>Why it may fit</strong><p>{item.fitRationale}</p><strong>Unknown</strong><ul>{item.uncertainties.map((value) => <li key={value}>{value}</li>)}</ul><div className="idea-actions"><Button size="sm" variant="outline" disabled={busy} onClick={() => act('review_research_candidate', { endeavorId: selected.id, candidateId: item.id, status: 'shortlisted' })}>Shortlist</Button><Button size="sm" variant="ghost" disabled={busy || !rejectReason.trim()} onClick={() => act('review_research_candidate', { endeavorId: selected.id, candidateId: item.id, status: 'rejected', reason: rejectReason })}>Reject</Button><span className={`idea-status ${item.status}`}>{item.status}</span></div></article>)}
            {selected.research.some((item) => item.status === 'shortlisted') && <Button variant="outline" disabled={busy} onClick={saveResearchNotes}>Save shortlist as research-notes artifact</Button>}
            <Input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reason required before rejecting a candidate" />
            <details><summary>Add sourced research manually</summary><div className="manual-research"><Input value={candidate.name} onChange={(event) => setCandidate({ ...candidate, name: event.target.value })} placeholder="Candidate or channel" /><Input value={candidate.url} onChange={(event) => setCandidate({ ...candidate, url: event.target.value })} placeholder="Supporting HTTPS URL" /><Textarea value={candidate.facts} onChange={(event) => setCandidate({ ...candidate, facts: event.target.value })} placeholder="One observed fact per line" /><Textarea value={candidate.rationale} onChange={(event) => setCandidate({ ...candidate, rationale: event.target.value })} placeholder="Why it may fit" /><Textarea value={candidate.uncertainties} onChange={(event) => setCandidate({ ...candidate, uncertainties: event.target.value })} placeholder="One unknown per line" /><Button disabled={busy || !candidate.name || !candidate.url || !candidate.rationale} onClick={async () => { const ok = await act('add_research_candidate', { endeavorId: selected.id, name: candidate.name, url: candidate.url, observedFacts: candidate.facts.split('\n').filter(Boolean), fitRationale: candidate.rationale, uncertainties: candidate.uncertainties.split('\n').filter(Boolean) }); if (ok) setCandidate({ name: '', url: '', facts: '', rationale: '', uncertainties: '' }); }}>Save sourced candidate</Button></div></details>
          </div>

          <div className="work-section"><h3>Observations and learning</h3>{selected.observations.map((item) => <article className="observation" key={item.id}><strong>{item.summary}</strong><p>{item.nextDecision}</p><small>{new Date(item.observedAt).toLocaleDateString()} · {item.source}{item.actualEffort ? ` · ${item.actualEffort}` : ''}</small>{item.evidenceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">Evidence</a>)}</article>)}<div className="observation-form"><Textarea value={observation.summary} onChange={(event) => setObservation({ ...observation, summary: event.target.value })} placeholder="What was actually observed? Qualitative or inconclusive is okay." /><Input value={observation.source} onChange={(event) => setObservation({ ...observation, source: event.target.value })} placeholder="Who or what produced this observation?" /><Input value={observation.evidence} onChange={(event) => setObservation({ ...observation, evidence: event.target.value })} placeholder="HTTPS evidence links, separated by spaces" /><Input value={observation.effort} onChange={(event) => setObservation({ ...observation, effort: event.target.value })} placeholder="Actual owner time or spend" /><Textarea value={observation.decision} onChange={(event) => setObservation({ ...observation, decision: event.target.value })} placeholder="What decision follows?" /><Button disabled={busy || !observation.summary.trim() || !observation.source.trim() || !observation.decision.trim()} onClick={async () => { const ok = await act('add_observation', { endeavorId: selected.id, summary: observation.summary, source: observation.source, evidenceUrls: observation.evidence.split(/\s+/).filter(Boolean), actualEffort: observation.effort, nextDecision: observation.decision }); if (ok) setObservation({ summary: '', evidence: '', source: '', effort: '', decision: '' }); }}>Record observation</Button></div></div>
        </div>}
      </div>}
    </section>
  );
}
