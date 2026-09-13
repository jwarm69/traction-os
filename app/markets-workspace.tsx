'use client';

import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessDocument, Market, MarketStatus } from '@/lib/engine';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
type Draft = Omit<Market, 'id' | 'updatedAt'>;
const emptyDraft = (): Draft => ({
  name: '',
  code: '',
  location: '',
  status: 'planned',
  objective: '',
  evidence: '',
  nextMove: '',
});
const statusLabels: Record<MarketStatus, string> = {
  traction: 'Has traction',
  validating: 'Validating',
  planned: 'Planned',
  paused: 'Paused',
};

export default function MarketsWorkspace({
  b,
  act,
  busy,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
}) {
  const singular = b.marketLabel || 'Market';
  const plural = singular.endsWith('s') ? singular : `${singular}s`;
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const edit = (market?: Market) => {
    setEditingId(market?.id);
    setDraft(
      market
        ? {
            name: market.name,
            code: market.code,
            location: market.location,
            status: market.status,
            objective: market.objective,
            evidence: market.evidence,
            nextMove: market.nextMove,
          }
        : emptyDraft(),
    );
  };
  const save = async () => {
    const saved = await act('save_market', {
      ...draft,
      marketId: editingId,
      marketLabel: singular,
    });
    if (saved) edit();
  };
  return (
    <section className="markets-shell">
      <div className="explore-intro">
        <div>
          <p className="eyebrow">{plural.toUpperCase()}</p>
          <h2>Keep progress attached to the place where it happened.</h2>
          <p className="muted">
            Goals, evidence, and next moves stay separate so traction in one{' '}
            {singular.toLowerCase()} is never assumed in another.
          </p>
        </div>
        <Button variant="outline" onClick={() => edit()}>
          <Plus size={15} /> Add {singular.toLowerCase()}
        </Button>
      </div>
      <div className="market-grid">
        {(b.markets || []).map((market) => (
          <article
            className={`market-card market-${market.status}`}
            key={market.id}
          >
            <div className="market-card-heading">
              <div>
                <span className="idea-kind">{statusLabels[market.status]}</span>
                <h3>{market.code || market.name}</h3>
                {market.code && <p>{market.name}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => edit(market)}>
                Edit
              </Button>
            </div>
            {market.location && (
              <p className="market-location">
                <MapPin size={14} /> {market.location}
              </p>
            )}
            <dl>
              <div>
                <dt>Objective</dt>
                <dd>{market.objective || 'Not set yet.'}</dd>
              </div>
              <div>
                <dt>Evidence here</dt>
                <dd>
                  {market.evidence || 'No market-specific evidence recorded.'}
                </dd>
              </div>
              <div>
                <dt>Next move</dt>
                <dd>{market.nextMove || 'Not set yet.'}</dd>
              </div>
            </dl>
          </article>
        ))}
        {!b.markets?.length && (
          <div className="market-empty">
            <MapPin size={20} />
            <p>
              No {plural.toLowerCase()} yet. Add the first one to separate local
              evidence and expansion work.
            </p>
          </div>
        )}
      </div>
      <div className="market-editor">
        <div className="market-editor-heading">
          <h3>
            {editingId
              ? `Edit ${singular.toLowerCase()}`
              : `Add ${singular.toLowerCase()}`}
          </h3>
          {editingId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  window.confirm(
                    `Remove this ${singular.toLowerCase()} record?`,
                  )
                ) {
                  const removed = await act('remove_market', {
                    marketId: editingId,
                  });
                  if (removed) edit();
                }
              }}
            >
              <Trash2 size={14} /> Remove
            </Button>
          )}
        </div>
        <div className="market-fields">
          <label htmlFor="market-name">
            Name
            <Input
              id="market-name"
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="University of Florida"
            />
          </label>
          <label htmlFor="market-code">
            Short name
            <Input
              id="market-code"
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value })
              }
              placeholder="UF"
            />
          </label>
          <label htmlFor="market-location">
            Location
            <Input
              id="market-location"
              value={draft.location}
              onChange={(event) =>
                setDraft({ ...draft, location: event.target.value })
              }
              placeholder="Gainesville, Florida"
            />
          </label>
          <label htmlFor="market-status">
            Status
            <select
              id="market-status"
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as MarketStatus,
                })
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label htmlFor="market-objective">
          Objective
          <Textarea
            id="market-objective"
            value={draft.objective}
            onChange={(event) =>
              setDraft({ ...draft, objective: event.target.value })
            }
            placeholder={`What are you trying to prove or accomplish in this ${singular.toLowerCase()}?`}
          />
        </label>
        <label htmlFor="market-evidence">
          Evidence in this {singular.toLowerCase()}
          <Textarea
            id="market-evidence"
            value={draft.evidence}
            onChange={(event) =>
              setDraft({ ...draft, evidence: event.target.value })
            }
            placeholder="Record only what is known here; name missing metrics explicitly."
          />
        </label>
        <label htmlFor="market-next-move">
          Next move
          <Textarea
            id="market-next-move"
            value={draft.nextMove}
            onChange={(event) =>
              setDraft({ ...draft, nextMove: event.target.value })
            }
            placeholder="The smallest next action for this market."
          />
        </label>
        <div className="action-row">
          <Button
            disabled={busy || !draft.name.trim()}
            onClick={() => {
              void save();
            }}
          >
            Save {singular.toLowerCase()}
          </Button>
          {(editingId ||
            draft.name ||
            draft.objective ||
            draft.evidence ||
            draft.nextMove) && (
            <Button variant="ghost" onClick={() => edit()}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
