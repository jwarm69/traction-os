'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Endeavor, EvidenceBar } from '@/lib/engine';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

const metricOptions: { value: EvidenceBar['successMetric']; label: string }[] = [
  { value: 'conversations', label: 'Conversations (pipeline)' },
  { value: 'leads', label: 'Leads' },
  { value: 'qualified', label: 'Qualified leads' },
  { value: 'deals', label: 'Deals' },
  { value: 'revenue', label: 'Revenue' },
];

const text = (value?: number) => (value === undefined ? '' : String(value));

/**
 * Decide the evidence bar before launch: what counts as a win and when to stop
 * judging. The weekly memo judges the campaign against exactly this.
 */
export default function EvidenceBarPanel({
  endeavor,
  act,
  busy,
}: {
  endeavor: Endeavor;
  act: Act;
  busy: boolean;
}) {
  const bar = endeavor.evidenceBar;
  const proposed = !!bar && !bar.setAt;
  const [editing, setEditing] = useState(!bar || proposed);
  const [metric, setMetric] = useState<EvidenceBar['successMetric']>(bar?.successMetric || 'conversations');
  const [target, setTarget] = useState(text(bar?.successTarget));
  const [maxSpend, setMaxSpend] = useState(text(bar?.maxSpend));
  const [maxDays, setMaxDays] = useState(text(bar?.maxDays));
  const [maxContacts, setMaxContacts] = useState(text(bar?.maxContacts));
  const closed = endeavor.status === 'completed' || endeavor.status === 'stopped';
  const hasLimit = !!(maxSpend.trim() || maxDays.trim() || maxContacts.trim());

  const save = async () => {
    if (
      await act('set_evidence_bar', {
        endeavorId: endeavor.id,
        successMetric: metric,
        successTarget: target,
        maxSpend: maxSpend.trim(),
        maxDays: maxDays.trim(),
        maxContacts: maxContacts.trim(),
      })
    )
      setEditing(false);
  };

  return (
    <div className="work-section evidence-bar">
      <h3>Evidence bar</h3>
      <p className="small muted">
        Decide what counts as a win before launch. The weekly memo judges {endeavor.code || 'this campaign'} against this bar
        and stays on “wait” until one is set.
      </p>
      {bar && !proposed && !editing && (
        <div className="evidence-bar-summary">
          <p>
            <strong>Win:</strong> {bar.successTarget.toLocaleString()} {metricOptions.find((item) => item.value === bar.successMetric)?.label.toLowerCase() || bar.successMetric}
          </p>
          <p>
            <strong>Stop judging at:</strong>{' '}
            {[
              bar.maxSpend !== undefined && `spend ${bar.maxSpend.toLocaleString()}`,
              bar.maxDays !== undefined && `${bar.maxDays} days`,
              bar.maxContacts !== undefined && `${bar.maxContacts} contacted`,
            ]
              .filter(Boolean)
              .join(' or ')}
          </p>
          <p className="small muted">
            {bar.startedAt
              ? `Clock started ${new Date(bar.startedAt).toLocaleDateString()}.`
              : 'Clock starts when the work moves to in progress.'}
            {bar.revisedAt && ` Changed after start on ${new Date(bar.revisedAt).toLocaleDateString()}; the memo will say so.`}
          </p>
          {!closed && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Change bar
            </Button>
          )}
        </div>
      )}
      {editing && !closed && (
        <div className="evidence-bar-form">
          {proposed && (
            <p className="context-warning">
              Proposed from the guided experiment’s own numbers. Check it and confirm; until then the memo treats it as unset.
            </p>
          )}
          <fieldset className="evidence-bar-field">
            <legend>A win is</legend>
            <span className="evidence-bar-row">
              <Input type="number" min="0" step="any" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Target" aria-label="Win target" />
              <select value={metric} onChange={(event) => setMetric(event.target.value as EvidenceBar['successMetric'])} aria-label="Win metric">
                {metricOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </span>
          </fieldset>
          <fieldset className="evidence-bar-field">
            <legend>Stop judging at whichever comes first</legend>
            <span className="evidence-bar-row">
              <Input type="number" min="0" step="any" value={maxSpend} onChange={(event) => setMaxSpend(event.target.value)} placeholder="Spend limit" aria-label="Spend limit" />
              <Input type="number" min="1" step="1" value={maxDays} onChange={(event) => setMaxDays(event.target.value)} placeholder="Days" aria-label="Day limit" />
              <Input type="number" min="1" step="1" value={maxContacts} onChange={(event) => setMaxContacts(event.target.value)} placeholder="Contacts" aria-label="Contact limit" />
            </span>
          </fieldset>
          <div className="evidence-bar-actions">
            <Button size="sm" disabled={busy || !target.trim() || !hasLimit} onClick={save}>
              {proposed ? 'Confirm evidence bar' : bar ? 'Save changed bar' : 'Set evidence bar'}
            </Button>
            {bar && !proposed && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
          {!hasLimit && <p className="small muted">Add at least one limit: spend, days, or contacts.</p>}
        </div>
      )}
      {closed && !bar && <p className="small muted">Closed work keeps no bar.</p>}
    </div>
  );
}
