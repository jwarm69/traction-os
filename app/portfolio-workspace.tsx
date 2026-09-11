'use client';

import { useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessDocument, PortfolioState } from '@/lib/engine';

type Summary = {
  id: string;
  name: string;
  mode: string;
  portfolio?: PortfolioState;
  workSummary?: {
    total: number;
    active: number;
    blocked: number;
    latestObservation?: string;
  };
};
type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
const priorityLabels = {
  now: 'Now',
  next: 'Next',
  maintain: 'Maintain',
  paused: 'Paused',
};

export default function PortfolioWorkspace({
  b,
  businesses,
  act,
  busy,
  selectBusiness,
}: {
  b: BusinessDocument;
  businesses: Summary[];
  act: Act;
  busy: boolean;
  selectBusiness: (id: string) => void;
}) {
  const [priority, setPriority] = useState<PortfolioState['priority']>(b.portfolio?.priority || 'next');
  const [hours, setHours] = useState(b.portfolio?.ownerHours?.toString() || '');
  const [note, setNote] = useState(b.portfolio?.note || '');
  const ordered = [...businesses].sort((a, z) => {
    const order = { now: 0, next: 1, maintain: 2, paused: 3 };
    return order[a.portfolio?.priority || 'next'] - order[z.portfolio?.priority || 'next'];
  });
  return <section className="portfolio-shell">
    <div className="explore-intro"><div><p className="eyebrow">PORTFOLIO</p><h2>Put scarce owner attention where it matters now.</h2><p className="muted">Priorities are owner decisions. Work counts and observations come from each business record.</p></div></div>
    <div className="portfolio-editor"><h3>Set {b.name}’s place</h3><select value={priority} onChange={(event) => setPriority(event.target.value as PortfolioState['priority'])}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Owner hours committed this week" /><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this business gets this level of attention" /><Button disabled={busy} onClick={() => act('set_portfolio', { priority, ownerHours: hours, note })}>Save portfolio priority</Button></div>
    <div className="portfolio-grid">{ordered.map((business) => <article className={`portfolio-card priority-${business.portfolio?.priority || 'next'}`} key={business.id}><div><span className="idea-kind">{priorityLabels[business.portfolio?.priority || 'next']}</span><h3>{business.name}</h3><p>{business.portfolio?.note || 'No owner rationale recorded yet.'}</p></div><div className="portfolio-metrics"><span><Clock3 size={14} /> {business.portfolio?.ownerHours ?? '—'} owner hours</span><span>{business.workSummary?.active || 0} active work item{business.workSummary?.active === 1 ? '' : 's'}</span>{!!business.workSummary?.blocked && <span className="blocked-metric"><AlertTriangle size={14} /> {business.workSummary.blocked} blocked</span>}</div>{business.workSummary?.latestObservation && <p className="latest-learning"><strong>Latest observation</strong>{business.workSummary.latestObservation}</p>}<Button size="sm" variant="outline" onClick={() => selectBusiness(business.id)}>Open business</Button></article>)}</div>
  </section>;
}
