import {
  addLog,
  uid,
  type BusinessDocument,
  type ExploreMessage,
  type ExploreState,
  type IdeaKind,
  type MarketingIdea,
} from './engine.ts';

export const ideaKinds: IdeaKind[] = [
  'research',
  'content',
  'outreach',
  'campaign',
  'experiment',
  'product_improvement',
];

export function exploreState(business: BusinessDocument): ExploreState {
  return business.explore || { ideas: [], messages: [] };
}

function writable(business: BusinessDocument): ExploreState {
  return (business.explore ||= { ideas: [], messages: [] });
}

export type IdeaInput = {
  title: string;
  kind: IdeaKind;
  description: string;
  audience: string;
  outcome: string;
  ownerNotes: string;
  sources: string[];
};

export function createIdea(
  business: BusinessDocument,
  input: IdeaInput,
): MarketingIdea {
  const now = new Date().toISOString();
  const idea: MarketingIdea = {
    id: uid('idea'),
    ...input,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  writable(business).ideas.unshift(idea);
  addLog(business, `Explore idea added: ${idea.title}.`);
  return idea;
}

export function updateIdea(
  business: BusinessDocument,
  ideaId: string,
  input: IdeaInput,
) {
  const idea = writable(business).ideas.find((item) => item.id === ideaId);
  if (!idea) throw Error('Explore idea not found.');
  Object.assign(idea, input, { updatedAt: new Date().toISOString() });
  addLog(business, `Explore idea updated: ${idea.title}.`);
  return idea;
}

export function parkIdea(
  business: BusinessDocument,
  ideaId: string,
  reason: string,
) {
  const idea = writable(business).ideas.find((item) => item.id === ideaId);
  if (!idea) throw Error('Explore idea not found.');
  if (idea.status === 'parked') return idea;
  idea.status = 'parked';
  idea.parkedReason = reason;
  idea.updatedAt = new Date().toISOString();
  addLog(business, `Explore idea parked: ${idea.title}.`);
  return idea;
}

export function restoreIdea(business: BusinessDocument, ideaId: string) {
  const idea = writable(business).ideas.find((item) => item.id === ideaId);
  if (!idea) throw Error('Explore idea not found.');
  if (idea.status === 'active') return idea;
  idea.status = 'active';
  delete idea.parkedReason;
  idea.updatedAt = new Date().toISOString();
  addLog(business, `Explore idea restored: ${idea.title}.`);
  return idea;
}

export function addExploreMessage(
  business: BusinessDocument,
  message: Omit<ExploreMessage, 'id' | 'createdAt'>,
) {
  const value: ExploreMessage = {
    ...message,
    id: uid('msg'),
    createdAt: new Date().toISOString(),
  };
  writable(business).messages.push(value);
  business.updatedAt = value.createdAt;
  return value;
}
