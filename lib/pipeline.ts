import {
  addLog,
  uid,
  type BusinessDocument,
  type PipelineChannel,
  type PipelineContact,
  type PipelineStage,
  type PipelineState,
} from './engine.ts';

export type {
  PipelineChannel,
  PipelineContact,
  PipelineStage,
  PipelineStageEvent,
  PipelineState,
} from './engine.ts';

const now = () => new Date().toISOString();

export const pipelineStages: PipelineStage[] = [
  'identified',
  'contacted',
  'replied',
  'conversation',
  'won',
  'lost',
];

/** Ordered progression. 'lost' sits outside the ladder: reachable from anywhere. */
const ladder: PipelineStage[] = [
  'identified',
  'contacted',
  'replied',
  'conversation',
  'won',
];

export const pipelineChannels: PipelineChannel[] = [
  'email',
  'social',
  'community',
  'referral',
  'other',
];

export const MAX_CONTACTS = 500;
export const MAX_NAME = 120;
export const MAX_NOTE = 500;

/** Stages at or beyond which a claim about the other party is being made. */
const evidenceStages: PipelineStage[] = [
  'contacted',
  'replied',
  'conversation',
  'won',
  'lost',
];

export function pipelineState(business: BusinessDocument): PipelineState {
  return business.pipeline || { contacts: [] };
}

function writable(business: BusinessDocument): PipelineState {
  return (business.pipeline ||= { contacts: [] });
}

function boundedText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string') throw Error(`${label} is required.`);
  const text = value.trim();
  if (!text) throw Error(`${label} is required.`);
  if (text.length > max) throw Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

function optionalText(
  value: unknown,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw Error(`${label} must be text.`);
  if (!value.trim()) return undefined;
  return boundedText(value, max, label);
}

function httpsRoute(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw Error('Contact route must be text.');
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > MAX_NAME * 4)
    throw Error('Contact route is too long.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw Error('Contact route must be a valid https URL.');
  }
  if (url.protocol !== 'https:')
    throw Error('Contact route must be a valid https URL.');
  return url.toString();
}

export function contactFor(
  business: BusinessDocument,
  contactId: string,
): PipelineContact {
  const contact = pipelineState(business).contacts.find(
    (value) => value.id === contactId,
  );
  if (!contact) throw Error('Pipeline contact not found.');
  return contact;
}

export type ContactInput = {
  name: string;
  organization?: string;
  channel: PipelineChannel;
  route?: string;
  endeavorId?: string;
  source: 'owner' | 'assistant';
  /** Owner-sourced contacts may start further along; assistants may not. */
  stage?: PipelineStage;
  note?: string;
};

export function addContact(
  business: BusinessDocument,
  input: ContactInput,
): PipelineContact {
  const state = writable(business);
  if (state.contacts.length >= MAX_CONTACTS)
    throw Error(`The pipeline holds at most ${MAX_CONTACTS} contacts.`);
  if (input.source !== 'owner' && input.source !== 'assistant')
    throw Error('Contact source must be owner or assistant.');
  if (!pipelineChannels.includes(input.channel))
    throw Error('Unknown outreach channel.');

  const stage = input.stage ?? 'identified';
  if (!pipelineStages.includes(stage)) throw Error('Unknown pipeline stage.');
  // Drafts are not outcomes: an assistant may only record that someone exists.
  if (input.source === 'assistant' && stage !== 'identified')
    throw Error('Assistant-sourced contacts start at identified.');
  if (input.source === 'owner' && (stage === 'won' || stage === 'lost'))
    throw Error('A contact cannot be created as won or lost.');

  const name = boundedText(input.name, MAX_NAME, 'Contact name');
  const openingNote = optionalText(input.note, MAX_NOTE, 'Note');
  const at = now();
  const contact: PipelineContact = {
    id: uid('contact'),
    name,
    channel: input.channel,
    stage,
    stageHistory: [
      { stage, at, ...(openingNote ? { note: openingNote } : {}) },
    ],
    source: input.source,
    createdAt: at,
    updatedAt: at,
  };
  const organization = optionalText(
    input.organization,
    MAX_NAME,
    'Organization',
  );
  if (organization) contact.organization = organization;
  const route = httpsRoute(input.route);
  if (route) contact.route = route;
  const endeavorId = optionalText(input.endeavorId, MAX_NAME, 'Endeavor id');
  if (endeavorId) contact.endeavorId = endeavorId;

  state.contacts.unshift(contact);
  addLog(business, `Pipeline contact added: ${contact.name}.`);
  return contact;
}

function allowedNext(from: PipelineStage): PipelineStage[] {
  if (from === 'won' || from === 'lost') return [];
  const index = ladder.indexOf(from);
  const next = ladder[index + 1];
  return next ? [next, 'lost'] : ['lost'];
}

export function canMoveContact(
  from: PipelineStage,
  to: PipelineStage,
): boolean {
  return allowedNext(from).includes(to);
}

export function moveContact(
  business: BusinessDocument,
  contactId: string,
  to: PipelineStage,
  note?: string,
): PipelineContact {
  const contact = contactFor(business, contactId);
  if (!pipelineStages.includes(to)) throw Error('Unknown pipeline stage.');
  if (to === contact.stage) throw Error('The contact is already at that stage.');
  if (!canMoveContact(contact.stage, to))
    throw Error(
      `A contact cannot move from ${contact.stage} to ${to}. Reopen it to start again.`,
    );
  const trimmed = optionalText(note, MAX_NOTE, 'Note');
  // Evidence rule: recording that something happened to the other party needs
  // either an owner behind the contact or a note saying what was observed.
  if (evidenceStages.includes(to) && contact.source !== 'owner' && !trimmed)
    throw Error(
      `Moving an assistant-sourced contact to ${to} needs a note recording what happened.`,
    );

  const at = now();
  contact.stage = to;
  contact.stageHistory.push({ stage: to, at, ...(trimmed ? { note: trimmed } : {}) });
  contact.updatedAt = at;
  addLog(business, `Pipeline contact moved to ${to}: ${contact.name}.`);
  return contact;
}

export function reopenContact(
  business: BusinessDocument,
  contactId: string,
  note: string,
): PipelineContact {
  const contact = contactFor(business, contactId);
  const trimmed = boundedText(note, MAX_NOTE, 'Reopen note');
  if (contact.stage === 'identified')
    throw Error('The contact is already at identified.');
  const at = now();
  contact.stage = 'identified';
  contact.stageHistory.push({ stage: 'identified', at, note: trimmed });
  contact.updatedAt = at;
  addLog(business, `Pipeline contact reopened: ${contact.name}.`);
  return contact;
}

export function removeContact(
  business: BusinessDocument,
  contactId: string,
): PipelineContact {
  const state = writable(business);
  const index = state.contacts.findIndex((value) => value.id === contactId);
  if (index < 0) throw Error('Pipeline contact not found.');
  const [contact] = state.contacts.splice(index, 1);
  addLog(business, `Pipeline contact removed: ${contact.name}.`);
  return contact;
}

/** True when the contact has ever been recorded at this stage. */
export function reachedStage(
  contact: PipelineContact,
  stage: PipelineStage,
): boolean {
  return contact.stageHistory.some((event) => event.stage === stage);
}

/** Below this many observations a rate is unknown, never 0. */
export const MIN_DENOMINATOR = 5;

export type PipelineSummary = {
  total: number;
  byStage: Record<PipelineStage, number>;
  byChannel: Record<PipelineChannel, number>;
  contacted: number;
  replied: number;
  resolved: number;
  won: number;
  lost: number;
  /** null means unknown: not enough evidence yet. Never 0 for missing evidence. */
  replyRate: number | null;
  winRate: number | null;
};

export function pipelineSummary(business: BusinessDocument): PipelineSummary {
  const contacts = pipelineState(business).contacts;
  const byStage = Object.fromEntries(
    pipelineStages.map((stage) => [stage, 0]),
  ) as Record<PipelineStage, number>;
  const byChannel = Object.fromEntries(
    pipelineChannels.map((channel) => [channel, 0]),
  ) as Record<PipelineChannel, number>;

  let contacted = 0;
  let replied = 0;
  let won = 0;
  let lost = 0;
  for (const contact of contacts) {
    byStage[contact.stage] += 1;
    byChannel[contact.channel] += 1;
    if (reachedStage(contact, 'contacted')) contacted += 1;
    if (reachedStage(contact, 'replied')) replied += 1;
    if (contact.stage === 'won') won += 1;
    if (contact.stage === 'lost') lost += 1;
  }
  const resolved = won + lost;
  return {
    total: contacts.length,
    byStage,
    byChannel,
    contacted,
    replied,
    resolved,
    won,
    lost,
    replyRate: contacted >= MIN_DENOMINATOR ? replied / contacted : null,
    winRate: resolved >= MIN_DENOMINATOR ? won / resolved : null,
  };
}
