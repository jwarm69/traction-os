'use client';

import { useState } from 'react';
import { ExternalLink, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BusinessDocument } from '@/lib/engine';
import {
  canMoveContact,
  pipelineChannels,
  pipelineStages,
  pipelineSummary,
  type PipelineChannel,
  type PipelineContact,
  type PipelineStage,
} from '@/lib/pipeline';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

const stageLabels: Record<PipelineStage, string> = {
  identified: 'Identified',
  contacted: 'Contacted',
  replied: 'Replied',
  conversation: 'In conversation',
  won: 'Won',
  lost: 'Lost',
};
const channelLabels: Record<PipelineChannel, string> = {
  email: 'Email',
  social: 'Social',
  community: 'Community',
  referral: 'Referral',
  other: 'Other',
};
/** Unknown is never zero: a rate below the evidence floor stays unknown. */
const rate = (value: number | null) =>
  value === null ? 'Unknown (fewer than 5)' : `${Math.round(value * 100)}%`;

const blankDraft = {
  name: '',
  organization: '',
  channel: 'email' as PipelineChannel,
  route: '',
  endeavorId: '',
  note: '',
};

export default function PipelinePanel({
  b,
  act,
  busy,
}: {
  b: BusinessDocument;
  act: Act;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(blankDraft);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reopening, setReopening] = useState('');
  const summary = pipelineSummary(b);
  const contacts = b.pipeline?.contacts || [];
  const endeavors = b.work?.endeavors || [];
  const noteFor = (id: string) => notes[id] || '';
  const setNote = (id: string, value: string) =>
    setNotes((current) => ({ ...current, [id]: value }));
  const clearNote = (id: string) =>
    setNotes((current) => ({ ...current, [id]: '' }));

  const add = async () => {
    const ok = await act('add_contact', {
      name: draft.name,
      organization: draft.organization || undefined,
      channel: draft.channel,
      route: draft.route || undefined,
      endeavorId: draft.endeavorId || undefined,
      note: draft.note || undefined,
    });
    if (ok) setDraft(blankDraft);
  };
  const move = async (contact: PipelineContact, stage: PipelineStage) => {
    const note = noteFor(contact.id).trim();
    if (await act('move_contact', { contactId: contact.id, stage, note: note || undefined }))
      clearNote(contact.id);
  };
  const reopen = async (contact: PipelineContact) => {
    if (
      await act('reopen_contact', {
        contactId: contact.id,
        note: noteFor(contact.id).trim(),
      })
    ) {
      clearNote(contact.id);
      setReopening('');
    }
  };

  return (
    <section className="pipeline-panel" aria-labelledby="pipeline-heading">
      <div className="pipeline-heading">
        <div>
          <span className="eyebrow">PIPELINE</span>
          <h3 id="pipeline-heading">
            <Users size={16} aria-hidden="true" /> People this business is
            actually talking to
          </h3>
          <p className="small muted">
            A stage records something that happened, not something drafted. A
            contact moves one step at a time.
          </p>
        </div>
      </div>

      <dl className="pipeline-summary">
        {pipelineStages.map((stage) => (
          <div key={stage}>
            <dt>{stageLabels[stage]}</dt>
            <dd>{summary.byStage[stage]}</dd>
          </div>
        ))}
        <div className="pipeline-rate">
          <dt>Reply rate</dt>
          <dd>{rate(summary.replyRate)}</dd>
        </div>
        <div className="pipeline-rate">
          <dt>Win rate</dt>
          <dd>{rate(summary.winRate)}</dd>
        </div>
      </dl>

      <form
        className="pipeline-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div>
          <label htmlFor="pipeline-name">Name</label>
          <Input
            id="pipeline-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Who is this person?"
          />
        </div>
        <div>
          <label htmlFor="pipeline-org">Organization (optional)</label>
          <Input
            id="pipeline-org"
            value={draft.organization}
            onChange={(event) =>
              setDraft({ ...draft, organization: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="pipeline-channel">Channel</label>
          <select
            id="pipeline-channel"
            value={draft.channel}
            onChange={(event) =>
              setDraft({ ...draft, channel: event.target.value as PipelineChannel })
            }
          >
            {pipelineChannels.map((channel) => (
              <option key={channel} value={channel}>
                {channelLabels[channel]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pipeline-route">Published route (optional)</label>
          <Input
            id="pipeline-route"
            value={draft.route}
            onChange={(event) => setDraft({ ...draft, route: event.target.value })}
            placeholder="https://…"
          />
        </div>
        {!!endeavors.length && (
          <div>
            <label htmlFor="pipeline-endeavor">Related work (optional)</label>
            <select
              id="pipeline-endeavor"
              value={draft.endeavorId}
              onChange={(event) =>
                setDraft({ ...draft, endeavorId: event.target.value })
              }
            >
              <option value="">Not linked</option>
              {endeavors.map((endeavor) => (
                <option key={endeavor.id} value={endeavor.id}>
                  {endeavor.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="pipeline-add-wide">
          <label htmlFor="pipeline-note">Opening note (optional)</label>
          <Input
            id="pipeline-note"
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            placeholder="Where did this contact come from?"
          />
        </div>
        <div className="pipeline-add-wide">
          <Button type="submit" size="sm" disabled={busy || !draft.name.trim()}>
            <Plus size={14} /> Add contact
          </Button>
        </div>
      </form>

      {!contacts.length ? (
        <p className="pipeline-empty">
          No contacts recorded yet. Adding one records that a person exists —
          never that they were contacted.
        </p>
      ) : (
        <ul className="pipeline-list">
          {contacts.map((contact) => {
            const moves = pipelineStages.filter((stage) =>
              canMoveContact(contact.stage, stage),
            );
            const needsNote =
              contact.source !== 'owner' && contact.stage === 'identified';
            const latest = contact.stageHistory[contact.stageHistory.length - 1];
            return (
              <li className="pipeline-contact" key={contact.id}>
                <div className="pipeline-contact-head">
                  <div>
                    <strong>{contact.name}</strong>
                    {contact.organization && <span> · {contact.organization}</span>}
                    <small>
                      {channelLabels[contact.channel]} ·{' '}
                      {contact.source === 'owner' ? 'Owner-added' : 'Assistant-found'}
                      {latest?.note ? ` · ${latest.note}` : ''}
                    </small>
                  </div>
                  <span className={`idea-status ${contact.stage}`}>
                    {stageLabels[contact.stage]}
                  </span>
                </div>
                {contact.route && (
                  <a href={contact.route} target="_blank" rel="noreferrer">
                    Published route <ExternalLink size={12} />
                  </a>
                )}
                {(moves.length > 0 || reopening === contact.id) && (
                  <div className="pipeline-note">
                    <label htmlFor={`pipeline-move-note-${contact.id}`}>
                      {reopening === contact.id
                        ? 'Why are you reopening this contact? (required)'
                        : needsNote
                          ? 'What happened? (required for an assistant-found contact)'
                          : 'What happened? (optional)'}
                    </label>
                    <Input
                      id={`pipeline-move-note-${contact.id}`}
                      value={noteFor(contact.id)}
                      onChange={(event) => setNote(contact.id, event.target.value)}
                    />
                  </div>
                )}
                <div className="idea-actions">
                  {reopening === contact.id ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy || !noteFor(contact.id).trim()}
                        onClick={() => void reopen(contact)}
                      >
                        Reopen at identified
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReopening('')}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {moves.map((stage) => (
                        <Button
                          key={stage}
                          size="sm"
                          variant={stage === 'lost' ? 'outline' : 'default'}
                          disabled={
                            busy ||
                            (needsNote &&
                              stage !== 'identified' &&
                              !noteFor(contact.id).trim())
                          }
                          onClick={() => void move(contact, stage)}
                        >
                          Move to {stageLabels[stage]}
                        </Button>
                      ))}
                      {contact.stage !== 'identified' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setReopening(contact.id)}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void act('remove_contact', { contactId: contact.id })
                        }
                      >
                        <Trash2 size={14} /> Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
