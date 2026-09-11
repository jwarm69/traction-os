'use client';

import { useState } from 'react';
import { Archive, Lightbulb, MessageSquare, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  BusinessDocument,
  IdeaKind,
  MarketingIdea,
} from '@/lib/engine';
import { ideaKinds } from '@/lib/explore';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
type Draft = {
  id?: string;
  title: string;
  kind: IdeaKind;
  description: string;
  audience: string;
  outcome: string;
  ownerNotes: string;
  sources: string;
};

const blank = (): Draft => ({
  title: '',
  kind: 'campaign',
  description: '',
  audience: '',
  outcome: '',
  ownerNotes: '',
  sources: '',
});
const labels: Record<IdeaKind, string> = {
  research: 'Research',
  content: 'Content',
  outreach: 'Outreach',
  campaign: 'Campaign',
  experiment: 'Experiment',
  product_improvement: 'Product improvement',
};
const sourceLabel = (source: string) => {
  try {
    return new URL(source).hostname;
  } catch {
    return 'Source';
  }
};

export default function ExploreWorkspace({
  b,
  act,
  busy,
  aiReady,
  openDo,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
  aiReady: boolean;
  openDo: () => void;
}) {
  const ideas = b.explore?.ideas || [];
  const messages = b.explore?.messages || [];
  const [draft, setDraft] = useState<Draft>(blank);
  const [showEditor, setShowEditor] = useState(!ideas.length);
  const [parkingId, setParkingId] = useState('');
  const [parkReason, setParkReason] = useState('');
  const [chat, setChat] = useState('');
  const [focusIdeaId, setFocusIdeaId] = useState('');

  const edit = (idea: MarketingIdea) => {
    setDraft({
      id: idea.id,
      title: idea.title,
      kind: idea.kind,
      description: idea.description,
      audience: idea.audience,
      outcome: idea.outcome,
      ownerNotes: idea.ownerNotes,
      sources: idea.sources.join('\n'),
    });
    setShowEditor(true);
  };
  const reset = () => {
    setDraft(blank());
    setShowEditor(false);
  };
  const save = async () => {
    const ok = await act(draft.id ? 'update_idea' : 'create_idea', {
      ideaId: draft.id,
      ...draft,
      sources: draft.sources
        .split(/\s+/)
        .map((source) => source.trim())
        .filter(Boolean),
    });
    if (ok) reset();
  };
  const send = async () => {
    const value = chat.trim();
    if (!value) return;
    const ok = await act('explore_chat', {
      message: value,
      ideaId: focusIdeaId || undefined,
    });
    if (ok) setChat('');
  };

  return (
    <section className="explore-shell">
      <div className="explore-intro">
        <div>
          <p className="eyebrow">EXPLORE</p>
          <h2>Develop the possibilities before committing the work.</h2>
          <p className="muted">
            Keep marketing and product ideas here, reason through them with AI,
            and preserve why you pursue or park each direction.
          </p>
        </div>
        <div className="idea-actions">
          <Button variant="outline" onClick={() => act('run_ideation')} disabled={busy || !aiReady}>Run ideation</Button>
          <Button
            onClick={() => {
              setDraft(blank());
              setShowEditor(true);
            }}
            disabled={busy}
          >
            <Lightbulb size={16} /> Add idea
          </Button>
        </div>
      </div>

      {showEditor && (
        <div className="idea-editor">
          <div className="idea-editor-head">
            <h3>{draft.id ? 'Edit idea' : 'Capture an idea'}</h3>
            <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
          </div>
          <div className="idea-form-row">
            <div>
              <label htmlFor="idea-title">Title</label>
              <Input
                id="idea-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Creator collaboration series"
              />
            </div>
            <div>
              <label htmlFor="idea-kind">Type</label>
              <select
                id="idea-kind"
                value={draft.kind}
                onChange={(event) => setDraft({ ...draft, kind: event.target.value as IdeaKind })}
              >
                {ideaKinds.map((kind) => <option value={kind} key={kind}>{labels[kind]}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="idea-description">Possibility</label>
          <Textarea
            id="idea-description"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="What could we do, and why might it be worth exploring?"
          />
          <div className="idea-form-row">
            <div>
              <label htmlFor="idea-audience">Audience</label>
              <Input id="idea-audience" value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} placeholder="Who this could reach" />
            </div>
            <div>
              <label htmlFor="idea-outcome">Intended outcome</label>
              <Input id="idea-outcome" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })} placeholder="What useful change we want" />
            </div>
          </div>
          <label htmlFor="idea-notes">Your notes</label>
          <Textarea id="idea-notes" value={draft.ownerNotes} onChange={(event) => setDraft({ ...draft, ownerNotes: event.target.value })} placeholder="Constraints, instincts, or context in your words" />
          <label htmlFor="idea-sources">Supporting links</label>
          <Textarea id="idea-sources" value={draft.sources} onChange={(event) => setDraft({ ...draft, sources: event.target.value })} placeholder="One HTTPS link per line" />
          <div className="idea-editor-actions">
            <span className="small muted">Only the title and possibility are required.</span>
            <Button disabled={busy || !draft.title.trim() || !draft.description.trim()} onClick={save}>
              {draft.id ? 'Save changes' : 'Save idea'}
            </Button>
          </div>
        </div>
      )}

      <div className="idea-list">
        {!ideas.length && !showEditor && <p className="empty-copy">No ideas saved yet.</p>}
        {ideas.map((idea) => (
          <article className={`idea-card ${idea.status}`} key={idea.id}>
            <div className="idea-card-head">
              <div>
                <span className="idea-kind">{labels[idea.kind]}</span>
                <h3>{idea.title}</h3>
              </div>
              <span className={`idea-status ${idea.status}`}>{idea.status}</span>
            </div>
            <p>{idea.description}</p>
            {(idea.audience || idea.outcome) && (
              <div className="idea-meta">
                {idea.audience && <span><strong>Audience</strong>{idea.audience}</span>}
                {idea.outcome && <span><strong>Outcome</strong>{idea.outcome}</span>}
              </div>
            )}
            {idea.ownerNotes && <p className="idea-note">Owner note: {idea.ownerNotes}</p>}
            {!!idea.sources.length && <div className="idea-sources">{idea.sources.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{sourceLabel(source)}</a>)}</div>}
            {idea.parkedReason && <p className="parked-reason">Parked because: {idea.parkedReason}</p>}
            {parkingId === idea.id ? (
              <div className="park-form">
                <Input value={parkReason} onChange={(event) => setParkReason(event.target.value)} placeholder="Why are we parking this?" />
                <Button size="sm" disabled={busy || !parkReason.trim()} onClick={async () => {
                  if (await act('park_idea', { ideaId: idea.id, reason: parkReason })) {
                    setParkingId('');
                    setParkReason('');
                  }
                }}>Park</Button>
                <Button size="sm" variant="ghost" onClick={() => setParkingId('')}>Cancel</Button>
              </div>
            ) : (
              <div className="idea-actions">
                <Button size="sm" variant="outline" onClick={() => edit(idea)} disabled={busy}><Pencil size={14} /> Edit</Button>
                {idea.status === 'active' ? (
                  <Button size="sm" variant="ghost" onClick={() => { setParkingId(idea.id); setParkReason(''); }} disabled={busy}><Archive size={14} /> Park</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => act('restore_idea', { ideaId: idea.id })} disabled={busy}><RotateCcw size={14} /> Restore</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setFocusIdeaId(idea.id); document.querySelector('#explore-message')?.scrollIntoView({ behavior: 'smooth' }); }}><MessageSquare size={14} /> Discuss</Button>
                {idea.status === 'active' && <Button size="sm" onClick={openDo}>Prepare in Do</Button>}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="explore-chat">
        <div className="chat-heading">
          <div>
            <p className="eyebrow">THINK TOGETHER</p>
            <h3>Develop the direction</h3>
          </div>
          <select value={focusIdeaId} onChange={(event) => setFocusIdeaId(event.target.value)} aria-label="Discussion focus">
            <option value="">Whole business</option>
            {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
          </select>
        </div>
        <p className="small muted">Suggestions are proposals until you save them. This conversation does not perform web research.</p>
        <div className="message-list">
          {!messages.length && <p className="empty-copy">Ask for alternatives, pressure-test an idea, or explain what you are considering.</p>}
          {messages.map((message) => (
            <article className={`explore-message ${message.role}`} key={message.id}>
              <span>{message.role === 'owner' ? 'You' : 'Traction'}</span>
              <p>{message.content}</p>
              {!!message.suggestions?.length && (
                <div className="suggestion-list">
                  {message.suggestions.map((suggestion, index) => (
                    <div key={`${message.id}:${index}`}>
                      <strong>{suggestion.title}</strong>
                      <p>{suggestion.description}</p>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act('create_idea', { ...suggestion, ownerNotes: '', sources: [] })}>Save as idea</Button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        <label htmlFor="explore-message">What are you considering?</label>
        <Textarea id="explore-message" value={chat} onChange={(event) => setChat(event.target.value)} placeholder="For example: Compare a creator collaboration with a daily content series. We have no ad budget." />
        <div className="chat-actions">
          <span className="small muted">{aiReady ? 'Uses this business’s saved context.' : 'Connect AI to get a response.'}</span>
          <Button disabled={busy || !aiReady || !chat.trim()} onClick={send}>Discuss with AI</Button>
        </div>
      </div>
    </section>
  );
}
