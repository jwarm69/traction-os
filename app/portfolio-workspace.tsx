'use client';

import { useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { memoVerdicts, type BusinessDocument, type MemoLine, type MemoVerdict, type PerformanceMemo, type PortfolioState } from '@/lib/engine';
import { campaignTable, type CampaignRow } from '@/lib/campaigns';
import { latestMemo, MEMO_FOOTER, undecidedLines } from '@/lib/memo';

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

type MemoSchedule = {
  enabled: boolean;
  weekday: number;
  hourUtc: number;
  nextDueAt: string;
  lastGeneratedWeek: string | null;
} | null;

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const verdictLabels: Record<MemoVerdict, string> = {
  keep: 'Keep',
  kill: 'Kill',
  change: 'Change',
  test: 'Test',
  wait: 'Wait',
};
const num = (value: number | null) =>
  value === null ? 'unknown' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function MemoLineView({ memo, line, act, busy }: { memo: PerformanceMemo; line: MemoLine; act: Act; busy: boolean }) {
  const [verdict, setVerdict] = useState<MemoVerdict>(line.decision?.verdict || line.proposedVerdict);
  const [note, setNote] = useState('');
  const needsNote = (verdict === 'kill' || verdict === 'change') && !note.trim();
  return (
    <article className={`memo-line ${line.decision ? 'decided' : ''}`}>
      <div className="memo-line-head">
        <span className="pill campaign-code">{line.code}</span>
        <strong>{line.title}</strong>
        <span className={`pill verdict-${line.proposedVerdict}`}>proposed: {verdictLabels[line.proposedVerdict]}</span>
      </div>
      <p>{line.reason}</p>
      {line.bar && <p className="small muted">{line.bar.progress}</p>}
      <p className="small muted">
        This period: spend {num(line.period.spend)}, {line.period.conversations} conversations, {line.period.contacts} contacts.
        Since start: spend {num(line.cumulative.spend)}, {line.cumulative.conversations} conversations, deals {num(line.cumulative.deals)}, revenue {num(line.cumulative.revenue)}.
      </p>
      {line.caveats.length > 0 && (
        <details>
          <summary className="small muted">{line.caveats.length} caveat{line.caveats.length === 1 ? '' : 's'}</summary>
          <ul className="small">{line.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}
      {line.decision ? (
        <p className="small">
          <strong>Decided {verdictLabels[line.decision.verdict].toLowerCase()}</strong> on {new Date(line.decision.decidedAt).toLocaleDateString()}
          {line.decision.note ? `: ${line.decision.note}` : ''}
        </p>
      ) : (
        <div className="memo-decide">
          <div className="memo-verdicts">
            {memoVerdicts.map((value) => (
              <button
                type="button"
                key={value}
                className={`pill${verdict === value ? ' active' : ''}`}
                onClick={() => setVerdict(value)}
              >
                {verdictLabels[value]}
              </button>
            ))}
          </div>
          {(verdict === 'kill' || verdict === 'change') && (
            <Input
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder={verdict === 'kill' ? 'Why stop it? One line the next plan will read.' : 'What one thing changes?'}
            />
          )}
          <Button
            size="sm"
            disabled={busy || needsNote}
            onClick={() =>
              act('decide_memo_line', { memoId: memo.id, endeavorId: line.endeavorId, verdict, note })
            }
          >
            Record {verdictLabels[verdict].toLowerCase()}
          </Button>
        </div>
      )}
    </article>
  );
}

function MemoPanel({ b, act, busy, schedule }: { b: BusinessDocument; act: Act; busy: boolean; schedule: MemoSchedule }) {
  const memo = latestMemo(b);
  const undecided = undecidedLines(memo).length;
  const [weekday, setWeekday] = useState(schedule?.weekday ?? 1);
  const [hour, setHour] = useState(schedule?.hourUtc ?? 7);
  const localPreview = (() => {
    const d = new Date('2026-01-04T00:00:00Z'); // a Sunday
    d.setUTCDate(d.getUTCDate() + weekday);
    d.setUTCHours(hour);
    return d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  })();
  return (
    <div className="portfolio-memo">
      <div className="memo-head">
        <div>
          <p className="eyebrow">WEEKLY MEMO</p>
          <h3>{memo ? `${memo.weekKey} · ${undecided} undecided` : 'No memo yet'}</h3>
          {memo && <p className="muted">{memo.summary}</p>}
        </div>
        <div className="idea-actions">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act('generate_memo')}>
            {memo ? 'Refresh this week' : 'Generate memo'}
          </Button>
          {memo && !memo.narrative && b.mode !== 'demo' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('narrate_memo', { memoId: memo.id })}>
              Narrate (AI, $0.025)
            </Button>
          )}
        </div>
      </div>
      {memo?.narrative && (
        <blockquote className="memo-narrative">
          <p style={{ whiteSpace: 'pre-wrap' }}>{memo.narrative.text}</p>
          <small className="muted">Narrated by {memo.narrative.provider}. Numbers and verdicts above are the record; this is prose.</small>
        </blockquote>
      )}
      {memo && memo.lines.map((line) => <MemoLineView key={`${memo.id}:${line.endeavorId}`} memo={memo} line={line} act={act} busy={busy} />)}
      {memo && memo.excluded.length > 0 && (
        <p className="small muted">Not reviewed: {memo.excluded.map((e) => `${e.code} (${e.reason})`).join(', ')}.</p>
      )}
      <p className="small muted">{MEMO_FOOTER}</p>
      <details className="memo-schedule">
        <summary className="small">
          Schedule: {schedule?.enabled ? `${weekdayNames[schedule.weekday]} ${String(schedule.hourUtc).padStart(2, '0')}:00 UTC, next ${new Date(schedule.nextDueAt).toLocaleString()}` : 'not scheduled (memo appears on open, one week late at most)'}
        </summary>
        <div className="signal-form">
          <select aria-label="Weekday" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
            {weekdayNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <select aria-label="Hour (UTC)" value={hour} onChange={(event) => setHour(Number(event.target.value))}>
            {Array.from({ length: 24 }, (_, index) => <option key={index} value={index}>{String(index).padStart(2, '0')}:00 UTC</option>)}
          </select>
          <span className="small muted">Your local time: {localPreview}</span>
          <Button size="sm" disabled={busy} onClick={() => act('set_memo_schedule', { weekday, hourUtc: hour, enabled: true })}>
            {schedule?.enabled ? 'Update schedule' : 'Schedule weekly memo'}
          </Button>
          {schedule?.enabled && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('set_memo_schedule', { weekday, hourUtc: hour, enabled: false })}>
              Pause
            </Button>
          )}
        </div>
        <p className="small muted">A scheduled memo needs something to call the tick route each week. See the README. Without it the memo still appears when you open the business.</p>
      </details>
    </div>
  );
}

export default function PortfolioWorkspace({
  b,
  businesses,
  memoSchedule,
  act,
  busy,
  selectBusiness,
}: {
  b: BusinessDocument;
  businesses: Summary[];
  memoSchedule?: MemoSchedule;
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
    <MemoPanel b={b} act={act} busy={busy} schedule={memoSchedule || null} />
    <div className="portfolio-campaigns">
      <h3>Campaigns in {b.name}</h3>
      <p className="muted small">Counts are observations. Nothing here attributes revenue to a campaign causally. Unknown means no evidence was recorded, not zero.</p>
      <CampaignTable b={b} />
    </div>
    <div className="portfolio-grid">{ordered.map((business) => <article className={`portfolio-card priority-${business.portfolio?.priority || 'next'}`} key={business.id}><div><span className="idea-kind">{priorityLabels[business.portfolio?.priority || 'next']}</span><h3>{business.name}</h3><p>{business.portfolio?.note || 'No owner rationale recorded yet.'}</p></div><div className="portfolio-metrics"><span><Clock3 size={14} /> {business.portfolio?.ownerHours ?? '—'} owner hours</span><span>{business.workSummary?.active || 0} active work item{business.workSummary?.active === 1 ? '' : 's'}</span>{!!business.workSummary?.blocked && <span className="blocked-metric"><AlertTriangle size={14} /> {business.workSummary.blocked} blocked</span>}</div>{business.workSummary?.latestObservation && <p className="latest-learning"><strong>Latest observation</strong>{business.workSummary.latestObservation}</p>}<Button size="sm" variant="outline" onClick={() => selectBusiness(business.id)}>Open business</Button></article>)}</div>
  </section>;
}
