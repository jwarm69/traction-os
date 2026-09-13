'use client';

import { useState } from 'react';
import {
  Archive,
  ArrowRight,
  Bookmark,
  Compass,
  Lightbulb,
  MessageSquare,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  BusinessDocument,
  ExploreSuggestion,
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
const starters = [
  {
    label: 'Find traction opportunities',
    prompt:
      'Find the strongest near-term ways for this business to get meaningful traction. Give me distinct routes and recommend one.',
    icon: Compass,
  },
  {
    label: 'Find creators or channels',
    prompt:
      'Help me decide which creators, communities, or distribution channels are most worth investigating next.',
    icon: Search,
  },
  {
    label: 'Plan a content direction',
    prompt:
      'Propose a few repeatable content directions that fit this business, then recommend the best first test.',
    icon: Lightbulb,
  },
  {
    label: 'Improve the product',
    prompt:
      'Look for product improvements that could materially improve activation, proof, or word of mouth. Recommend where to start.',
    icon: Sparkles,
  },
];
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
  const [showEditor, setShowEditor] = useState(false);
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
  const send = async (suggestedPrompt?: string) => {
    const value = (suggestedPrompt || chat).trim();
    if (!value) return;
    const ok = await act('explore_chat', {
      message: value,
      ideaId: focusIdeaId || undefined,
    });
    if (ok) {
      setChat('');
      setFocusIdeaId('');
    }
  };
  const pursueIdea = async (ideaId: string) => {
    if (await act('pursue_idea', { ideaId })) openDo();
  };
  const pursueSuggestion = async (messageId: string, suggestionIndex: number) => {
    if (await act('pursue_suggestion', { messageId, suggestionIndex })) openDo();
  };
  const promptAbout = (suggestion: ExploreSuggestion, mode: 'compare' | 'research') => {
    setChat(
      mode === 'compare'
        ? `Compare “${suggestion.title}” with the strongest alternative. Explain the tradeoffs and tell me which one you recommend.`
        : `Before we pursue “${suggestion.title},” what should we research or validate first? Keep it focused and practical.`,
    );
    setFocusIdeaId('');
    document.querySelector('#explore-message')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="explore-shell">
      <div className="explore-guide">
        <div className="explore-guide-copy">
          <p className="eyebrow">EXPLORE WITH TRACTION</p>
          <h2>What should {b.name} try next?</h2>
          <p>
            Give me a sentence—or choose a starting point. I’ll use the context
            you already saved, develop several routes, and recommend where to
            focus.
          </p>
        </div>

        {!messages.length && (
          <div className="explore-starters" aria-label="Explore starting points">
            {starters.map((starter) => {
              const Icon = starter.icon;
              return (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => void send(starter.prompt)}
                  disabled={busy || !aiReady}
                >
                  <Icon size={17} />
                  <span>{starter.label}</span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </div>
        )}

        {!!messages.length && (
          <div className="message-list guided-message-list">
            {messages.map((message) => (
              <article className={`explore-message ${message.role}`} key={message.id}>
                <span>{message.role === 'owner' ? 'You' : 'Traction'}</span>
                <p>{message.content}</p>
                {!!message.suggestions?.length && (
                  <div className="suggestion-list">
                    {message.suggestions.map((suggestion, index) => {
                      const recommended = index === (message.recommendedSuggestionIndex ?? 0);
                      return (
                        <div className={recommended ? 'recommended' : ''} key={`${message.id}:${index}`}>
                          <div className="suggestion-heading">
                            <span className="idea-kind">{labels[suggestion.kind]}</span>
                            {recommended && <span className="recommendation-badge">Recommended</span>}
                          </div>
                          <strong>{suggestion.title}</strong>
                          <p>{suggestion.description}</p>
                          {recommended && message.recommendationReason && (
                            <p className="recommendation-reason">{message.recommendationReason}</p>
                          )}
                          {(suggestion.audience || suggestion.outcome) && (
                            <div className="suggestion-meta">
                              {suggestion.audience && <span>For {suggestion.audience}</span>}
                              {suggestion.outcome && <span>Aims for {suggestion.outcome}</span>}
                            </div>
                          )}
                          <div className="suggestion-actions">
                            <Button size="sm" disabled={busy} onClick={() => void pursueSuggestion(message.id, index)}>
                              Pursue in Do <ArrowRight size={14} />
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => promptAbout(suggestion, 'compare')}>Compare</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => promptAbout(suggestion, 'research')}>Research first</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('create_idea', { ...suggestion, ownerNotes: '', sources: [] })}>
                              <Bookmark size={14} /> Keep
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {message.nextQuestion && (
                  <button
                    type="button"
                    className="next-question"
                    onClick={() => {
                      setChat('');
                      document.querySelector<HTMLTextAreaElement>('#explore-message')?.focus();
                    }}
                  >
                    <span>One thing worth deciding</span>
                    {message.nextQuestion}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="explore-composer">
          <label htmlFor="explore-message">
            {focusIdeaId ? 'What do you want to work through?' : 'What are you trying to figure out?'}
          </label>
          {focusIdeaId && (
            <div className="composer-focus">
              Discussing {ideas.find((idea) => idea.id === focusIdeaId)?.title}
              <button type="button" onClick={() => setFocusIdeaId('')}>Clear</button>
            </div>
          )}
          <Textarea
            id="explore-message"
            value={chat}
            onChange={(event) => setChat(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send();
            }}
            placeholder="For example: We need more qualified people at the top of the funnel, but I don't want to rely on paid ads."
          />
          <div className="chat-actions">
            <span className="small muted">
              {aiReady
                ? 'Uses saved business context. Suggestions stay proposals until you pursue them.'
                : 'Connect AI to explore a direction.'}
            </span>
            <Button disabled={busy || !aiReady || !chat.trim()} onClick={() => void send()}>
              {busy ? 'Thinking…' : 'Explore options'} <Sparkles size={15} />
            </Button>
          </div>
        </div>
      </div>

      <div className="saved-directions-heading">
        <div><p className="eyebrow">SAVED DIRECTIONS</p><h3>Ideas worth keeping visible</h3></div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(blank());
            setShowEditor((value) => !value);
          }}
          disabled={busy}
        >
          <Lightbulb size={15} /> Add manually
        </Button>
      </div>

      {showEditor && (
        <div className="idea-editor compact">
          <div className="idea-editor-head">
            <div><p className="eyebrow">OPTIONAL MANUAL ENTRY</p><h3>{draft.id ? 'Edit direction' : 'Keep a direction'}</h3></div>
            <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
          </div>
          <div className="idea-form-row">
            <div>
              <label htmlFor="idea-title">Title</label>
              <Input id="idea-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Creator collaboration series" />
            </div>
            <div>
              <label htmlFor="idea-kind">Type</label>
              <select id="idea-kind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as IdeaKind })}>
                {ideaKinds.map((kind) => <option value={kind} key={kind}>{labels[kind]}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="idea-description">The direction</label>
          <Textarea id="idea-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What could we do, and why might it be worth exploring?" />
          <details className="idea-advanced-fields">
            <summary>Add audience, outcome, notes, or sources</summary>
            <div className="idea-form-row">
              <div><label htmlFor="idea-audience">Audience</label><Input id="idea-audience" value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} /></div>
              <div><label htmlFor="idea-outcome">Intended outcome</label><Input id="idea-outcome" value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })} /></div>
            </div>
            <label htmlFor="idea-notes">Your notes</label>
            <Textarea id="idea-notes" value={draft.ownerNotes} onChange={(event) => setDraft({ ...draft, ownerNotes: event.target.value })} />
            <label htmlFor="idea-sources">Supporting links</label>
            <Textarea id="idea-sources" value={draft.sources} onChange={(event) => setDraft({ ...draft, sources: event.target.value })} placeholder="One HTTPS link per line" />
          </details>
          <div className="idea-editor-actions">
            <span className="small muted">Only a title and direction are required.</span>
            <Button disabled={busy || !draft.title.trim() || !draft.description.trim()} onClick={save}>{draft.id ? 'Save changes' : 'Keep direction'}</Button>
          </div>
        </div>
      )}

      <div className="idea-list">
        {!ideas.length && !showEditor && (
          <div className="saved-directions-empty">
            <Compass size={20} />
            <p>Your pursued and kept directions will collect here automatically.</p>
          </div>
        )}
        {ideas.map((idea) => (
          <article className={`idea-card ${idea.status}`} key={idea.id}>
            <div className="idea-card-head">
              <div><span className="idea-kind">{labels[idea.kind]}</span><h3>{idea.title}</h3></div>
              <span className={`idea-status ${idea.status}`}>{idea.status}</span>
            </div>
            <p>{idea.description}</p>
            <details className="idea-card-details">
              <summary>View context</summary>
              {(idea.audience || idea.outcome) && (
                <div className="idea-meta">
                  {idea.audience && <span><strong>Audience</strong>{idea.audience}</span>}
                  {idea.outcome && <span><strong>Outcome</strong>{idea.outcome}</span>}
                </div>
              )}
              {idea.ownerNotes && <p className="idea-note">Owner note: {idea.ownerNotes}</p>}
              {!!idea.sources.length && <div className="idea-sources">{idea.sources.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{sourceLabel(source)}</a>)}</div>}
              {idea.parkedReason && <p className="parked-reason">Parked because: {idea.parkedReason}</p>}
            </details>
            {parkingId === idea.id ? (
              <div className="park-form">
                <Input value={parkReason} onChange={(event) => setParkReason(event.target.value)} placeholder="Why are we parking this?" />
                <Button size="sm" disabled={busy || !parkReason.trim()} onClick={async () => {
                  if (await act('park_idea', { ideaId: idea.id, reason: parkReason })) { setParkingId(''); setParkReason(''); }
                }}>Park</Button>
                <Button size="sm" variant="ghost" onClick={() => setParkingId('')}>Cancel</Button>
              </div>
            ) : (
              <div className="idea-actions">
                {idea.status === 'active' && <Button size="sm" onClick={() => void pursueIdea(idea.id)} disabled={busy}>Pursue in Do <ArrowRight size={14} /></Button>}
                <Button size="sm" variant="outline" onClick={() => { setFocusIdeaId(idea.id); setChat(`Help me develop “${idea.title}” further.`); document.querySelector('#explore-message')?.scrollIntoView({ behavior: 'smooth' }); }}><MessageSquare size={14} /> Discuss</Button>
                <Button size="sm" variant="ghost" onClick={() => edit(idea)} disabled={busy}><Pencil size={14} /> Edit</Button>
                {idea.status === 'active' ? (
                  <Button size="sm" variant="ghost" onClick={() => { setParkingId(idea.id); setParkReason(''); }} disabled={busy}><Archive size={14} /> Park</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => act('restore_idea', { ideaId: idea.id })} disabled={busy}><RotateCcw size={14} /> Restore</Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
