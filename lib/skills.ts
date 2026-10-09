import {
  addLog,
  type ArtifactKind,
  type BusinessDocument,
  type Endeavor,
  type SkillId,
} from './engine.ts';
import { isStaleFact, STALE_FACT_DAYS } from './knowledge.ts';
import { campaignAssetName, endeavorFor, saveArtifact } from './work.ts';

/**
 * A skill is a bounded run instruction with named inputs, a deterministic gap
 * check that runs before any reservation, and a parser that validates the
 * model's structured output and renders the artifact in code. Nothing a skill
 * produces is dropped: a bad concept is flagged for the owner, not hidden.
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
  /** JSON string stored on the artifact version so the UI can act on it. */
  data: string;
  flags: string[];
};

export type Skill = {
  id: SkillId;
  title: string;
  artifactKind: ArtifactKind;
  workload: 'routine' | 'strategic';
  gaps(business: BusinessDocument, endeavor: Endeavor): SkillInput[];
  instruction(business: BusinessDocument, endeavor: Endeavor, gaps: SkillInput[]): string;
  parse(value: unknown, business: BusinessDocument, endeavor: Endeavor): ParsedSkillOutput;
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
  /** Review aids. Empty means every check passed. */
  flags: string[];
};

export type CampaignBriefData = {
  skill: 'campaign_brief';
  concepts: Concept[];
  gaps: string[];
  /** Stale confirmed facts any concept cited, for the "Claims to verify" section. */
  claimsToVerify: { id: string; label: string; observedAt: string }[];
};

const CONCEPT_MIN = 2;
const CONCEPT_MAX = 4;
const CONCEPT_TARGET = 3;
const limits = {
  angle: [3, 40],
  hook: [10, 200],
  insight: [1, 1500],
  copy: [1, 1500],
  visual: [1, 1500],
  productionBrief: [1, 3000],
  hypothesis: [10, 300],
} as const;

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const confirmedFacts = (business: BusinessDocument) =>
  business.facts.filter((fact) => fact.status === 'confirmed' || fact.status === 'corrected');

function text(value: unknown, key: keyof typeof limits, flags: string[], index: number) {
  const [min, max] = limits[key];
  let out = typeof value === 'string' ? value.trim() : '';
  if (!out) {
    flags.push(`concept ${index + 1} is missing ${key}`);
    return '';
  }
  if (out.length < min) flags.push(`concept ${index + 1} ${key} is shorter than ${min} characters`);
  if (out.length > max) {
    flags.push(`concept ${index + 1} ${key} was cut at ${max} characters`);
    out = out.slice(0, max);
  }
  return out;
}

export const campaignBrief: Skill = {
  id: 'campaign_brief',
  title: 'Campaign brief',
  artifactKind: 'content',
  workload: 'strategic',

  gaps(business, endeavor) {
    const facts = confirmedFacts(business);
    const offer = facts.some(
      (fact) => fact.category === 'offer' || fact.category === 'product',
    );
    const anyConfirmed = facts.length > 0;
    const gaps: SkillInput[] = [];
    if (!(offer || anyConfirmed))
      gaps.push({
        key: 'offer',
        label: 'A confirmed offer or product fact',
        required: true,
        hint: 'Campaign brief needs a confirmed offer fact. Add one under Memory with the offer or product category.',
      });
    if (!endeavor.audience?.trim())
      gaps.push({
        key: 'audience',
        label: 'An audience',
        required: true,
        hint: 'Campaign brief needs an audience. Set who this work is for on the endeavor.',
      });
    if (!facts.some((fact) => fact.category === 'customer_language'))
      gaps.push({
        key: 'customer_language',
        label: 'Customer language',
        required: false,
        hint: 'No kept customer language yet. Concepts will use the offer and audience only.',
      });
    const exemplars = (business.work?.endeavors || [])
      .flatMap((item) => item.artifacts)
      .some((artifact) => artifact.exemplar && artifact.reviewedAt);
    if (!exemplars)
      gaps.push({
        key: 'exemplars',
        label: 'Approved examples',
        required: false,
        hint: 'No approved examples yet. Mark a reviewed artifact as an example in Do.',
      });
    if (!endeavor.research.some((item) => item.status === 'shortlisted'))
      gaps.push({
        key: 'research',
        label: 'Shortlisted research',
        required: false,
        hint: 'No shortlisted research on this endeavor. Concepts can cite confirmed facts only.',
      });
    return gaps;
  },

  instruction(business, endeavor, gaps) {
    const unknowns = gaps
      .filter((gap) => !gap.required)
      .map((gap) => `Unknown: ${gap.label}. Do not invent it.`)
      .join(' ');
    const factIds = confirmedFacts(business)
      .map((fact) => `fact:${fact.id}`)
      .slice(0, 40)
      .join(', ');
    const researchUrls = endeavor.research
      .filter((item) => item.status === 'shortlisted')
      .map((item) => item.url)
      .slice(0, 20)
      .join(', ');
    return [
      `Skill: campaign brief. Audience: ${endeavor.audience || 'unknown'}.`,
      `Return exactly one JSON object shaped like {"concepts":[{"angle":"","insight":"","evidence":[""],"hook":"","visual":"","copy":"","productionBrief":"","hypothesis":""}],"gaps":[""],"nextDecision":""}.`,
      `Produce ${CONCEPT_TARGET} concepts that differ in the reason to buy, not in wording: for example a pain point, a worked example, a customer story, a comparison, a myth to bust. Each angle is a short slug-safe name. Each insight is the customer problem in the customer's own words where customer language exists. Each evidence entry must be a confirmed fact id from this list (${factIds || 'none'}) or an https URL from the shortlisted research (${researchUrls || 'none'}); never cite anything else. Each hook is an opening line. Each visual says what the viewer sees the product doing. Each production brief says what to make, in what format, with what assets, so a designer or editor could start. Each hypothesis says what the concept tests and what would count as a win.`,
      `List in gaps any information you wanted and did not have. Facts marked verify are older than ${STALE_FACT_DAYS} days; cite them only with that caveat. Do not claim results, prices, partnerships, or capabilities that are not in the library.`,
      unknowns,
    ]
      .filter(Boolean)
      .join(' ');
  },

  parse(value, business, endeavor) {
    const root = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const rawConcepts = Array.isArray(root.concepts) ? root.concepts : [];
    const flags: string[] = [];
    if (rawConcepts.length < CONCEPT_MIN || rawConcepts.length > CONCEPT_MAX)
      flags.push(
        `expected ${CONCEPT_TARGET} concepts and received ${rawConcepts.length}`,
      );
    const facts = confirmedFacts(business);
    const factById = new Map(facts.map((fact) => [fact.id, fact]));
    const knownUrls = new Set([
      ...endeavor.research.map((item) => item.url),
      ...facts.map((fact) => fact.source).filter((source) => /^https:\/\//i.test(source)),
    ]);
    const cited = new Map<string, (typeof facts)[number]>();

    const concepts: Concept[] = rawConcepts.slice(0, CONCEPT_MAX).map((raw, index) => {
      const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const own: string[] = [];
      const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
        .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
        .map((entry) => entry.trim())
        .slice(0, 12);
      let traced = false;
      for (const entry of evidence) {
        if (entry.startsWith('fact:')) {
          const fact = factById.get(entry.slice(5));
          if (fact) {
            traced = true;
            cited.set(fact.id, fact);
            continue;
          }
        } else if (/^https:\/\//i.test(entry) && knownUrls.has(entry)) {
          traced = true;
          continue;
        }
        own.push(`evidence "${entry.slice(0, 80)}" does not resolve to a confirmed fact or shortlisted source`);
      }
      if (!traced) own.push('insight not traced to evidence');
      const concept: Concept = {
        angle: text(item.angle, 'angle', own, index),
        insight: text(item.insight, 'insight', own, index),
        evidence,
        hook: text(item.hook, 'hook', own, index),
        visual: text(item.visual, 'visual', own, index),
        copy: text(item.copy, 'copy', own, index),
        productionBrief: text(item.productionBrief, 'productionBrief', own, index),
        hypothesis: text(item.hypothesis, 'hypothesis', own, index),
        flags: own,
      };
      return concept;
    });

    for (let i = 0; i < concepts.length; i++)
      for (let j = 0; j < i; j++) {
        if (slug(concepts[i].angle) && slug(concepts[i].angle) === slug(concepts[j].angle))
          concepts[i].flags.push(`concept ${i + 1} repeats concept ${j + 1} (same angle)`);
        if (normalize(concepts[i].hook) && normalize(concepts[i].hook) === normalize(concepts[j].hook))
          concepts[i].flags.push(`concept ${i + 1} repeats concept ${j + 1} (same hook)`);
      }

    const gaps = (Array.isArray(root.gaps) ? root.gaps : [])
      .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
      .map((entry) => entry.trim().slice(0, 300))
      .slice(0, 12);
    const claimsToVerify = [...cited.values()]
      .filter((fact) => isStaleFact(fact))
      .map((fact) => ({ id: fact.id, label: fact.label, observedAt: fact.observedAt }));
    const nextDecision =
      typeof root.nextDecision === 'string' && root.nextDecision.trim()
        ? root.nextDecision.trim().slice(0, 2000)
        : 'Review the concepts, promote the one worth producing, and record what the others taught you.';

    const data: CampaignBriefData = { skill: 'campaign_brief', concepts, gaps, claimsToVerify };
    const allFlags = [...flags, ...concepts.flatMap((concept) => concept.flags)];
    return {
      content: renderCampaignBrief(endeavor, data, allFlags),
      nextDecision,
      data: JSON.stringify(data),
      flags: allFlags,
    };
  },
};

export function renderCampaignBrief(
  endeavor: Endeavor,
  data: CampaignBriefData,
  flags: string[],
) {
  const lines: string[] = [];
  lines.push(`# Campaign brief: ${endeavor.title} (${endeavor.code})`, '');
  lines.push(`Audience: ${endeavor.audience || 'unknown'}`, '');
  lines.push(
    'These are proposals for owner review. Nothing here has been produced, published, or tested.',
    '',
  );
  data.concepts.forEach((concept, index) => {
    lines.push(`## Concept ${index + 1}: ${concept.angle || 'untitled'}`, '');
    lines.push(`**Insight.** ${concept.insight}`, '');
    lines.push(`**Hook.** ${concept.hook}`, '');
    lines.push(`**Visual.** ${concept.visual}`, '');
    lines.push(`**Copy.**`, concept.copy, '');
    lines.push(`**Production brief.**`, concept.productionBrief, '');
    lines.push(`**Hypothesis.** ${concept.hypothesis}`, '');
    lines.push(
      `Evidence: ${concept.evidence.length ? concept.evidence.join(', ') : 'none cited'}`,
      '',
    );
    if (concept.flags.length)
      lines.push(`Review flags: ${concept.flags.join('; ')}`, '');
  });
  if (data.gaps.length) {
    lines.push('## Information the model wanted and did not have', '');
    for (const gap of data.gaps) lines.push(`- ${gap}`);
    lines.push('');
  }
  if (data.claimsToVerify.length) {
    lines.push('## Claims to verify', '');
    lines.push(
      `These cited facts are older than ${STALE_FACT_DAYS} days. Check them against the live product before use.`,
      '',
    );
    for (const claim of data.claimsToVerify)
      lines.push(`- ${claim.label} (observed ${claim.observedAt.slice(0, 10)})`);
    lines.push('');
  }
  if (flags.length) {
    lines.push('## Checks', '');
    for (const flag of flags) lines.push(`- ${flag}`);
    lines.push('');
  }
  return lines.join('\n');
}

export const skills: Record<SkillId, Skill> = { campaign_brief: campaignBrief };

export function skillFor(id: unknown): Skill {
  if (typeof id === 'string' && id in skills) return skills[id as SkillId];
  throw Error(`Choose a skill: ${Object.keys(skills).join(', ')}.`);
}

export function parseCampaignBriefData(version: { data?: string } | undefined) {
  if (!version?.data) return null;
  try {
    const parsed = JSON.parse(version.data) as CampaignBriefData;
    return parsed && parsed.skill === 'campaign_brief' && Array.isArray(parsed.concepts)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** The fixture a demo business returns instead of spending. Fictional and labeled. */
export function demoCampaignBriefAnswer(business: BusinessDocument, endeavor: Endeavor) {
  const fact = confirmedFacts(business)[0];
  const evidence = fact ? [`fact:${fact.id}`] : [];
  const concept = (angle: string, hook: string) => ({
    angle,
    insight: 'A fictional demo insight written in the customer voice.',
    evidence,
    hook,
    visual: 'The product shown doing the one thing the hook promises.',
    copy: 'Fictional demo copy for owner review. Replace before any use.',
    productionBrief: 'One static image and one 15-second clip, using real product screenshots.',
    hypothesis: 'Tests whether this reason to buy earns a reply; a win is one qualified conversation.',
  });
  return {
    concepts: [
      concept('pain-point', `Still doing this the hard way for ${endeavor.audience || 'your customers'}?`),
      concept('worked-example', 'Here is what one week looks like with it switched on.'),
      concept('customer-story', 'One owner, one problem, one honest before and after.'),
    ],
    gaps: ['This is a fictional demo run; no real customer language was available.'],
    nextDecision: 'Pick the one concept worth producing and record why the other two wait.',
  };
}

/**
 * Promote one concept into its own content artifact titled with the campaign
 * asset name. Idempotent per concept through its source evidence marker.
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
  const version =
    artifact.versions.find((item) => item.id === artifact.activeVersionId) ||
    artifact.versions.at(-1);
  const data = parseCampaignBriefData(version);
  if (!data) throw Error('This artifact holds no campaign brief concepts.');
  if (!Number.isInteger(index) || index < 0 || index >= data.concepts.length)
    throw Error('Choose a concept from this brief.');
  const marker = `concept:${artifactId}:${index}`;
  const existing = endeavor.artifacts.find((item) =>
    item.sourceEvidence?.includes(marker),
  );
  if (existing) return existing;
  const concept = data.concepts[index];
  const content = [
    `# ${concept.angle}`,
    '',
    `**Hook.** ${concept.hook}`,
    '',
    `**Copy.**`,
    concept.copy,
    '',
    `**Visual.** ${concept.visual}`,
    '',
    `**Production brief.**`,
    concept.productionBrief,
    '',
    `**Hypothesis.** ${concept.hypothesis}`,
    '',
    `Evidence: ${concept.evidence.length ? concept.evidence.join(', ') : 'none cited'}`,
    '',
    'Promoted from a campaign brief. Not produced, published, or tested.',
  ].join('\n');
  const promoted = saveArtifact(business, endeavorId, {
    kind: 'content',
    title: campaignAssetName(endeavor.code, concept.angle || `concept-${index + 1}`, 'brief', 1),
    content,
    source: 'assistant',
    sourceEvidence: [marker],
  });
  addLog(business, `Concept promoted to a production brief: ${promoted.title}.`);
  return promoted;
}
