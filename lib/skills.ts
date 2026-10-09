import type {
  ArtifactKind,
  BusinessDocument,
  Endeavor,
  SkillId,
} from './engine.ts';
import { contextPack, STALE_FACT_DAYS } from './knowledge.ts';
import { activeArtifact, campaignAssetName, endeavorFor, saveArtifact } from './work.ts';

/**
 * A skill is a bounded run with named inputs, a deterministic gap check that
 * runs before any spend, an instruction, and an output check. The next skill
 * is a new entry in `skills`, not a refactor.
 */

export type SkillInput = {
  key: string;
  label: string;
  required: boolean;
  /** Where the owner fixes it, in the voice of the owner queue. */
  hint: string;
};

export type ParsedSkillOutput = {
  content: string;
  nextDecision: string;
  /** Validated JSON stored on the artifact version so the UI can act on it. */
  data: string;
  flags: string[];
};

export type Skill = {
  id: SkillId;
  title: string;
  artifactKind: ArtifactKind;
  workload: 'routine' | 'strategic';
  gaps(business: BusinessDocument, endeavor: Endeavor, now?: number): SkillInput[];
  /** The instruction for executionPrompt, with optional gaps listed as unknowns. */
  instruction(business: BusinessDocument, endeavor: Endeavor, gaps: SkillInput[], now?: number): string;
  /** The JSON shape the model must return. */
  format: string;
  parse(value: unknown, business: BusinessDocument, endeavor: Endeavor, now?: number): ParsedSkillOutput;
};

export type Concept = {
  angle: string;
  insight: string;
  evidence: string[];
  hook: string;
  visual: string;
  copy: string;
  productionBrief: string;
  hypothesis: string;
  flags: string[];
};

export type CampaignBriefData = {
  concepts: Concept[];
  gaps: string[];
  flags: string[];
  /** Stale facts any concept cites, as "label (observed date)". */
  claimsToVerify: string[];
};

const DAY = 86_400_000;
const confirmed = (business: BusinessDocument) =>
  business.facts.filter((fact) => fact.status === 'confirmed' || fact.status === 'corrected');
const isStale = (observedAt: string, now: number) => now - Date.parse(observedAt) > STALE_FACT_DAYS * DAY;
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const limits = {
  angle: [3, 40],
  hook: [10, 200],
  insight: [1, 1500],
  copy: [1, 1500],
  productionBrief: [1, 3000],
  hypothesis: [10, 300],
  visual: [1, 1500],
} as const;

function campaignBriefGaps(business: BusinessDocument, endeavor: Endeavor): SkillInput[] {
  const facts = confirmed(business);
  const categorized = facts.some((fact) => fact.category);
  const offer = categorized
    ? facts.some((fact) => fact.category === 'offer' || fact.category === 'product')
    : facts.length > 0;
  const gaps: SkillInput[] = [];
  if (!offer)
    gaps.push({
      key: 'offer',
      label: 'a confirmed offer or product fact',
      required: true,
      hint: 'Campaign brief needs a confirmed offer fact. Add one under Business context.',
    });
  if (!endeavor.audience?.trim())
    gaps.push({
      key: 'audience',
      label: 'an audience',
      required: true,
      hint: 'Campaign brief needs an audience. Name who this campaign is for.',
    });
  if (!facts.some((fact) => fact.category === 'customer_language'))
    gaps.push({
      key: 'customer_language',
      label: 'customer language',
      required: false,
      hint: 'Add facts in the customer language category to ground insights in customers’ own words.',
    });
  const exemplars = (business.work?.endeavors || []).some((item) =>
    item.artifacts.some((artifact) => artifact.exemplar && artifact.reviewedAt),
  );
  if (!exemplars)
    gaps.push({
      key: 'exemplars',
      label: 'approved examples',
      required: false,
      hint: 'Mark a reviewed artifact as an approved example so briefs match what has worked.',
    });
  if (!endeavor.research.some((item) => item.status === 'shortlisted'))
    gaps.push({
      key: 'research',
      label: 'shortlisted research',
      required: false,
      hint: 'Shortlist a research candidate to give concepts sourced evidence beyond your facts.',
    });
  return gaps;
}

function evidenceList(business: BusinessDocument, endeavor: Endeavor, now: number) {
  const pack = contextPack(business, 'campaign_brief', now);
  const lines = pack.facts.map(
    (fact) => `- fact:${fact.id} — ${fact.label}${isStale(fact.observedAt, now) ? ` (verify: observed ${fact.observedAt.slice(0, 10)})` : ''}`,
  );
  for (const item of endeavor.research.filter((candidate) => candidate.status === 'shortlisted'))
    lines.push(`- ${item.url} — ${item.name}`);
  return lines.length ? lines.join('\n') : '- None. Every concept will be flagged as untraced.';
}

function campaignBriefInstruction(
  business: BusinessDocument,
  endeavor: Endeavor,
  gaps: SkillInput[],
  now = Date.now(),
) {
  const unknowns = gaps
    .filter((gap) => !gap.required)
    .map((gap) => `Unknown: ${gap.label}. Do not invent it.`);
  return [
    `Prepare a campaign brief for ${endeavor.code} "${endeavor.title}" with exactly three distinct concepts.`,
    `Audience: ${endeavor.audience || 'unknown'}.`,
    'Each concept needs a different angle and a different hook. Ground each insight in the customer problem, in the customer’s words where customer language facts exist.',
    'Cite evidence only from this list, using the exact id or URL:',
    evidenceList(business, endeavor, now),
    'Visual says what the viewer sees the product doing. Production brief says what to make, in what format, with what assets, so a designer or editor could start. Hypothesis says what the concept tests and what would count as a win.',
    'List in gaps any information you wanted and did not have. Do not claim anything was made, sent, or published.',
    ...unknowns,
  ].join('\n');
}

const campaignBriefFormat =
  'Return exactly one JSON object: {"concepts":[{"angle":"short slug-safe name","insight":"","evidence":["fact:<id>" or "https://..."],"hook":"","visual":"","copy":"","productionBrief":"","hypothesis":""}],"gaps":["missing information"],"nextDecision":"one decision for the owner"}. All values are plain strings or arrays of strings.';

function parseCampaignBrief(
  value: unknown,
  business: BusinessDocument,
  endeavor: Endeavor,
  now = Date.now(),
): ParsedSkillOutput {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const list = Array.isArray(raw.concepts) ? raw.concepts.slice(0, 6) : [];
  if (!list.length) throw Error('The campaign brief returned no concepts.');
  const flags: string[] = [];
  if (list.length !== 3)
    flags.push(`Returned ${list.length} concept${list.length === 1 ? '' : 's'}; three is the target.`);

  const facts = new Map(confirmed(business).map((fact) => [fact.id, fact]));
  const urls = new Set([
    ...endeavor.research.map((item) => item.url),
    ...confirmed(business)
      .map((fact) => fact.source)
      .filter((source) => source.startsWith('https://')),
  ]);
  const claimsToVerify = new Set<string>();

  const concepts: Concept[] = list.map((item) => {
    const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const concept: Concept = {
      angle: text(source.angle),
      insight: text(source.insight),
      evidence: Array.isArray(source.evidence)
        ? source.evidence.map(text).filter(Boolean).slice(0, 10)
        : [],
      hook: text(source.hook),
      visual: text(source.visual),
      copy: text(source.copy),
      productionBrief: text(source.productionBrief),
      hypothesis: text(source.hypothesis),
      flags: [],
    };
    for (const [key, [min, max]] of Object.entries(limits) as [keyof typeof limits, readonly [number, number]][]) {
      const length = concept[key].length;
      if (length < min) concept.flags.push(`${key} is ${length ? 'too short' : 'missing'}.`);
      if (length > max) {
        concept.flags.push(`${key} was cut to ${max} characters.`);
        concept[key] = concept[key].slice(0, max);
      }
    }
    let traced = 0;
    for (const reference of concept.evidence) {
      const fact = reference.startsWith('fact:') ? facts.get(reference.slice(5)) : undefined;
      if (fact) {
        traced += 1;
        if (isStale(fact.observedAt, now))
          claimsToVerify.add(`${fact.label} (observed ${fact.observedAt.slice(0, 10)})`);
      } else if (urls.has(reference)) traced += 1;
    }
    if (!concept.evidence.length || traced < concept.evidence.length)
      concept.flags.push(
        traced ? 'Some evidence is not traced to a confirmed fact or kept source.' : 'Insight not traced to evidence.',
      );
    return concept;
  });

  for (let i = 0; i < concepts.length; i += 1)
    for (let j = 0; j < i; j += 1) {
      const same =
        (slug(concepts[i].angle) && slug(concepts[i].angle) === slug(concepts[j].angle)) ||
        (normalized(concepts[i].hook) && normalized(concepts[i].hook) === normalized(concepts[j].hook));
      if (same) concepts[i].flags.push(`Concept ${i + 1} repeats concept ${j + 1}.`);
    }

  const gaps = Array.isArray(raw.gaps) ? raw.gaps.map(text).filter(Boolean).slice(0, 10) : [];
  const nextDecision =
    text(raw.nextDecision).slice(0, 1500) || 'Choose one concept to promote to a production brief.';
  const data: CampaignBriefData = {
    concepts,
    gaps,
    flags,
    claimsToVerify: [...claimsToVerify],
  };
  return { content: renderCampaignBrief(endeavor, data), nextDecision, data: JSON.stringify(data), flags };
}

/** The artifact text is rendered by code from validated concepts, so its format is stable across models. */
export function renderCampaignBrief(endeavor: Pick<Endeavor, 'code' | 'title' | 'audience'>, data: CampaignBriefData) {
  const lines = [`# ${endeavor.code} campaign brief: ${endeavor.title}`, '', `Audience: ${endeavor.audience || 'unknown'}`, ''];
  if (data.flags.length) lines.push(...data.flags.map((flag) => `> Check: ${flag}`), '');
  data.concepts.forEach((concept, index) => {
    lines.push(
      `## Concept ${index + 1}: ${concept.angle || 'untitled'}`,
      '',
      ...concept.flags.map((flag) => `> Check: ${flag}`),
      ...(concept.flags.length ? [''] : []),
      `**Insight.** ${concept.insight}`,
      '',
      `**Evidence.** ${concept.evidence.length ? concept.evidence.join(', ') : 'none cited'}`,
      '',
      `**Hook.** ${concept.hook}`,
      '',
      `**Visual.** ${concept.visual}`,
      '',
      `**Copy.** ${concept.copy}`,
      '',
      `**Production brief.** ${concept.productionBrief}`,
      '',
      `**Hypothesis.** ${concept.hypothesis}`,
      '',
    );
  });
  if (data.gaps.length) lines.push('## Missing information', '', ...data.gaps.map((gap) => `- ${gap}`), '');
  if (data.claimsToVerify.length)
    lines.push('## Claims to verify', '', ...data.claimsToVerify.map((claim) => `- ${claim}`), '');
  return lines.join('\n');
}

export function parseBriefData(data?: string): CampaignBriefData | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as CampaignBriefData;
    return Array.isArray(parsed.concepts) ? parsed : null;
  } catch {
    return null;
  }
}

export const skills: Record<SkillId, Skill> = {
  campaign_brief: {
    id: 'campaign_brief',
    title: 'Campaign brief',
    artifactKind: 'content',
    workload: 'strategic',
    gaps: campaignBriefGaps,
    instruction: campaignBriefInstruction,
    format: campaignBriefFormat,
    parse: parseCampaignBrief,
  },
};

export const isSkillId = (value: unknown): value is SkillId =>
  typeof value === 'string' && Object.hasOwn(skills, value);

/** Kinds a campaign brief serves. Product improvements route to the Codex runner instead. */
export const skillKinds: Record<SkillId, Endeavor['kind'][]> = {
  campaign_brief: ['campaign', 'content', 'outreach', 'experiment'],
};

/** Fictional demo output so demo businesses exercise the whole path without a provider. */
export function demoCampaignBrief(business: BusinessDocument, endeavor: Endeavor): Record<string, unknown> {
  const fact = confirmed(business)[0];
  const evidence = fact ? [`fact:${fact.id}`] : [];
  const concept = (angle: string, hook: string) => ({
    angle,
    insight: `Fictional demo insight for ${endeavor.audience || 'the audience'}.`,
    evidence,
    hook,
    visual: 'Fictional demo visual: the product in use, shown in one continuous shot.',
    copy: 'Fictional demo copy. Replace before use.',
    productionBrief: 'Fictional demo brief: one 20-second vertical video, product footage, captions.',
    hypothesis: 'Fictional demo hypothesis: this angle earns more replies than the others.',
  });
  return {
    concepts: [
      concept('time-saved', 'What if setup took ten seconds instead of ten minutes?'),
      concept('proof-first', 'Here is the before and after from one real session.'),
      concept('coach-voice', 'The drill your coach would give you, without the lesson fee.'),
    ],
    gaps: ['Demo data: no real customer language was used.'],
    nextDecision: 'Pick one concept to promote to a production brief.',
  };
}

/**
 * Turn one concept into its own content artifact, named by the campaign asset
 * convention. Idempotent: a concept already promoted returns its artifact.
 */
export function promoteConcept(
  business: BusinessDocument,
  endeavorId: string,
  artifactId: string,
  index: number,
) {
  const endeavor = endeavorFor(business, endeavorId);
  const artifact = endeavor.artifacts.find((item) => item.id === artifactId);
  if (!artifact) throw Error('Artifact not found.');
  const data = parseBriefData(activeArtifact(artifact)?.data);
  if (!data) throw Error('This artifact has no concepts to promote. Promote from the latest brief version.');
  const concept = Number.isInteger(index) ? data.concepts[index] : undefined;
  if (!concept) throw Error('Concept not found.');
  const reference = `concept:${artifactId}:${index}`;
  const existing = endeavor.artifacts.find((item) => item.sourceEvidence?.includes(reference));
  if (existing) return existing;
  return saveArtifact(business, endeavorId, {
    kind: 'content',
    title: campaignAssetName(endeavor.code, concept.angle, 'brief', 1),
    content: [
      `# ${concept.angle || 'Concept'} — production brief`,
      '',
      `**Hook.** ${concept.hook}`,
      '',
      `**Copy.** ${concept.copy}`,
      '',
      `**Visual.** ${concept.visual}`,
      '',
      `**Production brief.** ${concept.productionBrief}`,
      '',
      `**Hypothesis.** ${concept.hypothesis}`,
      '',
      `**Evidence.** ${concept.evidence.join(', ') || 'none cited'}`,
      ...(concept.flags.length ? ['', ...concept.flags.map((flag) => `> Check: ${flag}`)] : []),
    ].join('\n'),
    source: 'assistant',
    sourceEvidence: [reference],
  });
}
