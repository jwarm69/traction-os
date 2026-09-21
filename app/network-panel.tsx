'use client';

import { Users } from 'lucide-react';
import type { Insight } from '@/lib/network';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

const channelLabels: Record<string, string> = {
  creator: 'Creator',
  email: 'Email',
  community: 'Community',
  directory: 'Directory',
  search_content: 'Search / content',
  social: 'Social',
  partnership: 'Partnership',
  paid: 'Paid',
  event: 'Event',
  referral: 'Referral',
  product: 'Product',
  other: 'Other',
};
const kindLabels: Record<string, string> = {
  research: 'Research',
  content: 'Content',
  outreach: 'Outreach',
  campaign: 'Campaign',
  experiment: 'Experiment',
  product_improvement: 'Product improvement',
};
const label = (map: Record<string, string>, value: string) =>
  map[value] || value.replace(/_/g, ' ');

export default function NetworkPanel({
  network,
  canShare,
  act,
  busy,
}: {
  network: { sharing: boolean; insights: Insight[] };
  canShare: boolean;
  act: Act;
  busy: boolean;
}) {
  const { sharing, insights } = network;
  return (
    <section className="network-panel" aria-labelledby="network-heading">
      <div className="playbook-heading">
        <div>
          <p className="eyebrow">PATTERNS ACROSS TRACTION</p>
          <h3 id="network-heading">
            <Users size={16} aria-hidden="true" /> What other owners chose, in
            categories only
          </h3>
        </div>
      </div>

      {!insights.length ? (
        <p className="network-empty">
          Not enough accounts have contributed yet. Patterns appear only when at
          least 3 accounts share a category.
        </p>
      ) : (
        <div className="network-table-wrap">
          <table className="network-table">
            <caption>
              Self-reported categories from other owners, on different
              businesses and small samples. Treat them as weak priors, not
              evidence for this business, and never as results.
            </caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Channel</th>
                <th scope="col">Accounts</th>
                <th scope="col">Endeavors</th>
                <th scope="col">Completed</th>
                <th scope="col">Stopped</th>
                <th scope="col">Repeat</th>
                <th scope="col">Adjust</th>
                <th scope="col">Drop</th>
              </tr>
            </thead>
            <tbody>
              {insights.map((insight) => (
                <tr key={`${insight.kind}:${insight.channel}`}>
                  <th scope="row">{label(kindLabels, insight.kind)}</th>
                  <td>{label(channelLabels, insight.channel)}</td>
                  <td>{insight.accounts}</td>
                  <td>{insight.endeavors}</td>
                  <td>{insight.completed}</td>
                  <td>{insight.stopped}</td>
                  <td>{insight.repeat}</td>
                  <td>{insight.adjust}</td>
                  <td>{insight.drop}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Owner verdicts cover only endeavors where an owner recorded one; the
            rest stay unknown, not zero.
          </p>
        </div>
      )}

      {canShare && (
        <div className="network-sharing">
          <label className="check-row" htmlFor="network-sharing">
            <input
              id="network-sharing"
              type="checkbox"
              checked={sharing}
              disabled={busy}
              onChange={(event) =>
                void act('set_network_sharing', {
                  sharing: event.target.checked,
                })
              }
            />
            <span>
              Contribute category-level patterns (kind, channel, status,
              verdict — never names, text, links, contacts, or numbers)
            </span>
          </label>
          <p className="small muted">
            Turning this off deletes what this account has contributed.
          </p>
        </div>
      )}
    </section>
  );
}
