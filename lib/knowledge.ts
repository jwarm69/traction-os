import {
  addLog,
  correctionScopes,
  factCategories,
  uid,
  type BusinessDocument,
  type Correction,
  type CorrectionScope,
  type Fact,
  type FactCategory,
  type WorkArtifact,
} from './engine.ts';

/**
 * The knowledge library: what the owner has already judged, delivered to every
 * model call in a predictable order with its age visible. Pure except for the
 * small mutation helpers at the bottom, which only touch the business document.
 */

export const STALE_FACT_DAYS = 90;
export const MAX_EXEMPLARS = 12;
export const MAX_CORRECTIONS = 40;
export const MAX_CORRECTION_LENGTH = 300;
export const MAX_EXEMPLAR_WHY = 300;
export const MIN_EXEMPLAR_WHY = 10;
export const CONTEXT_PACK_LIMIT = 12000;
const EXEMPLAR_BODY_LIMIT = 1200;
const MAX_PACK_EXEMPLARS = 3;

/** Facts per category, in the order they are written to the model. */
export const categoryBudgets: Record<FactCategory, number> = {
  offer: 3,
  product: 4,
  positioning: 2,
  voice: 2,
  proof: 2,
  customer_language: 6,
  other: 4,
};
const categoryOrder: FactCategory[] = [
  'offer',
  'product',
  'positioning',
  'voice',
  'proof',
  'customer_language',
  'other',
];

export const categoryLabels: Record<FactCategory, string> = {
  product: 'Product',
  positioning: 'Positioning',
  customer_language: 'Customer language',
  offer: 'Offer',
  voice: 'Voice',
  proof: 'Proof',
  other: 'Other',
};

export const factCategory = (fact: Pick<Fact, 'category'>): FactCategory =>
  fact.category && factCategories.includes(fact.category)
    ? fact.category
    : 'other';

export function isStaleFact(fact: Pick<Fact, 'observedAt'>, now = Date.now()) {
  const observed = new Date(fact.observedAt).getTime();
  if (!Number.isFinite(observed)) return true;
  return now - observed > STALE_FACT_DAYS * 24 * 60 * 60 * 1000;
}

export type PackFact = {
  id: string;
  category: FactCategory;
  label: string;
  value: string;
  source: string;
  observedAt: string;
  confidence: Fact['confidence'];
  /** Set when the fact is older than STALE_FACT_DAYS; the model is told to verify it. */
  verify?: string;
};
export type PackExemplar = {
  artifactId: string;
  title: string;
  kind: WorkArtifact['kind'];
  why: string;
  excerpt: string;
  truncated: boolean;
};
export type ContextPack = {
  facts: PackFact[];
  exemplars: PackExemplar[];
  corrections: { id: string; scope: CorrectionScope; text: string }[];
  /** What truncation removed, so the owner can see it in the preview. */
  dropped: string[];
  /** The pack as text, for the agent brief and the preview. */
  text: string;
  characters: number;
};

const activeContent = (artifact: WorkArtifact) =>
  (
    artifact.versions.find((item) => item.id === artifact.activeVersionId) ||
    artifact.versions.at(-1)
  )?.content || '';

function selectFacts(business: BusinessDocument, now: number): PackFact[] {
  const confirmed = business.facts.filter(
    (fact) => fact.status === 'confirmed' || fact.status === 'corrected',
  );
  const out: PackFact[] = [];
  for (const category of categoryOrder) {
    const inCategory = confirmed
      .filter((fact) => factCategory(fact) === category)
      .sort((a, z) => z.observedAt.localeCompare(a.observedAt))
      .slice(0, categoryBudgets[category]);
    for (const fact of inCategory)
      out.push({
        id: fact.id,
        category,
        label: fact.label,
        value: fact.value,
        source: fact.source,
        observedAt: fact.observedAt,
        confidence: fact.confidence,
        ...(isStaleFact(fact, now)
          ? { verify: `verify: observed ${fact.observedAt.slice(0, 10)}` }
          : {}),
      });
  }
  return out;
}

function selectExemplars(business: BusinessDocument): PackExemplar[] {
  return (business.work?.endeavors || [])
    .flatMap((endeavor) => endeavor.artifacts)
    .filter((artifact) => artifact.exemplar && artifact.reviewedAt)
    .sort((a, z) => z.exemplar!.markedAt.localeCompare(a.exemplar!.markedAt))
    .slice(0, MAX_PACK_EXEMPLARS)
    .map((artifact) => {
      const content = activeContent(artifact);
      return {
        artifactId: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        why: artifact.exemplar!.why,
        excerpt: content.slice(0, EXEMPLAR_BODY_LIMIT),
        truncated: content.length > EXEMPLAR_BODY_LIMIT,
      };
    });
}

export function correctionsFor(
  business: BusinessDocument,
  scope?: CorrectionScope,
) {
  return (business.corrections || [])
    .filter((item) => item.scope === 'all' || (!!scope && item.scope === scope))
    .sort((a, z) => a.createdAt.localeCompare(z.createdAt));
}

function renderPack(pack: Omit<ContextPack, 'text' | 'characters'>) {
  const lines: string[] = [];
  lines.push('## Confirmed facts');
  if (!pack.facts.length) lines.push('- No confirmed facts are recorded yet.');
  for (const fact of pack.facts)
    lines.push(
      `- [${categoryLabels[fact.category]}] ${fact.label}: ${fact.value} (source: ${fact.source}; observed ${fact.observedAt.slice(0, 10)}; ${fact.confidence} confidence${fact.verify ? `; ${fact.verify}` : ''})`,
    );
  lines.push('', '## Approved examples');
  if (!pack.exemplars.length)
    lines.push('- No approved examples are marked yet.');
  for (const item of pack.exemplars) {
    lines.push(`### ${item.title} (${item.kind.replace('_', ' ')})`);
    lines.push(`Why it works: ${item.why}`);
    if (item.excerpt)
      lines.push(item.excerpt + (item.truncated ? '\n[excerpt truncated]' : ''));
  }
  lines.push('', '## Standing corrections');
  if (!pack.corrections.length)
    lines.push('- No standing corrections are recorded yet.');
  for (const item of pack.corrections)
    lines.push(`- (${item.scope}) ${item.text}`);
  if (pack.dropped.length)
    lines.push('', `Omitted to fit: ${pack.dropped.join('; ')}.`);
  return lines.join('\n');
}

/**
 * Everything an owner has judged, in budgeted order, capped at
 * CONTEXT_PACK_LIMIT characters. Truncation drops 'other' facts first, then
 * exemplar bodies, and says what it dropped.
 */
export function contextPack(
  business: BusinessDocument,
  scope?: CorrectionScope,
  now = Date.now(),
): ContextPack {
  const base = {
    facts: selectFacts(business, now),
    exemplars: selectExemplars(business),
    corrections: correctionsFor(business, scope).map((item) => ({
      id: item.id,
      scope: item.scope,
      text: item.text,
    })),
    dropped: [] as string[],
  };
  let text = renderPack(base);
  if (text.length > CONTEXT_PACK_LIMIT) {
    const others = base.facts.filter((fact) => fact.category === 'other');
    if (others.length) {
      base.facts = base.facts.filter((fact) => fact.category !== 'other');
      base.dropped.push(`${others.length} uncategorized fact${others.length === 1 ? '' : 's'}`);
      text = renderPack(base);
    }
  }
  if (text.length > CONTEXT_PACK_LIMIT && base.exemplars.length) {
    base.exemplars = base.exemplars.map((item) => ({
      ...item,
      excerpt: '',
      truncated: true,
    }));
    base.dropped.push('approved example bodies');
    text = renderPack(base);
  }
  if (text.length > CONTEXT_PACK_LIMIT) {
    base.dropped.push('the pack was cut at the character limit');
    text = renderPack(base).slice(0, CONTEXT_PACK_LIMIT);
  }
  return { ...base, text, characters: text.length };
}

const now = () => new Date().toISOString();

function artifactIn(business: BusinessDocument, endeavorId: string, artifactId: string) {
  const endeavor = (business.work?.endeavors || []).find((item) => item.id === endeavorId);
  if (!endeavor) throw Error('Do work item not found.');
  const artifact = endeavor.artifacts.find((item) => item.id === artifactId);
  if (!artifact) throw Error('Artifact not found.');
  return { endeavor, artifact };
}

export function markExemplar(
  business: BusinessDocument,
  endeavorId: string,
  artifactId: string,
  why: string,
) {
  const { endeavor, artifact } = artifactIn(business, endeavorId, artifactId);
  if (!artifact.reviewedAt)
    throw Error('Review the artifact before marking it as an approved example.');
  const reason = why.trim();
  if (reason.length < MIN_EXEMPLAR_WHY || reason.length > MAX_EXEMPLAR_WHY)
    throw Error(
      `Say why this example works, in ${MIN_EXEMPLAR_WHY} to ${MAX_EXEMPLAR_WHY} characters.`,
    );
  const count = (business.work?.endeavors || [])
    .flatMap((item) => item.artifacts)
    .filter((item) => item.exemplar && item.id !== artifact.id).length;
  if (count >= MAX_EXEMPLARS)
    throw Error(`Keep at most ${MAX_EXEMPLARS} approved examples. Unmark one first.`);
  artifact.exemplar = { why: reason, markedAt: now() };
  artifact.updatedAt = artifact.exemplar.markedAt;
  endeavor.updatedAt = artifact.updatedAt;
  addLog(business, `Approved example marked: ${artifact.title}.`);
  return artifact;
}

export function unmarkExemplar(
  business: BusinessDocument,
  endeavorId: string,
  artifactId: string,
) {
  const { endeavor, artifact } = artifactIn(business, endeavorId, artifactId);
  if (!artifact.exemplar) return artifact;
  delete artifact.exemplar;
  artifact.updatedAt = now();
  endeavor.updatedAt = artifact.updatedAt;
  addLog(business, `Approved example unmarked: ${artifact.title}.`);
  return artifact;
}

export function addCorrection(
  business: BusinessDocument,
  input: { text: string; scope: CorrectionScope; fromArtifactId?: string },
) {
  const text = input.text.trim();
  if (!text) throw Error('Write the correction before saving it.');
  if (text.length > MAX_CORRECTION_LENGTH)
    throw Error(`Keep a correction to ${MAX_CORRECTION_LENGTH} characters.`);
  if (!correctionScopes.includes(input.scope))
    throw Error(`Choose a correction scope: ${correctionScopes.join(', ')}.`);
  business.corrections ||= [];
  if (business.corrections.length >= MAX_CORRECTIONS)
    throw Error(`Keep at most ${MAX_CORRECTIONS} standing corrections. Remove one first.`);
  const correction: Correction = {
    id: uid('correction'),
    text,
    scope: input.scope,
    createdAt: now(),
    ...(input.fromArtifactId ? { fromArtifactId: input.fromArtifactId } : {}),
  };
  business.corrections.push(correction);
  addLog(business, `Standing correction saved (${input.scope}).`);
  return correction;
}

export function removeCorrection(business: BusinessDocument, correctionId: string) {
  const list = business.corrections || [];
  const index = list.findIndex((item) => item.id === correctionId);
  if (index < 0) throw Error('Correction not found.');
  const [removed] = list.splice(index, 1);
  addLog(business, 'Standing correction removed.');
  return removed;
}
