'use client';

import { useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessDocument, PortfolioState } from '@/lib/engine';
import { campaignTable, type CampaignRow } from '@/lib/campaigns';

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

const statusLabels = {
  preparing: 'Preparing',
  ready: 'Ready',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  stopped: 'Stopped',
};

/** Unknown stays unknown. Never render a null as 0 or a dash. */
function Cell({
  value,
  row,
  label,
  money,
}: {
  value: number | null;
  row: CampaignRow;
  label: string;
  money?: boolean;
}) {
  if (value === null) {
    const reason =
      row.unknowns.find((item) => item.toLowerCase().startsWith(label.toLowerCase())) ||
      `${label} is unknown.`;
    return (
      <td className="campaign-unknown" title={reason}>
        unknown
      </td>
    );
  }
  return (
    <td>
      {money
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : value.toLocaleString()}
    </td>
  );
}

function CampaignTable({ b }: { b: BusinessDocument }) {
  const rows = campaignTable(b);
  if (!rows.length)
    return (
      <p className="muted small">
        No campaigns yet. Selecting an Explore idea or preparing a guided
        proposal in Do assigns the first campaign code.
      </p>
    );
  return (
    <div className="campaign-table-wrap">
      <table className="campaign-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Campaign</th>
            <th>Status</th>
            <th>Spend</th>
            <th>Contacts</th>
            <th>Conversations</th>
            <th>Leads</th>
            <th>Qualified</th>
            <th>Deals</th>
            <th>Revenue</th>
            <th>Churned</th>
            <th>Cost / conversation</th>
            <th>Cost / deal</th>
            <th>Last evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.endeavorId}>
              <td>
                <span className="pill campaign-code">{row.code}</span>
              </td>
              <td>{row.title}</td>
              <td>{statusLabels[row.status]}</td>
              <Cell value={row.spend} row={row} label="Spend" money />
              <td title={`${row.contacted} contacted · ${row.replied} replied · ${row.won} won · ${row.lost} lost`}>
                {row.contacts}
              </td>
              <td>{row.conversations}</td>
              <Cell value={row.leads} row={row} label="Leads" />
              <Cell value={row.qualified} row={row} label="Qualified" />
              <Cell value={row.deals} row={row} label="Deals" />
              <Cell value={row.revenue} row={row} label="Revenue" money />
              <Cell value={row.churned} row={row} label="Churned" />
              <Cell
                value={row.costPerConversation}
                row={row}
                label="Cost per conversation"
                money
              />
              <Cell value={row.costPerDeal} row={row} label="Cost per deal" money />
              <td className={row.stale ? 'campaign-stale' : undefined}>
                {row.lastEvidenceAt
                  ? new Date(row.lastEvidenceAt).toLocaleDateString()
                  : 'none'}
                {row.stale && (
                  <small title="In progress with no evidence in the last 14 days">
                    {' '}
                    · stale{row.lastEvidenceAt ? ` since ${new Date(row.lastEvidenceAt).toLocaleDateString()}` : ''}
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
    <div className="portfolio-campaigns">
      <h3>Campaigns in {b.name}</h3>
      <p className="muted small">Counts are observations. Nothing here attributes revenue to a campaign causally. Unknown means no evidence was recorded, not zero.</p>
      <CampaignTable b={b} />
    </div>
    <div className="portfolio-grid">{ordered.map((business) => <article className={`portfolio-card priority-${business.portfolio?.priority || 'next'}`} key={business.id}><div><span className="idea-kind">{priorityLabels[business.portfolio?.priority || 'next']}</span><h3>{business.name}</h3><p>{business.portfolio?.note || 'No owner rationale recorded yet.'}</p></div><div className="portfolio-metrics"><span><Clock3 size={14} /> {business.portfolio?.ownerHours ?? '—'} owner hours</span><span>{business.workSummary?.active || 0} active work item{business.workSummary?.active === 1 ? '' : 's'}</span>{!!business.workSummary?.blocked && <span className="blocked-metric"><AlertTriangle size={14} /> {business.workSummary.blocked} blocked</span>}</div>{business.workSummary?.latestObservation && <p className="latest-learning"><strong>Latest observation</strong>{business.workSummary.latestObservation}</p>}<Button size="sm" variant="outline" onClick={() => selectBusiness(business.id)}>Open business</Button></article>)}</div>
  </section>;
}
