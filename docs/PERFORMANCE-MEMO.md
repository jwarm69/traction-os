# Performance memo design (step 3 of the marketing-engineer adaptation)

Status: design for implementation. Nothing below is built. Depends on [CAMPAIGN-ID.md](CAMPAIGN-ID.md) for `campaignTable`, `Endeavor.code`, and the `campaignMetric` signal vocabulary. [CUSTOMER-LANGUAGE.md](CUSTOMER-LANGUAGE.md) is independent.

Source of the idea: Greg Isenberg's "marketing engineers" thread, Step 5 and Step 8. "The performance agent reads your campaign table every Monday and writes you a short memo, the way a sharp analyst would. Every line ends in a decision for you: keep, kill, change or test." And on the evidence bar: "Decide your evidence bar before you launch: how much spend, how many days, and what counts as a win. Skip that step and 200 ads just gives you 200 inconclusive experiments."

## Goal

Every week, without the owner asking, each business gets a short memo with one line per active campaign. Each line shows what happened this period, what has happened in total, where the campaign stands against the evidence bar the owner set before launch, and a proposed verdict. The owner reads it, records a decision per line, and the decision changes the work. The memo is the Monday half of Greg's weekly loop.

## Three decisions that shape everything

### 1. The scheduled memo is deterministic and spends nothing

The roadmap says per-run and per-account budgets must exist before automation, and they do not exist yet. The shared beta ledger is one $5 pool. An unattended job that calls a model for every business every Monday would drain a shared pool on nobody's authority.

So the memo is computed, not generated. The campaign table already yields spend, contacts, conversations, deals, revenue, and churn per campaign. The verdict rules below are arithmetic against the evidence bar. `weeklyReview` in `lib/engine.ts` is the precedent: it is pure, deterministic, and produces decisions from stored state. The memo is its campaign-level successor.

An AI narration of the memo exists, but it is owner-triggered, on the DeepSeek routine route, and it may not change a verdict. Numbers and verdicts come from code. Prose comes from the model, on request.

### 2. The scheduler is a secret-protected tick endpoint, not a platform feature

The repository does not declare a deployment platform. There is no `vercel.json`, no workflow file, no cron configuration anywhere. Betting the memo on Vercel Cron or any specific host would couple the product to an unrecorded assumption.

Instead: one route, `POST /api/jobs/tick`, authenticated by a `JOB_SECRET` bearer token added to `lib/runtime.ts`. Anything that can make an HTTPS request on a schedule can drive it: a host's cron feature, a GitHub Actions schedule, an external cron service, or the paired local runner. The route is idempotent and lease-protected so two overlapping callers cannot produce two memos for the same week.

Lazy fallback: when an owner loads a business whose memo is due and no tick has produced it, `loadOwned` in `app/api/workspace/route.ts` generates it on the spot, the way `ensureCampaignCodes` backfills codes. The owner always sees a current memo. The tick only makes it exist before they log in.

### 3. There are five verdicts, not four

Greg's four are keep, kill, change, test. Traction's product rules say unknown stays unknown and a result below the evidence bar is not a result. So the fifth verdict is **wait**, with the bar's progress shown. Every campaign without an evidence bar gets wait, with the reason "no evidence bar set", until the owner sets one. This is the mechanism that enforces Greg's "decide your evidence bar before you launch" rule rather than merely recommending it.

## Data model

### Evidence bar on the endeavor (`lib/engine.ts`)

```ts
export type EvidenceBar = {
  /** The metric that counts as a win. 'conversations' comes from the pipeline; the rest are classified signals. */
  successMetric: CampaignMetric | 'conversations';
  successTarget: number;
  /** Stop conditions. At least one is required. The bar is exhausted when any is reached. */
  maxSpend?: number;
  maxDays?: number;
  maxContacts?: number;
  /** When the clock for maxDays starts. Defaults to the endeavor's transition to in_progress. */
  startedAt?: string;
  setAt: string;
};

export type Endeavor = {
  // ...existing fields, plus code from step 1
  evidenceBar?: EvidenceBar;
};
```

`setEvidenceBar(business, endeavorId, bar)` in `lib/work.ts` validates: target is a positive number, at least one stop condition, and the endeavor is not completed or stopped. Changing the bar after work has started is allowed but logged: "Evidence bar changed for AG003 after 4 days of activity." The memo shows that log line, because moving the goalposts is exactly the thing an analyst would mention.

The existing free-text `completionCriteria` stays. The bar does not replace it; the bar is the subset that can be computed.

Seeding from a guided proposal: `prepareGuidedProposal` in `lib/work.ts` already turns `successRule`, `stoppingRule`, `cost`, and `timeWindow` into free text on the endeavor. It should also attempt a bar from them: parse a leading number and a known metric word from `successRule` into `successMetric` and `successTarget`, a currency amount from `cost` into `maxSpend`, and a day or week count from `timeWindow` into `maxDays`. Store the result as a proposed bar with `setAt` empty. The memo treats a bar without `setAt` as absent (verdict `wait`, reason "Confirm the proposed evidence bar"), and the Do workspace shows the proposal pre-filled for one-click confirmation. Parsing failures leave the field empty and never guess. This is what makes the marketing test kind the one path that runs end to end without the owner re-typing numbers the proposal already contained.

### Memo (`lib/engine.ts`)

```ts
export type MemoVerdict = 'keep' | 'kill' | 'change' | 'test' | 'wait';

export type MemoLine = {
  endeavorId: string;
  code: string;
  title: string;
  status: EndeavorStatus;
  /** Campaign table row for this period only (signals and stage events with observedAt in range). */
  period: CampaignRow;
  /** Campaign table row since the endeavor began. */
  cumulative: CampaignRow;
  bar?: {
    successValue: number | null;
    successTarget: number;
    exhausted: boolean;
    /** Human-readable, e.g. "spend 1,400 of 2,000; day 9 of 14". */
    progress: string;
  };
  proposedVerdict: MemoVerdict;
  /** One sentence. Must name the numbers it relies on. */
  reason: string;
  /** Things the line cannot say and why, in the voice of the campaign table's unknowns. */
  caveats: string[];
  /** Owner's recorded decision. Absent until they decide. */
  decision?: {
    verdict: MemoVerdict;
    note?: string;
    decidedAt: string;
  };
};

export type PerformanceMemo = {
  id: string;
  /** ISO week key, e.g. "2026-W41". One memo per business per key. */
  weekKey: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  generatedBy: 'schedule' | 'owner' | 'lazy';
  /** Two or three sentences computed from the lines. */
  summary: string;
  lines: MemoLine[];
  /** Campaigns excluded and why: stopped, completed, or no evidence at all. */
  excluded: { code: string; reason: string }[];
  /** Owner-triggered AI prose. Never changes lines. */
  narrative?: { text: string; provider: 'deepseek' | 'openai'; createdAt: string };
  readAt?: string;
};

export type BusinessDocument = {
  // ...existing fields
  memos?: PerformanceMemo[];
};
```

Cap memos at 26 per business (half a year). Drop the oldest beyond that; the review history in `reviews` already follows the same unbounded-growth pattern and should get the same cap in passing.

### Schedule registry: new table, migration `013_memo_schedules.sql`

The tick must find due businesses across every owner without parsing every business document. That needs a table.

```sql
-- One row per business that wants a scheduled performance memo. Owner-only.
CREATE TABLE IF NOT EXISTS memo_schedules (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  weekday INTEGER NOT NULL DEFAULT 1 CHECK(weekday BETWEEN 0 AND 6),
  hour_utc INTEGER NOT NULL DEFAULT 7 CHECK(hour_utc BETWEEN 0 AND 23),
  next_due_at TEXT NOT NULL,
  last_generated_week TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, business_id)
);
CREATE INDEX IF NOT EXISTS memo_schedules_due ON memo_schedules(enabled, next_due_at);
```

Default is Monday 07:00 UTC. The UI lets the owner pick weekday and hour; store UTC and show local. No timezone column in this slice; the owner picks the UTC hour that matches their Monday morning and the UI shows the conversion.

`lib/memo-store.ts` follows `lib/runner-store.ts`: `upsertSchedule`, `listDue(now, limit)`, `claimDue(ownerId, businessId, leaseMs)`, `markGenerated(weekKey, nextDueAt)`, `releaseLease`. Claiming uses a conditional update on `lease_until`, the same pattern `claimJob` uses on `runner_jobs`.

## Memo generation (`lib/memo.ts`, new, pure)

`generateMemo(business, { periodStart, periodEnd, generatedBy })` returns a `PerformanceMemo` and pushes it. It has no I/O and no AI, so it tests like `weeklyReview`.

Steps:

1. **Select lines.** Endeavors with status `in_progress`, `ready`, or `blocked`, plus any endeavor that reached `completed` or `stopped` inside the period (so the owner sees its final numbers once). Everything else goes to `excluded` with a reason.
2. **Compute rows.** Call `campaignRow` twice per endeavor: once with the period window, once cumulative. This needs `campaignRow` from step 1 to accept an optional `{ since, until }` filter on signal `observedAt` and pipeline stage event timestamps. Add it there.
3. **Evaluate the bar.** If absent, `proposedVerdict` is `wait`, reason "No evidence bar is set, so this campaign cannot be judged. Set spend, days, or contacts and a win target." Otherwise compute `successValue` from the cumulative row and `exhausted` from the stop conditions.
4. **Propose a verdict** with the rules below.
5. **Write the reason** from a template that interpolates the actual numbers. No adjectives. "Spent 1,400 of 2,000; 3 conversations against a target of 5; day 9 of 14."
6. **Carry caveats** from the campaign row's `unknowns`, plus memo-level ones: "Spend was entered by owner, not synced." "Revenue here is signal-classified; no deals are recorded in the pipeline." "The evidence bar was changed on <date>."
7. **Summarize.** Count by proposed verdict, name the single campaign with the lowest cost per conversation if two or more have one, and state how many lines are waiting on the bar.

### Verdict rules

Applied in order; the first match wins.

| Condition | Verdict | Reason template |
| --- | --- | --- |
| No evidence bar | wait | No evidence bar is set. |
| Endeavor is `blocked` | change | Blocked since <date>: <blockedReason>. Unblock, change the approach, or stop it. |
| Endeavor is `ready` with no evidence yet | test | Prepared and not started. Start it or park it. |
| Success value is null (metric never recorded) and bar not exhausted | wait | <metric> has not been recorded yet; <progress>. |
| Success value ≥ target | keep | Met the bar: <value> <metric> against <target>; <progress>. Repeat with one variable changed. |
| Bar exhausted, value < target, value ≥ half the target | change | Reached the limit at <value> of <target> <metric>. Close enough to change one thing, not to repeat as is. |
| Bar exhausted, value < half the target | kill | Reached the limit at <value> of <target> <metric>. Stop or restart with a new hypothesis. |
| Latest owner observation verdict is `adjust` inside the period | change | Owner flagged an adjustment on <date>: <summary>. |
| Otherwise | wait | <progress>. Not enough evidence to decide. |

"Half the target" is a plain threshold, not a statistic. The memo says so in its standing footer: "Verdicts are proposals from fixed rules against the evidence bar you set. They are not significance tests and they do not attribute outcomes to campaigns."

## Owner decisions

`decide_memo_line` op: `memoId`, `endeavorId`, `verdict`, `note?`. Records the decision on the line and applies the smallest honest side effect:

| Decision | Side effect |
| --- | --- |
| keep | None. Log "Kept AG003 after memo 2026-W41." |
| kill | Transition the endeavor to `stopped` through `transitionEndeavor` so existing guards apply. Requires `note`. |
| change | Add a checklist item "Change after memo 2026-W41: <note>" via `addChecklistItem`. Requires `note`. |
| test | If the endeavor is `ready`, transition to `in_progress` and set `evidenceBar.startedAt`. Otherwise log only. |
| wait | None. Log only. |

A decision never creates a new endeavor or idea. Greg's "test" sometimes means "spin up a new test from this learning"; in Traction that is an Explore action the owner takes with context, not a side effect of a memo click.

The owner queue (`lib/owner-queue.ts`) gets one new item when the latest memo has lines without decisions: "Decide N campaign lines from this week's memo", tab `portfolio`. It sits after `calibrate` and before `delivery` in priority, because deciding what to keep spending on outranks reconciling a single send.

## The tick (`app/api/jobs/tick/route.ts`, new)

```
POST /api/jobs/tick
Authorization: Bearer <JOB_SECRET>
```

- Reject with 401 when `JOB_SECRET` is unset or does not match. Constant-time comparison. No session cookie path; this route never acts as a user.
- `listDue(now, 50)`, then for each: `claimDue` with a 2-minute lease; skip on failure. Load the business with `loadBusiness` by the schedule's owner id. If the memo for this `weekKey` already exists, `markGenerated` and move on. Otherwise `generateMemo` with `generatedBy: 'schedule'`, save with `saveBusiness` under the row's revision, and on a revision conflict release the lease and leave it for the next tick. Then `markGenerated` with the next due time.
- Return `{ due, generated, skipped, conflicts }`. Log one line per business to the business log: "Weekly memo generated on schedule."
- `maxDuration` 60. Fifty businesses of pure computation fit easily; if the pool ever grows past that, the limit in `listDue` paces it across ticks.
- Never calls a model. Never sends anything. There is nothing in this route that can spend money or contact a person, and the test suite should assert that `runAI` is not imported by it.

The `weekKey` guard is the idempotency key. A tick that fires twice, a tick that overlaps a lazy generation, and a host that retries on timeout all converge on one memo per business per week.

### Setup

`JOB_SECRET` joins `Runtime` and the README's environment list. The README gets a short "Scheduled memos" section: generate a long random secret, store it with the host, and point a weekly HTTPS job at the route. Give one example each for a host cron and for a GitHub Actions `schedule` with the secret in a repository secret. Say plainly that without a caller the memo still appears on next login, one week late at most.

## Narration (owner-triggered)

`narrate_memo` op: `memoId`, optional `key`. Routes through `runAI` with `workload: 'routine'`, reservation $0.025, and this prompt shape:

Input is the memo JSON with lines, verdicts, reasons, and caveats. Instruction: write the memo the way a sharp analyst would, in under 250 words, keeping every number and every proposed verdict exactly as given, ending each campaign's paragraph with its verdict, and ending the memo with the one decision the owner should make first. Do not add numbers, comparisons, or causes that are not in the input. Return `{"narrative": "..."}`.

`parseNarration` checks that every code in the memo appears in the text and that no verdict word appears next to a code with a different verdict than the line holds. Reject on mismatch with "The narration disagreed with the computed memo and was not saved." This is the same posture as the verbatim check in step 2: the model renders, the code decides.

The execution plan for narration is `planEvidenceRun(1, false)` from step 2, so the cost label and route display are reused.

## Portfolio view

The Portfolio workspace (`app/portfolio-workspace.tsx`) shows, per business, the latest memo's summary and its undecided line count, and opens the memo inline. Memo lines render as a list, not a table: code, title, the reason sentence, the progress string, the caveats collapsed, and five verdict buttons with the proposed one preselected. A kill or change button opens a one-line note field before it commits.

Across businesses, the Portfolio header shows the total of undecided lines and the next scheduled memo time for each business. That header is the "Monday" of Greg's loop for a multi-business owner.

Use the existing Reviews tab for nothing new. The weekly review and the memo answer different questions: the review is about experiments and outreach state, the memo is about campaigns against their bars. The roadmap's "one consistent experiment identity" note still stands; the memo includes legacy round experiments only once they carry the optional `endeavorId` from step 1.

## Tests

- `tests/memo.test.mjs` (new): each verdict rule in isolation with a fixture business; the week key and period computation around year boundaries; `generateMemo` is pure (deep-equal input before and after, apart from the pushed memo and log); summary wording for zero, one, and several lines; cap at 26.
- `tests/memo-store.test.mjs` (new, follows `tests/runner-store.test.mjs`): due listing, lease claim is exclusive under concurrent calls, `markGenerated` advances `next_due_at` by exactly one week from the scheduled slot, not from the run time.
- `tests/jobs-tick-api.mjs` (new, follows `tests/runner-import-api.mjs`): 401 without the secret, one memo per week under two consecutive calls, a lazy-generated memo is not duplicated by a later tick, and a static assertion that the route module does not import `lib/ai.ts`.
- `tests/work.test.mjs`: `setEvidenceBar` validation and the goalpost log line.
- `tests/owner-queue.test.mjs`: the undecided-lines item appears and disappears.
- `tests/business-api.mjs`: set a bar, add classified signals, generate on demand, decide a kill, assert the endeavor is stopped and the memo line holds the decision.
- `tests/ai.test.mjs`: narration parse rejects a verdict mismatch.

Run the README checks before claiming done: `npx tsc --noEmit`, `npx oxlint app lib db tests scripts`, `node --test tests/*.test.mjs`, `npm run build`. Migration 013 must be applied to `traction-dev` before the integration tests.

## Out of scope, deliberately

- Email or push delivery of the memo. Gmail sending still uses session-only tokens; persistent OAuth is M3. Delivery is in-app until then.
- Scheduled customer-language runs or any scheduled AI call. The tick stays spend-free until per-account budgets exist.
- Statistical tests. The thresholds are plain and the footer says so.
- Cross-business comparison in the memo. The roadmap forbids treating one business's results as proof for another.
- Automatic actions from a verdict beyond the single state transition listed. Pausing ads, changing budgets, or sending anything remains an owner action through the existing approval boundary.

## Open questions for the owner

1. **Half the target as the change-versus-kill line.** It is arbitrary and it is visible. The alternative is letting the owner set a "worth adjusting above" number in the bar. Recommendation: ship the fixed rule, watch two or three real memos, and add the field only if the rule misfires on a real campaign.
2. **Should a kill decision require a note?** It slows the click, and the memo's reason already says why. But the note is what the next Explore session reads, and Greg's `decisions/failed-campaigns.md` is exactly this. Recommendation: require it. One line that saves a repeated mistake is the point of the whole loop.
3. **Who runs the tick for the public beta?** The owner's own account is the only one that will have campaigns for a while. A GitHub Actions schedule in this repository is the zero-infrastructure option and keeps the secret in repository settings. Recommendation: that, until a host is chosen for M3.
