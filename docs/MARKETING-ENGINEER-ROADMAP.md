# Marketing-engineer adaptation: map and steps 4–7

Status: design map. Built so far: step 1 (campaign codes, PR #6), step 5 (knowledge library, PR #8), step 3's evidence bar and memo core (see [PERFORMANCE-MEMO.md](PERFORMANCE-MEMO.md) for what shipped and what did not), step 4 (campaign brief skill), and step 6 (run record and exports); implementation notes sit under steps 4 and 6. Steps 2 and 7 remain designs. Steps 1–3 have their own designs: [CAMPAIGN-ID.md](CAMPAIGN-ID.md), [CUSTOMER-LANGUAGE.md](CUSTOMER-LANGUAGE.md), [PERFORMANCE-MEMO.md](PERFORMANCE-MEMO.md). This document adds a second source, checks it against the product and those three designs, records the amendments it forces, and outlines steps 4–7.

Sources:

- Greg Isenberg's "marketing engineers" thread. It describes the *agents and rules*: campaign IDs, the customer language agent, the performance memo, the evidence bar, a decisions folder. Steps 1–3 came from it.
- "How to become a Marketing Engineer in 90 days." It describes the *person and the system they build by hand*: a repeatable campaign workflow in Claude Code or Codex, a company knowledge library and reusable skills, connected data and a KPI dashboard, audience workflows, creative production and landing pages, recurring runs, a weekly run record, and a handover another marketer can follow.

## What the second source changes

The 90-day roadmap is a build plan for one marketer with one company. Traction is that build, delivered as a product, for an owner who will not spend 90 days on it. That is the pivot in one sentence: **Traction is the system a marketing engineer would build in 90 days, with the review and spend boundaries already in place.** The campaign folder is the endeavor with its code. The knowledge library is confirmed facts, kept customer language, approved examples, and standing corrections. The skills are playbooks plus bounded run instructions with checks. The dashboard is the campaign table. The Monday report is the memo. The run record is derived from execution runs, artifact versions, observations, and memo decisions.

Two customers appear, not one:

| Customer | Who they are | What Traction is to them | Status |
| --- | --- | --- | --- |
| A | An owner acting as their own marketing engineer | The whole system, operated in the browser | The roadmap's first customer hypothesis; the five-owner pilot gate stands |
| B | A marketing engineer, in-house or agency, who already runs Claude Code or Codex | The system of record their agents read from and write drafts back to | New. Jack is customer B for AlignIQ Golf, Astro-Log, Tonight, and Traction, and this repository is built that way |

Decision: keep customer A as the pilot gate. Build steps 4–6 for both. Build step 7 (the paired agent connection) because customer B is the owner, which makes it the dogfood path and internal evidence, not demand validation. Do not change the roadmap's audience expansion rule (agencies and teams only after five invited owners).

## Mapping the roadmap onto the product

| Roadmap component | Traction today | Covered by | Gap | Step |
| --- | --- | --- | --- | --- |
| Days 1–14: a repeatable creative-planning workflow (read product notes, interviews, approved examples; three distinct concepts each with insight, source, hook, visual, copy, production brief; flag missing information; save in a campaign folder as drafts) | `run_work` produces one Markdown artifact from `executionPrompt`; four artifact kinds; endeavor as folder | Step 1 gives the folder a code and asset names | No concept structure, no distinctness or evidence check, no "missing information" refusal before spend | 4 |
| Days 15–30: company knowledge library (product facts, positioning, customer language, offer, voice, approved examples with why, sources and dates) | `facts` with provenance and review state; `executionPrompt` injects 12 facts in no particular order | Step 2 adds customer language and standing corrections | No fact categories, no approved examples, arbitrary 12-fact slice, agent brief lacks these sections, corrections scoped to one report type | 5 |
| Days 15–30: reusable skills with inputs, steps, outputs, checks; corrections saved so the next run improves | Playbooks are static checklists; prompts are inline in the route | Step 3's memo is the reporting skill | No skill object that names inputs and validates outputs | 4, 5 |
| Days 31–44: connect one source, dashboard with spend, conversions, cost per conversion by campaign, date filter, conversion definition, last refresh time, stale flags, reconciled against the source | GA4 import and CSV import, owner-triggered; `observedAt` on every signal | Step 1's campaign table; step 3's evidence bar is the conversion definition; step 3's period filter | Freshness is not shown; pacing is not computed; ad-platform spend sync needs M3 OAuth | Amendments to 1 and 3; 7 for agent-written signals |
| Days 31–44: MCP servers and browser checks for the marketer's agent | Paired Codex runner pushes jobs out; agent brief is a paste | Runner, `buildAgentBrief` | Nothing lets the owner's own agent read Traction or return work except the runner | 7 |
| Days 45–60: audience as an input; defensible segment with evidence and exclusions; Clay and Apollo | Pipeline contacts with `endeavorId`; prospects with reason and source; research candidates with observed facts and uncertainties | Step 1 links contacts and prospects to campaigns | Endeavor has no audience field; no path for an external research table other than typing | 4 (audience input), 7 (`add_research_candidates`) |
| Days 61–74: scripts, shot lists, prompts for Higgsfield or Runway; landing-page prototype; hypothesis per concept; weekly run record | Content artifacts are text; `product_improvement` routes to the Codex runner; evidence bar per endeavor | Step 3's bar | Hypothesis per concept lives nowhere; no run record view or export | 4 (hypothesis on the concept), 6 |
| Days 75–90: recurring runs, pacing alerts, failure drills (missing brief, unavailable source, outdated claim, restart without duplicates), handover guide, case study | Step 3's spend-free tick with `weekKey` idempotency; runner duplicate prevention; partner view access | Step 3 | Pacing caveat; stale-claim marking; case-study export; an operator role | Amendment to 3; 4; 6; deferred role |
| Bonus: SQL, warehouse, Python | CSV in, Markdown out | Step 1's code as the join key | No row export | 6 (CSV export of the campaign table), 7 |

## Amendments to steps 1–3

These are recorded in the step documents as one-line notes pointing here. The designs otherwise stand.

- **Step 1, freshness.** `CampaignRow` gains `stale: boolean`, true when the endeavor is `in_progress` and `lastEvidenceAt` is older than `STALE_EVIDENCE_DAYS` (14) or null. The Portfolio table shows "stale since <date>" in the row, not a dash. This is the roadmap's "last successful refresh" made honest: it shows when evidence last arrived, not that a sync ran. `campaignRow` also takes the optional `{ since, until }` filter step 3 already needs.
- **Step 2, corrections.** `EvidenceState.standingCorrections` moves to the business-level `corrections` list in step 5 with scope `customer_language`. Report runs read scope `customer_language` plus `all`. `promote_phrase` sets `category: 'customer_language'` on the fact it creates.
- **Step 3, pacing.** When a bar has both `maxSpend` and `maxDays` and at least three days have elapsed, project spend at the cumulative daily rate. If the projected exhaustion day is before `maxDays`, add the caveat "On pace to reach the spend limit on day N of M." It is a caveat, not a verdict, and it reaches the owner through the existing undecided-lines queue item. No other alert channel exists until M3 delivers persistent connections.

## Step 4 — Campaign brief skill

Goal: an owner opens a campaign endeavor, presses one control, sees what is missing before anything is spent, and gets three distinct concepts, each traced to evidence, each with a production brief a designer or editor could work from, saved as a draft in the campaign. A second campaign in a fresh session gets the same quality without re-explaining, because the context comes from the library, not the conversation.

### Skill object (`lib/skills.ts`, new)

```ts
export type SkillId = 'campaign_brief';

export type SkillInput = {
  key: string;
  label: string;
  required: boolean;
  /** Where the owner fixes it, in the voice of the owner queue. */
  hint: string;
};

export type Skill = {
  id: SkillId;
  title: string;
  artifactKind: ArtifactKind;
  workload: 'routine' | 'strategic';
  /** Deterministic. Returns the inputs that are missing. Runs before any reservation. */
  gaps(business: BusinessDocument, endeavor: Endeavor): SkillInput[];
  /** The instruction slot of executionPrompt, with optional gaps listed as unknowns. */
  instruction(business: BusinessDocument, endeavor: Endeavor, gaps: SkillInput[]): string;
  /** Validates structured output and renders the Markdown artifact. Never drops a concept; flags it. */
  parse(value: unknown, business: BusinessDocument, endeavor: Endeavor): ParsedSkillOutput;
};

export type ParsedSkillOutput = {
  content: string;
  nextDecision: string;
  /** JSON string stored on the artifact version so the UI can act on concepts. */
  data: string;
  flags: string[];
};
```

Inputs for `campaign_brief`:

| Input | Required | Source |
| --- | --- | --- |
| A confirmed offer or product fact | yes | `facts` with status `confirmed` or `corrected`; category `offer` or `product` once step 5 exists, any confirmed fact until then |
| An audience | yes | New optional `Endeavor.audience`, populated from `sourceIdeaSnapshot.audience` in `selectIdea` and from the guided proposal's audience in `prepareGuidedProposal`, editable through `update_work` |
| Customer language | no | Facts in category `customer_language` (step 2 promotes into it) |
| Approved examples | no | Exemplars from step 5 |
| Shortlisted research | no | `endeavor.research` with status `shortlisted` |

A required gap makes `run_work` throw before reservation, in the existing message style: "Campaign brief needs a confirmed offer fact. Add one under Context." Optional gaps enter the prompt as "Unknown: <label>. Do not invent it." This is the roadmap's "missing brief" drill, done deterministically.

Stale facts: `STALE_FACT_DAYS` (90) in `lib/knowledge.ts` (step 5; a local constant until then). Facts older than that are passed with "(verify: observed <date>)" and the artifact ends with a "Claims to verify" section listing the stale facts any concept cites. This is the "outdated product claim" drill. Comparing claims against the live product page stays a Jev task through the existing runner.

### Output and checks

The model returns:

```json
{
  "concepts": [
    {
      "angle": "short name, slug-safe",
      "insight": "the customer problem in the customer's words",
      "evidence": ["fact:<id>", "https://..."],
      "hook": "opening line",
      "visual": "what the viewer sees the product doing",
      "copy": "body copy",
      "productionBrief": "what to make, in what format, with what assets",
      "hypothesis": "what this concept tests and what would count as a win"
    }
  ],
  "gaps": ["information the model wanted and did not have"],
  "nextDecision": "one decision for the owner"
}
```

`parse` rules, in order:

1. Two to four concepts; exactly three is the target. Fewer or more is a flag, not a rejection.
2. Angles must be distinct after slugging, and hooks must differ after whitespace and case normalization. Duplicates are flagged "concept N repeats concept M."
3. Each `evidence` entry must resolve to a confirmed fact id or to an https URL that appears in the endeavor's research candidates or in a confirmed fact's source. Unresolved entries are kept and the concept is flagged "insight not traced to evidence." Nothing is dropped, because a concept is a proposal and the owner reviews it; the flag is the review aid.
4. Lengths: angle 3–40, hook 10–200, insight and copy up to 1,500, production brief up to 3,000, hypothesis 10–300 characters.
5. `content` is rendered by code from the validated concepts, so the artifact format is stable across models. `nextDecision` passes through `executionText`.

`ArtifactVersion` gains optional `data?: string` (max 20,000 characters) holding the validated JSON. Older versions read as absent.

### Ops and routing

- `run_work` accepts optional `skillId`. With it, the route runs `gaps`, throws on a required gap, builds the instruction, and calls `parse` instead of the plain `executionText` path. The `ExecutionRun` records `skillId`.
- `promote_concept` (`endeavorId`, `artifactId`, `index`): creates a `content` artifact titled `campaignAssetName(code, angle, 'brief', 1)` from step 1, containing the hook, copy, visual, production brief, and hypothesis. Idempotent through `sourceEvidence: ['concept:<artifactId>:<index>']`, mirroring `promote_phrase`.
- `planExecution` gains a skill-aware branch: `campaign_brief` routes `in_app` to OpenAI `strategic` at the $0.125 reservation, because three distinct concepts is judgment, not copying. The same ledger pressure noted in step 2 applies: forty briefs is the whole public pool. A personal key bypasses the ledger as today.

### UI

Two touches in the Do workspace (`app/do-workspace.tsx`):

1. A "Prepare campaign brief" control beside the existing run control. Before running it shows the gap list (required ones block, optional ones read "unknown"), the route, and the cost label from `executionCostLabel`.
2. Concept artifacts render each concept as a block with its flags and a "Promote to production brief" control. The Markdown download is unchanged.

### Tests

- `tests/skills.test.mjs` (new): required gaps block; optional gaps appear in the instruction as unknowns; instruction stays under the 28,000-character cap with a full library; `parse` flags duplicates, unresolved evidence, and wrong counts without dropping; `data` round-trips; two fixture endeavors in different businesses get instructions that carry corrections and exemplars and no conversation text (the fresh-brief check).
- `tests/execution-policy.test.mjs`: skill routing and reservation.
- `tests/work.test.mjs`: `promote_concept` idempotency and the asset title.
- `tests/business-api.mjs`: run against the demo path, promote a concept, assert the new artifact and the `skillId` on the run.

Out of scope: image or video generation, automatic landing pages (a landing-page prototype is a `product_improvement` endeavor and already routes to the Codex runner), and any second skill. The skill object exists so the next one is a file, not a refactor.

### Implementation notes (October 2026)

Built as `lib/skills.ts` with `tests/skills.test.mjs`, `app/campaign-brief-panel.tsx` in Do, ops `set_audience` and `promote_concept`, and a `skillId` on `run_work`. Differences from the outline above:

- The offer input is satisfied by a confirmed `offer` or `product` fact; when no confirmed fact has a category yet, any confirmed fact counts, so libraries from before step 5 are not blocked.
- The instruction lists the evidence the model may cite, as `fact:<id>` lines from the context pack plus shortlisted research URLs, so evidence can be checked. The UI shows a cited fact by its label.
- `executionPrompt` takes the skill's output format and correction scope, so `campaign_brief` corrections reach the run and `customer_language` corrections do not.
- Output with no concepts is rejected; everything else is kept and flagged. Over-length fields are cut to the limit and flagged.
- Owner versions never carry `data`, so promoting works from the latest assistant version only; after an owner rewrite the concepts are no longer actionable, which is the honest state.
- Demo businesses return fictional concepts, so the whole path runs without a provider. A live run has not been exercised yet; it needs an OpenAI key and spends up to $0.125 of the shared ledger per brief.
- `audience` is set through the brief panel (`set_audience`); `update_work` also accepts it.

## Step 5 — Knowledge library

Goal: the facts, language, approved examples, and corrections an owner has already judged reach every run, in a predictable order, with their age visible, and the owner can see what the agent will be told before it is told.

### Data model (`lib/engine.ts`)

```ts
export type FactCategory =
  | 'product' | 'positioning' | 'customer_language' | 'offer' | 'voice' | 'proof' | 'other';

export type Fact = Provenance & {
  // ...existing fields
  category?: FactCategory; // read-time default 'other'
};

export type WorkArtifact = {
  // ...existing fields
  /** Owner-marked approved example. Requires reviewedAt. */
  exemplar?: { why: string; markedAt: string };
};

export type Correction = {
  id: string;
  text: string;
  scope: 'all' | SkillId | 'customer_language';
  createdAt: string;
  /** Artifact whose edit prompted the correction, when there is one. */
  fromArtifactId?: string;
};

export type BusinessDocument = {
  // ...existing fields
  corrections?: Correction[];
};
```

Caps: 12 exemplars per business, 40 corrections of up to 300 characters. The `why` on an exemplar is 10–300 characters and required; the roadmap's point is the reason, not the sample.

### Ops

| Op | Behavior |
| --- | --- |
| `add_fact`, `update_fact` | accept optional `category` from the closed list |
| `mark_exemplar` | `endeavorId`, `artifactId`, `why`; rejects an unreviewed artifact |
| `unmark_exemplar` | clears it |
| `add_correction` | `text`, `scope`, optional `fromArtifactId`; validates scope against the known skill ids |
| `remove_correction` | by id |

### The context pack (`lib/knowledge.ts`, new, pure)

`contextPack(business, skillId?)` replaces the `slice(0, 12)` in `executionPrompt` and is also used by `buildAgentBrief` and the Explore prompts behind `explore_chat` and `run_ideation`, so the three places an owner's judgment reaches a model agree.

- Facts: confirmed or corrected only, by category budget: offer 3, product 4, positioning 2, voice 2, proof 2, customer_language 6, other 4. Within a category, newest `observedAt` first. Facts older than `STALE_FACT_DAYS` carry the verify marker.
- Exemplars: up to 3, newest `markedAt` first, each as title, why, and the first 1,200 characters of the active version.
- Corrections: scope `all` plus the requested skill scope, oldest first so the owner's earliest rules read as standing.
- The pack is capped at 12,000 characters so the 28,000-character prompt keeps room for the endeavor. Truncation drops `other` facts first, then exemplar bodies, and says what it dropped in a trailing line.

`buildAgentBrief` gets three new headings: "Customer language", "Approved examples", "Standing corrections". This closes the follow-up noted at the end of step 2.

### UI

- Facts list: category chips as a filter and on each row; a "stale" badge past 90 days.
- Context tab: an "Approved examples" list with the why, and a "Standing corrections" list with scope.
- After an owner saves a new version of an assistant artifact, the save confirmation offers "Save a standing correction" with a one-line field, scope defaulting to the skill that produced the artifact. The roadmap's "ask the agent to save the useful changes to the procedure" becomes the owner writing the one line; a model-proposed correction from the diff is a later, owner-triggered idea.
- A "What the agent will see" preview on the run control renders the pack as text. It is the cheapest way to make the library inspectable and it is where owners will notice a wrong fact.

### Tests

- `tests/knowledge.test.mjs` (new): category budgets and ordering; stale marker; 12,000-character cap and truncation order; corrections by scope; a business with 200 facts produces a pack that still includes customer language.
- `tests/work.test.mjs`: exemplar requires review; caps.
- `tests/business-api.mjs`: add a correction, run work, assert it appears in the recorded instruction.

## Step 6 — Run record and handover export

Goal: for any campaign, show what went in, what came out, what the owner changed, and what was learned, per run, without a model; export it as Markdown so a case study or a handover guide starts from facts.

Everything needed is already stored or derivable: `ExecutionRun` has the instruction, context revision, and artifact; `ArtifactVersion.source` separates assistant from owner versions; observations carry effort and next decision; step 3's memo lines carry decisions; step 5's corrections carry `fromArtifactId`.

### Derived record (`lib/run-record.ts`, new, pure)

```ts
export type RunRecordEntry = {
  runId: string;                 // ExecutionRun id, or runner-job:<id> from imported runner results
  route: 'in_app' | 'codex' | 'computer';
  skillId?: SkillId;
  startedAt: string;
  finishedAt?: string;
  status: 'succeeded' | 'failed' | 'running';
  instruction: string;
  contextRevision: number;
  artifactId?: string;
  artifactTitle?: string;
  assistantVersion?: number;
  /** Owner versions saved on that artifact after the run. */
  ownerVersionsAfter: number;
  /** Line-level diff count between the run's version and the latest owner version; null without an owner version. */
  changedLines: number | null;
  correctionsSaved: string[];
  error?: string;
};

export type RunRecord = {
  endeavorId: string;
  code: string;
  title: string;
  entries: RunRecordEntry[];
  observations: WorkObservation[];
  memoDecisions: { weekKey: string; verdict: MemoVerdict; note?: string }[];
  /** actualEffort strings as written. Not summed; they are free text. */
  effort: string[];
  unknowns: string[];
};

export function runRecord(business: BusinessDocument, endeavorId: string): RunRecord;
export function renderRunRecord(record: RunRecord): string;
export function renderCaseStudy(business: BusinessDocument): string;
export function campaignTableCsv(business: BusinessDocument): string;
```

`ExecutionRun` gains optional `route` and `skillId`, written by `run_work`. Runner imports are found through the `runner-job:<id>` source evidence on the artifact, so older records still appear.

`renderCaseStudy` follows the roadmap's day-90 shape: the process before Traction (the endeavor's source idea and description), the system (skills and playbooks used), the runs (one block per entry), the changes (owner versions and corrections), and the results (the campaign table row with its unknowns). It opens with "Prepared tests are labeled as prepared. Measured results come from the campaign table and carry its unknowns." `campaignTableCsv` is the roadmap's warehouse join: one row per campaign with the code as the key.

The roadmap compares preparation and review time against the old process. Traction can only list what the owner wrote in `actualEffort`. The record lists it; it does not total it or compare it, and the export says so.

### UI and export

- Do workspace: a "Run record" section on the endeavor, entries newest first, each with the diff count and the corrections it produced. No chart; the roadmap's "corrections needed per run" trend is a list the owner can read.
- Portfolio: "Export case study" per business and "Download campaign table (CSV)". Both are client-side like the Markdown artifact download, since the document is already in the browser and `lib/` is shared.

### Tests

- `tests/run-record.test.mjs` (new): entries from in-app runs and runner imports; diff count against a fixture; effort is listed and never summed; a failed run appears with its error; purity.
- `tests/business-api.mjs`: run, edit, add a correction with `fromArtifactId`, and assert the record shows one owner version and one correction.

### Implementation notes (October 2026)

Built as `lib/run-record.ts` with `tests/run-record.test.mjs`, a Run record section in Do (`app/run-record-panel.tsx`), and Portfolio buttons for the campaign table CSV and the case-study draft. Differences from the outline above:

- Entries come from assistant artifact versions as well as `ExecutionRun`s, because `generate_artifact` and runner imports never create a run. Each entry is an in-app run, a desktop runner result (`runner-job:<id>`), or a generated draft (`version:<id>`). The runner route is not split into Codex and computer use; the business document does not record which one ran.
- `ExecutionRun` was not extended. `route` is derived, and `skillId` arrives with step 4.
- Owner edits and corrections are attributed to the assistant output they followed, up to the next assistant output on the same artifact. The changed-line count is an LCS diff over the first 2,000 lines.
- The CSV leaves unknown cells empty, never 0, and prefixes text cells that a spreadsheet would execute as a formula with an apostrophe.

## Step 7 — Paired agent connection

Goal: the owner's own Claude Code or Codex can read a business's context, campaigns, table, memo, and kept customer language, and can return drafts, research candidates, observations, and classified signals, through the same ownership checks as the browser, with everything it writes landing unreviewed. This is the roadmap's MCP section turned around: for customer B, Traction is the server their agent connects to.

The existing runner is the push direction (Traction queues a job, the device runs it). This is the pull direction (the agent asks and answers). They share pairing and device identity and nothing else.

### Pairing and identity

- Reuse `runner_devices` and `runner_pair_codes` from migration 007. Migration 014 adds `purpose TEXT NOT NULL DEFAULT 'runner' CHECK(purpose IN ('runner','agent'))` to `runner_devices`. A pairing code is minted with a purpose; the Do panel's pairing control gets a second option, "Pair an agent."
- A runner device cannot call agent ops; an agent device cannot claim jobs. Revocation is the existing control and is checked on every call.
- `scripts/traction-agent.mjs` is a stdio MCP server that pairs with `--pair`, keeps the bearer with the existing Keychain module and the same `--remember` / `--resume` / `--forget` flags and the same documented argv limitation, and refuses non-https servers without `--allow-local-http`. It holds no AI credentials; the agent calling it has its own.

### Server (`app/api/agent/route.ts`, new)

Bearer-authenticated, one JSON op endpoint like `POST /api/runner`. Every op resolves the device's owner and loads only that owner's businesses; partner-shared businesses are never reachable, and raw evidence sources from step 2 are never served. Writes use the three-attempt reload-and-save loop. Body caps and the 150,000-character limit match the workspace route. Sixty calls per minute per device.

| Tool | Reads or writes | Notes |
| --- | --- | --- |
| `list_businesses` | read | id, name, url, priority |
| `get_context` | read | the step 5 pack as structured JSON plus goal, budget, markets |
| `list_endeavors` | read | code, title, kind, status, evidence bar, checklist |
| `get_endeavor` | read | active artifact versions, research, observations, run record |
| `get_campaign_table` | read | step 1 rows with unknowns |
| `get_latest_memo` | read | step 3 memo with lines and decisions |
| `list_customer_language` | read | kept phrases and themes only; never source ids or bodies |
| `list_playbooks` | read | static |
| `save_artifact` | write | unreviewed, `source: 'assistant'`, `sourceEvidence: ['agent:<deviceId>']` |
| `add_research_candidates` | write | the `add_research_candidate` validation: https, retrieval date, observed facts, uncertainties |
| `add_observation` | write | same validation as the op |
| `add_checklist_item`, `set_checklist_item` | write | same validation |
| `add_signals` | write | each row requires `source`, `campaign` code, and `campaignMetric`; confidence is forced to `medium`; provenance is `agent:<deviceId>:<source>` |

There is no tool that reviews, transitions, approves, sends, publishes, shares, or confirms a fact. An agent proposes facts by returning research candidates or an artifact; the owner confirms. The test suite asserts the route module never imports `sendGmail`, `runAI`, or `reviewArtifact`.

`add_signals` is the one write that touches numbers. It exists because the roadmap's "connect one data source" is, for customer B, a Python script that pulls spend from an ad platform. Without this tool the script ends in a CSV the owner uploads by hand. The campaign table shows the provenance string on hover, so the owner can see which rows came from which script.

### Owner visibility

- Business log line per write: "Agent <device name> saved artifact <title> (unreviewed)."
- Owner queue item when agent artifacts await review: "Review N artifacts from your paired agent," tab `do`.
- The Do panel lists paired agents beside paired runners with last-seen time and a revoke control, reusing the runner device list.

### Tests

- `tests/agent-api.mjs` (new, follows `tests/runner-import-api.mjs`): a runner-purpose bearer is rejected; a revoked device gets 401; a partner-shared business is not listed; `list_customer_language` returns no source ids; `save_artifact` lands unreviewed with the agent evidence string; `add_signals` without a campaign code is rejected; rate limit.
- `tests/runner-store.test.mjs`: purpose column and pairing with purpose.
- The static import assertion above.

Ship order inside the step: the read tools first. They are enough for Jack to run a Claude Code skill against the four businesses and are the cheapest proof that the pack from step 5 is what an agent needs. Writes follow once a read-only session has produced one useful artifact pasted back by hand.

Not in this step: a remote MCP endpoint with OAuth, claude.ai connectors, more than one owner per device, or any tool that spends from the shared ledger. The username-and-PIN identity caveat from the partner-access doc applies to agent bearers until identity is upgraded in M3.

## Deliberately not adopted from the roadmap

| Roadmap item | Decision | Honest handoff |
| --- | --- | --- |
| A live dashboard with charts | No. The campaign table and memo are the dashboard, with unknowns and staleness shown. Step 1 says why. | Portfolio table plus the CSV export from step 6 |
| Meta or Google Ads spend sync | Deferred to M3 with persistent OAuth, per the roadmap. | CSV with a campaign code (step 1), or `add_signals` from the owner's own script (step 7) |
| Clay and Apollo | No integration. Credits, data-use rules, and audience destination requirements belong to the owner's accounts. | Research candidates by hand or through `add_research_candidates`; purchased prospect data stays out of ad audiences, as the roadmap itself warns |
| Higgsfield and Runway | No media generation or storage; the document cap and the content MVP line in the roadmap both forbid it. | Step 4 concepts carry visual direction and production briefs; prompts, scripts, and shot lists are content artifacts the owner takes to the tool |
| Landing-page prototype | Already covered: a `product_improvement` endeavor routes to the Codex runner. | Nothing new |
| Hermes, Zapier | No. Step 3's tick is callable by any scheduler; that is the whole integration surface. | A host cron or GitHub Actions schedule, as step 3 documents |
| Memo delivery to email or chat | Deferred to M3 with persistent connections. | In-app memo and the owner queue |
| Handover to another marketer | The partner role is view-only. An operator role is the roadmap's deferred "team roles" item and should wait for an outside marketer to ask. | Step 6's exported run record and case study are the handover guide |
| SQL, Snowflake, BigQuery, Python | Not product scope. | Step 1's code is the join key; step 6 exports the rows; step 7 lets a script write signals back |

## Sequencing against the roadmap's three months

| Roadmap month | Its outcome | Traction steps | Why this order |
| --- | --- | --- | --- |
| Month 1 | A repeatable workflow with company context and skills | 1, 5, 2, 4 | Codes are cheap and foundational; the library improves every run before the first skill exists; customer language feeds the library; the brief skill is the first visibly new capability |
| Month 2 | Connected data and a reporting view | 3 with the amendments, step 7 read tools and `add_signals` | The memo needs campaigns with bars and evidence; the agent read path is how customer B starts using the library |
| Month 3 | Production, recurring runs, handover | 6, step 7 writes | The run record needs runs to record; agent writes need a review habit first |

Step 6 is pure and can be built any time after step 4 if a case study is wanted sooner. Steps 2 and 3 keep their own designs and tests; nothing here reopens them beyond the amendments above.

Traction's own four-run case study, the roadmap's "evidence-backed case-study draft after actual results," is produced by running steps 4 through 6 on the Traction business itself and exporting with `renderCaseStudy`. Publishing it still needs actual records and permission, as the roadmap says.

## Open questions for the owner

1. **Is customer B a customer or only the owner?** Step 7 is justified by dogfooding alone. Charging a marketing engineer for a hosted system of record is a different product bet than charging an owner for the whole loop. Recommendation: build step 7 for internal use, count what it produces as internal evidence, and decide after the five-owner pilot.
2. **Should the campaign brief run on OpenAI strategic?** It costs five routine calls per brief against a $5 pool. The alternative is DeepSeek by default with a per-run upgrade control. Recommendation: OpenAI, and let the ledger pressure keep forcing the per-account budgets M3 already lists.
3. **Should an agent be allowed to write signals at all?** It is the only agent write that changes a number the memo reads. Recommendation: yes, with the forced provenance string, because the alternative is a manual CSV of the same numbers with less provenance.
4. **Should a required gap block the run or only warn?** Blocking is the roadmap's "flag missing information" taken literally and it prevents the spend. Recommendation: block on the two required inputs, warn on the rest, and revisit if owners hit the block on their first campaign and leave.
