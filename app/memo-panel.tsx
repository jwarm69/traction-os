'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BusinessDocument, MemoLine, MemoVerdict, PerformanceMemo } from '@/lib/engine';
import { currentWeek, MEMO_FOOTER, memoLines, verdictLabels } from '@/lib/memo';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
const verdicts: MemoVerdict[] = ['keep', 'kill', 'change', 'test', 'wait'];
const day = (at: string) => new Date(at).toLocaleDateString(undefined, { timeZone: 'UTC' });

function Line({
  memo,
  line,
  act,
  busy,
  readOnly,
}: {
  memo: PerformanceMemo;
  line: MemoLine;
  act: Act;
  busy: boolean;
  readOnly: boolean;
}) {
  const [choice, setChoice] = useState<MemoVerdict | null>(null);
  const [note, setNote] = useState('');
  const [revising, setRevising] = useState(false);
  const needsNote = choice === 'kill' || choice === 'change';
  const decide = async (verdict: MemoVerdict, text = '') => {
    if (await act('decide_memo_line', { memoId: memo.id, endeavorId: line.endeavorId, verdict, note: text })) {
      setChoice(null);
      setNote('');
      setRevising(false);
    }
  };
  return (
    <li className={`memo-line verdict-${line.proposedVerdict}`}>
      <div className="memo-line-head">
        <span className="pill campaign-code">{line.code}</span>
        <strong>{line.title}</strong>
        <span className={`memo-verdict verdict-${line.proposedVerdict}`}>
          Proposed: {verdictLabels[line.proposedVerdict]}
        </span>
      </div>
      <p>{line.reason}</p>
      {line.bar && !line.reason.toLowerCase().includes(line.bar.progress.toLowerCase()) && (
        <p className="small muted">Bar progress: {line.bar.progress}</p>
      )}
      {!!line.caveats.length && (
        <details>
          <summary className="small muted">
            {line.caveats.length} caveat{line.caveats.length === 1 ? '' : 's'}
          </summary>
          <ul className="small muted">
            {line.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </details>
      )}
      {line.decision && !revising ? (
        <p className="memo-decision">
          Decided: <strong>{verdictLabels[line.decision.verdict]}</strong>
          {line.decision.note ? ` — ${line.decision.note}` : ''}{' '}
          <small className="muted">{day(line.decision.decidedAt)}</small>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => setRevising(true)}>
              Revise
            </Button>
          )}
        </p>
      ) : (
        !readOnly && (
          <div className="memo-actions">
            {verdicts.map((verdict) => (
              <Button
                key={verdict}
                size="sm"
                variant={(choice || line.proposedVerdict) === verdict ? 'default' : 'outline'}
                disabled={busy}
                onClick={() =>
                  verdict === 'kill' || verdict === 'change' ? setChoice(verdict) : decide(verdict)
                }
              >
                {verdictLabels[verdict]}
              </Button>
            ))}
            {needsNote && (
              <span className="memo-note">
                <Input
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={choice === 'kill' ? 'Why stop it? The next Explore session reads this.' : 'The one thing you will change'}
                />
                <Button size="sm" disabled={busy || !note.trim()} onClick={() => decide(choice!, note)}>
                  Record {verdictLabels[choice!].toLowerCase()}
                </Button>
              </span>
            )}
          </div>
        )
      )}
    </li>
  );
}

/** This week so far, computed in the browser and never saved. No decisions. */
function Preview({ b, open }: { b: BusinessDocument; open: boolean }) {
  const week = currentWeek();
  const { lines } = memoLines(b, week);
  if (!lines.length) return null;
  return (
    <details className="memo-preview" open={open}>
      <summary>
        This week so far ({week.weekKey}, preview, not saved): {lines.length} campaign
        {lines.length === 1 ? '' : 's'}
      </summary>
      <ul className="memo-lines">
        {lines.map((line) => (
          <li key={line.endeavorId} className={`memo-line verdict-${line.proposedVerdict}`}>
            <div className="memo-line-head">
              <span className="pill campaign-code">{line.code}</span>
              <strong>{line.title}</strong>
              <span className={`memo-verdict verdict-${line.proposedVerdict}`}>
                Would propose: {verdictLabels[line.proposedVerdict]}
              </span>
            </div>
            <p>{line.reason}</p>
            {line.caveats.length > 0 && <p className="small muted">{line.caveats.join(' ')}</p>}
          </li>
        ))}
      </ul>
      <p className="small muted">Decisions are recorded on the weekly memo, which is prepared after the week ends.</p>
    </details>
  );
}

/**
 * The weekly performance memo for one business. Numbers and verdicts come from
 * code; the owner records one decision per line.
 */
export default function MemoPanel({
  b,
  act,
  busy,
  readOnly = false,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
  readOnly?: boolean;
}) {
  const memos = b.memos || [];
  const [memoId, setMemoId] = useState(memos[0]?.id || '');
  const memo = memos.find((item) => item.id === memoId) || memos[0];
  const campaigns = (b.work?.endeavors || []).length;
  if (!memo)
    return (
      <div className="memo-panel">
        <h3>Weekly memo</h3>
        <p className="muted small">
          {campaigns
            ? 'The first memo is prepared after the first full week a campaign is ready, running, or blocked. It judges each campaign against its evidence bar.'
            : 'No campaigns yet. The memo judges each campaign against its evidence bar once there is work to judge.'}
        </p>
        <Preview b={b} open />
      </div>
    );
  return (
    <div className="memo-panel">
      <div className="memo-head">
        <div>
          <h3>
            Weekly memo · {memo.weekKey}
          </h3>
          <p className="small muted">
            {day(memo.periodStart)} – {day(memo.periodEnd)} (UTC) · prepared {day(memo.createdAt)}
            {memo.refreshedAt ? ` · refreshed ${day(memo.refreshedAt)}` : ''}
          </p>
        </div>
        <div className="memo-head-actions">
          {memos.length > 1 && (
            <select value={memo.id} onChange={(event) => setMemoId(event.target.value)} aria-label="Choose a memo week">
              {memos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.weekKey}
                </option>
              ))}
            </select>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              title="Recompute from current records. Recorded decisions are kept."
              onClick={() => act('refresh_memo', { memoId: memo.id })}
            >
              <RefreshCw size={14} /> Refresh
            </Button>
          )}
        </div>
      </div>
      <p className="memo-summary">{memo.summary}</p>
      {memo.lines.length > 0 && (
        <ul className="memo-lines">
          {memo.lines.map((line) => (
            <Line key={`${memo.id}-${line.endeavorId}`} memo={memo} line={line} act={act} busy={busy} readOnly={readOnly} />
          ))}
        </ul>
      )}
      {memo.excluded.length > 0 && (
        <details>
          <summary className="small muted">{memo.excluded.length} campaign{memo.excluded.length === 1 ? '' : 's'} not in this memo</summary>
          <ul className="small muted">
            {memo.excluded.map((item) => (
              <li key={item.code}>
                {item.code}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Preview b={b} open={false} />
      <p className="small muted">{MEMO_FOOTER}</p>
    </div>
  );
}
