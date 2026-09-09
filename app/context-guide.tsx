'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessDocument } from '@/lib/engine';

export default function ContextGuide({ b, act, busy, openMemory }: {
  b: BusinessDocument;
  act: (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  openMemory: () => void;
}) {
  const [update, setUpdate] = useState('');
  return <section className="context-guide">
    <p className="eyebrow">YOUR BUSINESS, IN YOUR WORDS</p>
    <h2>What should we know about {b.name}?</h2>
    <p className="muted">Tell us what you sell, who buys, what you’ve tried, or what changed. Your updates become context for future plans.</p>
    <label htmlFor="business-update">Add an update or answer a question below</label>
    <Textarea id="business-update" value={update} onChange={e => setUpdate(e.target.value)} maxLength={4000} rows={5}
      placeholder="We’re focusing on… Our customers are… The biggest thing holding us back is…"/>
    <div className="action-row">
      <Button disabled={busy || !update.trim()} onClick={async () => {
        if (await act('save_context', { update })) setUpdate('');
      }}>Save business update</Button>
      <Button variant="outline" disabled={busy || !!update.trim() || !b.notes.trim()} onClick={() => act('organize_context')}>Help me clarify the next move</Button>
    </div>
    {!!update.trim() && <p className="small muted">Save your update first so the assistant can use it.</p>}
    {b.contextDraft && <div className="context-summary">
      <p className="eyebrow">ASSISTANT’S READING · CHECK THIS</p>
      <p style={{whiteSpace:'pre-wrap'}}>{b.contextDraft.summary}</p>
      {b.contextDraft.questions.length > 0 && <><h3>A few things that would help</h3><ol>{b.contextDraft.questions.map(q => <li key={q}>{q}</li>)}</ol></>}
    </div>}
    <details><summary>Read saved owner context</summary><p style={{whiteSpace:'pre-wrap'}}>{b.notes || 'No owner updates yet. Start with a few sentences above.'}</p><Button variant="ghost" onClick={openMemory}>Edit goals, resources, and research</Button></details>
  </section>;
}
