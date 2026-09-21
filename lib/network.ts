/**
 * Cross-account learning from categories only.
 *
 * A pattern is the *shape* of one endeavor: its kind, a channel category, its
 * lifecycle status, and the owner's verdict. It never contains a business
 * name, free text, URL, contact, or number. Aggregates are shown only when at
 * least MIN_ACCOUNTS distinct accounts contributed, and they describe what
 * owners chose and reported — never proof that an approach causes results.
 */
import type { BusinessDocument, Endeavor, IdeaKind } from './engine.ts';

export const MIN_ACCOUNTS = 3;
export const CHANNELS = [
  'creator',
  'email',
  'community',
  'directory',
  'search_content',
  'social',
  'partnership',
  'paid',
  'event',
  'referral',
  'product',
  'other',
] as const;
export type Channel = (typeof CHANNELS)[number];
export type Verdict = 'repeat' | 'adjust' | 'drop' | 'unknown';
export const VERDICTS: Verdict[] = ['repeat', 'adjust', 'drop', 'unknown'];

export type Pattern = {
  endeavorId: string;
  kind: IdeaKind;
  channel: Channel;
  status: Endeavor['status'];
  verdict: Verdict;
  reviewedArtifact: boolean;
  observed: boolean;
};

const rules: [Channel, RegExp][] = [
  ['creator', /\b(creator|influencer|youtuber|podcast|newsletter (writer|author)|streamer)s?\b/i],
  ['directory', /\b(director(y|ies)|listing|marketplace|product hunt|app store|review site)s?\b/i],
  ['community', /\b(communit(y|ies)|forum|reddit|discord|slack group|facebook group|subreddit)s?\b/i],
  ['partnership', /\b(partner(ship)?s?|co-?marketing|affiliate|reseller|integration partner)\b/i],
  ['paid', /\b(ads?|paid|sponsor(ed|ship)?|ppc|cpc|boost(ed)?)\b/i],
  ['event', /\b(event|webinar|meetup|conference|workshop|demo day|clinic)s?\b/i],
  ['referral', /\b(referral|word of mouth|invite program|refer a friend)s?\b/i],
  ['email', /\b(e-?mail|cold outreach|inbox|drip|sequence)s?\b/i],
  ['search_content', /\b(seo|blog|article|guide|search|landing page|content series|long-?form)s?\b/i],
  ['social', /\b(social|instagram|tiktok|linkedin|twitter|x\.com|threads|shorts|reels)\b/i],
  ['product', /\b(onboarding|activation|feature|pricing|checkout|retention|walkthrough|friction)\b/i],
];

/** Deterministic channel category from the endeavor's own words. The words are read, never stored. */
export function classifyChannel(text: string, kind: IdeaKind): Channel {
  for (const [channel, pattern] of rules) if (pattern.test(text)) return channel;
  return kind === 'product_improvement' ? 'product' : 'other';
}

export const isVerdict = (value: unknown): value is Verdict =>
  typeof value === 'string' && (VERDICTS as string[]).includes(value);

/** Category-only shapes for a live business. Demo businesses contribute nothing. */
export function patternsFor(business: BusinessDocument): Pattern[] {
  if (business.mode !== 'live') return [];
  return (business.work?.endeavors || []).slice(0, 200).map((endeavor) => ({
    endeavorId: endeavor.id,
    kind: endeavor.kind,
    channel: classifyChannel(
      [endeavor.title, endeavor.description, ...endeavor.intendedDeliverables].join('\n'),
      endeavor.kind,
    ),
    status: endeavor.status,
    verdict: endeavor.observations.find((item) => isVerdict(item.verdict))?.verdict || 'unknown',
    reviewedArtifact: endeavor.artifacts.some((item) => !!item.reviewedAt),
    observed: endeavor.observations.length > 0,
  }));
}

export type PatternRow = {
  contributorId: string;
  kind: string;
  channel: string;
  status: string;
  verdict: string;
  observed: boolean;
};
export type Insight = {
  kind: string;
  channel: string;
  accounts: number;
  endeavors: number;
  completed: number;
  stopped: number;
  observed: number;
  repeat: number;
  adjust: number;
  drop: number;
};

/** Aggregate rows, keeping only shapes that at least MIN_ACCOUNTS distinct accounts contributed. */
export function summarize(rows: PatternRow[], minimum = MIN_ACCOUNTS): Insight[] {
  const groups = new Map<string, { insight: Insight; accounts: Set<string> }>();
  for (const row of rows) {
    const key = `${row.kind}|${row.channel}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        accounts: new Set(),
        insight: { kind: row.kind, channel: row.channel, accounts: 0, endeavors: 0, completed: 0, stopped: 0, observed: 0, repeat: 0, adjust: 0, drop: 0 },
      };
      groups.set(key, group);
    }
    group.accounts.add(row.contributorId);
    const i = group.insight;
    i.endeavors++;
    if (row.status === 'completed') i.completed++;
    if (row.status === 'stopped') i.stopped++;
    if (row.observed) i.observed++;
    if (row.verdict === 'repeat' || row.verdict === 'adjust' || row.verdict === 'drop') i[row.verdict]++;
  }
  return [...groups.values()]
    .map(({ insight, accounts }) => ({ ...insight, accounts: accounts.size }))
    .filter((insight) => insight.accounts >= minimum)
    .sort((a, b) => b.repeat - a.repeat || b.accounts - a.accounts || b.endeavors - a.endeavors)
    .slice(0, 12);
}

/** One bounded paragraph for an ideation prompt. Empty when nothing clears the threshold. */
export function insightContext(insights: Insight[]) {
  if (!insights.length) return '';
  const lines = insights.slice(0, 8).map((i) => {
    const judged = i.repeat + i.adjust + i.drop;
    return `${i.kind}/${i.channel}: ${i.accounts} accounts, ${i.endeavors} endeavors, ${i.completed} completed, ${i.stopped} stopped; owner verdicts ${judged ? `${i.repeat} repeat, ${i.adjust} adjust, ${i.drop} drop` : 'unknown'}`;
  });
  return `Category-level patterns reported by other Traction owners (self-reported, small samples, different businesses; treat as weak priors, not evidence for this business, and never cite them as results): ${lines.join('; ')}.`;
}
