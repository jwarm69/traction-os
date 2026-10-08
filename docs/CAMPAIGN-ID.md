# Campaign ID design (step 1 of the marketing-engineer adaptation)

Status: design for implementation. Nothing below is built. Source of the idea: Greg Isenberg's "marketing engineers" thread, Step 3, "give every campaign an ID and carry it everywhere ... once you join those tables, your agents can answer which marketing brought in customers who paid and stayed."

## Goal

An owner can look at one business and see, per campaign: spend, leads, qualified conversations, deals, revenue, and churn, with unknowns shown as unknown. Every artifact, link, contact, prospect, and signal produced for a campaign carries the same short code, so later evidence can be joined back to the work that produced it without a developer.

Non-goals for this slice: no scheduler, no new AI calls, no ad-platform or Stripe integration, no causal attribution, no new database tables.

## Decision: the endeavor is the campaign

Do not add a new `Campaign` entity. An `Endeavor` in `lib/engine.ts` already freezes a selected direction with deliverables, artifacts, research, observations, and runs. The only thing it lacks is a stable, human-readable code and a way for other records to point at it. Adding a parallel entity would force every owner to decide "is this an endeavor or a campaign" and the answer is always both.

Consequences:

- `Endeavor.code` is the campaign ID.
- `PipelineContact.endeavorId` (already exists) is the campaign link for contacts. No change to its meaning.
- `Signal`, `Prospect`, and `Experiment` gain an optional `endeavorId`.
- The "campaign table" is derived at read time from the document. It is never stored.

## Data model changes (`lib/engine.ts`)

All additions are optional fields on existing types. `BusinessDocument.version` stays `2`. No migration file is needed because business state lives in one JSON document per business (`migrations/002_business_documents.sql`).

```ts
export type Endeavor = {
  // ...existing fields
  /** Short immutable campaign code, unique within the business, e.g. "AIQ003". */
  code: string;
};

export type WorkState = {
  endeavors: Endeavor[];
  /** Next sequence number for campaign codes. Never decremented, never reused. */
  nextCampaignNumber?: number;
};

export type CampaignMetric =
  | 'spend'
  | 'leads'
  | 'qualified'
  | 'deals'
  | 'revenue'
  | 'churned';

export type Signal = Provenance & {
  // ...existing fields
  /** Campaign this measurement belongs to. Absent means business-level. */
  endeavorId?: string;
  /** Only signals with both endeavorId and campaignMetric count in the campaign table. */
  campaignMetric?: CampaignMetric;
};

export type Prospect = {
  // ...existing fields
  endeavorId?: string;
};

export type Experiment = {
  // ...existing fields
  /** Links a legacy round experiment to the endeavor it belongs to. Optional, owner-set. */
  endeavorId?: string;
};
```

`campaignMetric` is a closed vocabulary on purpose. `Signal.metric` stays free text so existing GA4, CSV, and owner entries are untouched. A signal only enters the campaign table when the owner (or an import) explicitly classifies it. This mirrors the fact-review rule: an agent or import may add a guess, a human promotes it.

Units: `spend` and `revenue` are in the business's currency as a plain number. `leads`, `qualified`, `deals`, `churned` are counts. Do not add a currency field in this slice; the README already treats budgets as free text.

## Code generation (`lib/work.ts`)

Add `campaignPrefix(business)` and `assignCampaignCode(business, endeavor)`.

- Prefix: take the business name, split on whitespace, take the first letter of up to three words, uppercase, letters only. Fewer than two usable letters falls back to `CMP`. "AlignIQ Golf" → `AG`, "Bite Club Meal Plan" → `BCM`, "Tonight" → `T` → fallback `CMP`. Keep it deterministic and document it; the owner cannot edit it in this slice.
- Sequence: `work.nextCampaignNumber` starting at 1, zero-padded to three digits, incremented on every assignment. Stopped or deleted endeavors never free their number.
- Format: `${prefix}${sequence}`. Uniqueness is per business. Two businesses may both have `CMP001`; that is fine because business documents never mix.
- Immutable once assigned. No API op may change it.

Call sites that create an endeavor must assign the code: `selectIdea` and `prepareGuidedProposal` in `lib/work.ts`. Both are already idempotent on their source id; the code assignment rides inside the branch that creates a new record, so a repeated accept does not consume a number.

Backfill: `workState(business)` is a read accessor and must stay side-effect free. Instead, add `ensureCampaignCodes(business)` and call it once in `loadOwned` in `app/api/workspace/route.ts` (which `loadOrImport` already goes through) before the document is returned or mutated. It assigns codes to any endeavor lacking one, in `createdAt` ascending order so numbering matches history, and only writes if something changed. Owner starter records (AlignIQ Golf, Astro-Log, Tonight, Bite Club, Traction) pick up codes on first load this way; do not edit the seed scripts.

## Carrying the code

### Links

Add `campaignLink(url: string, code: string, medium?: string): string` in `lib/work.ts`. It sets `utm_campaign=<code>`, `utm_source=traction`, and `utm_medium=<medium or 'owner'>` on a copy of the URL, preserving existing query parameters and throwing on a non-https URL (reuse the pattern from `httpsRoute` in `lib/pipeline.ts`). This is a convenience for the owner to paste into posts and emails. Traction does not claim to read UTM data back in this slice; GA4 import stays as it is.

### Asset names

Add `campaignAssetName(code, angle, format, version)` returning `${code}_${slug(angle)}_${slug(format)}_v${version}`, e.g. `AG003_dinner-angle_ugc_v2`. Expose it in the artifact save flow as a suggested title for `content` and `outreach` artifacts. Do not enforce it; owners already have artifact titles.

### Contacts and prospects

- `addContact` in `lib/pipeline.ts` already accepts `endeavorId`. Validate it against `workState(business).endeavors` instead of only bounding its length, and reject unknown ids with "Endeavor not found." This is a tightening of existing behavior; check `tests/pipeline.test.mjs` for a case that passes a fabricated id and update it.
- `add_prospect` and `research_prospects` ops in `app/api/workspace/route.ts` accept an optional `endeavorId`, validated the same way, and store it on the `Prospect`. `OutreachDraft` inherits it through `prospectId`; do not duplicate the field on the draft.
- The pipeline panel already has an endeavor picker; it should display the code next to the title.

### Signals

- `add_signal` op accepts optional `endeavorId` and `campaignMetric`. Reject one without the other. Validate `campaignMetric` against the closed vocabulary and `endeavorId` against existing endeavors.
- `import_csv`: `parseSignalsCsv` in `lib/csv.ts` accepts two new optional columns, `campaign` (a campaign code, not an id, since owners will type it) and `campaign_metric`. The route resolves the code to an endeavor id and rejects the whole import on an unknown code or metric, matching the existing "reject the entire import on bad data" rule. Add fixture rows to `tests/csv.test.mjs`.
- `import_ga4` is unchanged. GA4 key events must never be auto-classified as `leads` or `deals`; the README forbids it.

## The campaign table (`lib/campaigns.ts`, new)

Pure functions over a `BusinessDocument`. No I/O, no AI.

```ts
export type CampaignRow = {
  endeavorId: string;
  code: string;
  title: string;
  status: EndeavorStatus;
  kind: IdeaKind;
  // From pipeline contacts with endeavorId === this endeavor
  contacts: number;
  contacted: number;
  replied: number;
  conversations: number;
  won: number;
  lost: number;
  // From classified signals. null means no signal recorded, not zero.
  spend: number | null;
  leads: number | null;
  qualified: number | null;
  deals: number | null;
  revenue: number | null;
  churned: number | null;
  // Derived only when both inputs exist and denominators meet MIN_DENOMINATOR.
  costPerConversation: number | null;
  costPerDeal: number | null;
  /** Human-readable reasons a cell is null, for the UI to show on hover. */
  unknowns: string[];
  lastEvidenceAt: string | null;
};

export function campaignRow(business: BusinessDocument, endeavorId: string): CampaignRow;
export function campaignTable(business: BusinessDocument): CampaignRow[];
```

Rules:

- Pipeline counts reuse `reachedStage` from `lib/pipeline.ts` so the same contact is not double counted and the meaning of "contacted" matches the pipeline panel.
- Classified signals for the same `campaignMetric` and endeavor are summed. If an owner wants to replace a value they add a correcting signal; the log shows provenance. Do not add edit-in-place for signals in this slice.
- `MIN_DENOMINATOR` (5) from `lib/pipeline.ts` gates every ratio. Below it, the ratio is null and `unknowns` says why.
- `conversations` is the pipeline count. `qualified` is an owner-classified signal. They are different things and both appear; do not merge them.
- `lastEvidenceAt` is the latest `observedAt` across contributing signals, contact stage events, and endeavor observations.
- Sort `campaignTable` by endeavor status (in_progress, ready, preparing, blocked, completed, stopped) then `createdAt` descending.

## API surface (`app/api/workspace/route.ts`)

No new read endpoint. The workspace already ships the full business document to the client, and `lib/` is shared, so `campaignTable` runs client-side exactly like `pipelineSummary` does in `app/pipeline-panel.tsx`.

Op changes:

| Op | Change |
| --- | --- |
| `add_signal` | optional `endeavorId` + `campaignMetric`, both or neither |
| `import_csv` | optional `campaign` and `campaign_metric` columns |
| `add_prospect` | optional `endeavorId` |
| `research_prospects` | optional `endeavorId` applied to every added prospect |
| `add_contact` | `endeavorId` now validated against endeavors |
| `start_experiment` | optional `endeavorId` stored on the round experiment |

Every validation error should name the field and the accepted values, in the style of the existing `throw Error('Choose a valid review state.')` messages.

## UI

Keep it to three touches. Do not build a dashboard.

1. **Do workspace, endeavor header** (`app/do-workspace.tsx`): show the code beside the title, a "Copy campaign link" control that calls `campaignLink` with the business URL, and the suggested asset name when saving a content or outreach artifact.
2. **Signals form** (`app/workspace.tsx` around the `add_signal` call): an optional campaign picker listing `code · title` and, when one is chosen, a required metric picker from the closed vocabulary. The CSV import help text documents the two new columns.
3. **Portfolio workspace** (`app/portfolio-workspace.tsx`): a per-business "Campaigns" table rendered from `campaignTable`. Null cells render as "unknown" with the reason on hover, never as 0 or a dash. No charts. One line above the table: "Counts are observations. Nothing here attributes revenue to a campaign causally."

The last line is not decoration. The roadmap and README both commit to not treating result comparisons as causal attribution. The campaign table makes a join possible for the first time, which is exactly when owners start reading it as proof.

## Tests

- `tests/work.test.mjs`: codes are assigned on `selectIdea` and `prepareGuidedProposal`; repeated select does not consume a number; prefix rules including the fallback; `ensureCampaignCodes` backfills in `createdAt` order and is a no-op the second time; `campaignLink` preserves existing params and rejects http; `campaignAssetName` slugging.
- `tests/campaigns.test.mjs` (new): a business with two endeavors, contacts split across them, and classified plus unclassified signals. Assert unclassified signals are ignored, sums are correct, ratios are null under `MIN_DENOMINATOR` and present above it, `unknowns` explains each null, and business-level signals without `endeavorId` never leak into a row.
- `tests/csv.test.mjs`: campaign columns parse, unknown code rejects the whole file, metric without code rejects.
- `tests/pipeline.test.mjs`: unknown `endeavorId` is rejected.
- `tests/business-api.mjs`: one round-trip adding a classified signal and reading it back in the document.

Run the standard checks from the README before claiming done: `npx tsc --noEmit`, `npx oxlint app lib db tests scripts`, `node --test tests/*.test.mjs`, `npm run build`.

## Out of scope, deliberately

- Spend and revenue syncing from Meta, Google Ads, or Stripe. Owners enter or import them.
- Reading UTM data back from GA4. The link helper only writes UTMs.
- Campaign-level AI summaries (the "performance memo"). That is step 3 and needs the scheduler question answered first.
- Renaming endeavors to campaigns anywhere in copy. Endeavor stays the word; code is the new thing.
- Editing a code after assignment.

## Open questions for the owner

1. Should the prefix be editable per business before the first code is assigned? The deterministic rule produces `CMP` for one-word names like Tonight, which is bland but harmless. Recommendation: ship deterministic, revisit if owners complain.
2. Should `qualified` be a pipeline stage instead of a signal? It would make "qualified conversation" a contact-level fact with history. Recommendation: not yet. The pipeline ladder is deliberately short and adding a stage changes `canMoveContact` for every existing contact.
