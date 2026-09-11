# Sprint 01 — Complete one experiment loop

Status: ready for implementation planning; all tickets below are unstarted.
Sequencing update: [INITIAL-SLICES.md](INITIAL-SLICES.md) is the current implementation order for Sol. The tickets here supply supporting acceptance criteria; they are not a separate parallel backlog.
Planning allowance: 7–10 engineering days plus owner review, approximately two weeks. Estimates require recalibration after T1.
Parent: [product roadmap](../ROADMAP.md).

## Outcome

An owner can accept the guided proposal, prepare useful work, track a real attempt, record observations, and review the next decision. All progress survives reload. Existing rounds remain available and no external action is implied by acceptance.

Owner scope update, September 11, 2026: this sprint is the foundation of **Do**, with **Explore** and a lightweight **Portfolio** view following in weeks 3–4. Use a shared endeavor representation supporting research, content, outreach, experiments, and product-improvement briefs. Preserve the existing guided experiment path as one supported kind.

Default first scenario: prepare a small marketing endeavor for one portfolio business, such as a creator outreach pitch or a content draft based on an owner-approved brief. Support source links, editable deliverables, a checklist, manual action tracking, and observations. The four-business walkthrough should also cover a research shortlist and a feedback-linked product-improvement ticket. These use shared fields and lightweight templates; dedicated research automation and extra publishing integrations are later scope.

## Ticket order

| ID | Priority | Work | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| T1 | P0 | Canonical experiment identity and acceptance bridge | None | 1–2 days |
| T2 | P0 | Active experiment detail and lifecycle | T1 | 1–2 days |
| T3 | P0 | Preparation pack and editable artifact | T1, T2 | 1–2 days |
| T4 | P0 | Observations and evidence linked to experiment | T1, T2 | 1 day |
| T5 | P0 | Review and next-decision continuity | T4 | 1 day |
| T6 | P1 | Today inbox from actual progress | T2–T5 | 0.5–1 day |
| T7 | P0 | End-to-end validation and owner walkthrough | T1–T6 | 1 day |

Estimates overlap; scope must fit the sprint allowance. If T1 exposes significant migration complexity, defer visual refinements and preparation variants before cutting state integrity or result continuity.

### T1 — Canonical experiment identity and acceptance bridge

Entry points: `lib/engine.ts`, `app/api/workspace/route.ts`, guided release tests.

- Decide and document whether guided acceptance links to a compatible existing experiment representation or introduces a canonical record with a legacy adapter.
- Include an endeavor kind and completion criteria. Experiments retain hypotheses and success/stopping rules; content and research work can complete with reviewed artifacts without fabricated numeric targets. Allow a future Explore idea/version to link into the same lifecycle.
- Preserve proposal ID, brief version, rationale, audience, measurement plan, success/stopping rules, time/cost, and owner contribution without translating a textual success rule into an invented numeric target.
- Acceptance creates or references exactly one preparing experiment. Repeated acceptance is idempotent.
- Preserve old rounds and original records; avoid silently making multiple active experiments when old work already exists. Present existing work and let the owner select or stop it explicitly.
- Version changes preserve history and expose which preparation is stale; changed context must not silently rewrite approved artifacts.

Acceptance: double acceptance/retry yields one linked experiment; reload resolves the same ID; older businesses load; stale brief conflicts are handled without lost work.

### T2 — Active experiment detail and lifecycle

Entry points: `app/guided-workspace.tsx`, `app/workspace.tsx`, engine and workspace actions.

- Replace the accepted dead end with an active experiment view.
- Show what is ready, what remains, who owns each action, the observation window, and the next step.
- Provide prepare, start manual work, record observation, mark blocked with reason, resume, stop, and review paths.
- Explicitly label manual actions and owner-reported completion. Preserve unknown or inconclusive results.
- Show a supported preparation/manual action instead of an enabled "Do this for me" control for unavailable automation.

Acceptance: all transitions persist, invalid transitions are rejected, owner can resume unfinished work, and manual status never implies verified external execution.

### T3 — Preparation pack and editable artifact

Entry points: engine types, workspace actions, `lib/ai.ts`, guided UI.

- Prepare audience criteria, a short editable checklist, owner dependencies, and one immediately usable artifact appropriate to the experiment.
- Start with editable text templates for content, creator outreach, a sourced research shortlist, and a product-improvement brief. Choose by endeavor kind; provide a structured manual artifact for unsupported work. Research entries require owner-provided or actually retrieved sources, not fabricated references.
- Use confirmed facts and the accepted experiment snapshot. Preserve unknown facts as explicit fields to complete.
- Owner edits survive reload and regeneration. Save a new draft version rather than overwriting reviewed work.
- Include copy/download controls and clear status: draft, reviewed, or needs revision. Record the artifact version used in the experiment.
- Keep preparation separate from permission to transmit. Existing Gmail sending retains its recipient/content approval requirements.
- AI failure or exhausted budget leaves prior work intact and a usable manual template available.

Acceptance: an owner can use the artifact without reconstructing the plan; no unsupported product claims or invented contacts are treated as facts; failure does not destroy edits.

### T4 — Observations and evidence

Entry points: engine, workspace actions, results UI.

- Attach optional contacts/drafts and observed results to the experiment ID.
- Support counts for the same cohort, dates, evidence text/URLs, qualitative notes, and source (owner report or provider receipt). Treat an omitted value differently from zero.
- Validate nonnegative counts and meaningful denominators; prevent impossible funnel ordering where that ordering is part of the chosen measurement model.
- Preserve correction history. Use evidence URLs and text first; large file uploads can follow in M2.
- Capture actual owner time and external spend when known; separate these from Traction compute cost.

Acceptance: incomplete observations can be saved; missing values stay unknown; the owner can record an inconclusive result without fabricating a number; evidence remains connected after a brief update.

### T5 — Review and next decision

Entry points: `weeklyReview`, guided proposal context, review UI.

- Include the canonical guided experiment in review summaries and future planning without double-counting linked legacy entries.
- Show planned action, observed execution, business observations, missing evidence, and owner effort.
- Let the owner choose repeat, change, stop, or gather more evidence and save the rationale.
- Preserve a result summary that Explore can use later: what was produced, observed, learned, and remains uncertain. A completed content draft or development ticket does not imply publication or a shipped product change.
- A next proposal references the prior experiment and relevant learning without changing historical evidence.
- Keep provider receipts separate from customer value; a send receipt cannot become a qualified conversation.

Acceptance: a completed guided experiment appears once in the review; an inconclusive experiment remains inconclusive; the next proposal can use its saved observations.

### T6 — Today inbox

Entry points: `lib/owner-queue.ts`, `app/workspace.tsx`.

- Prioritize the active experiment's real next step over general navigation prompts.
- Show preparation needed, owner input, observations due, blocked work, and review-ready work.
- Remove completed prompts through state changes; do not imply scheduled activity before a scheduler exists.
- Show due dates and evidence freshness. Link directly to the relevant item.

Acceptance: a new owner always has one clear primary next action; finishing it changes the queue appropriately; older workflows remain accessible.

### T7 — Validation and owner walkthrough

- Cover meaningful invariants: idempotent acceptance, stale brief handling, account/business isolation, invalid transitions, artifact preservation, unknown versus zero, review deduplication, and old-record compatibility.
- Run application type checking, focused lint, relevant unit/integration tests, and production build as supported by the local environment. Record checks requiring unavailable credentials instead of claiming a pass.
- Walk through on desktop and a narrow mobile viewport; reload during preparation and observation entry.
- Demonstrate with a fictional business first, then an owner-approved real business without sending or publishing anything as part of the demonstration.
- Record actual elapsed engineering time and unresolved friction to recalibrate the next sprint.

## Release demonstration

1. Confirm a business brief and accept one experiment.
2. Open the same experiment after reload.
3. Prepare and edit a usable artifact; confirm edits survive reload.
4. Mark manual work started and record a realistic observation with a source.
5. Record an unknown result and confirm it is not displayed as zero or a miss.
6. Review the experiment and save a next decision.
7. Confirm the review counts the experiment once and future planning can use its learning.
8. Confirm an old business and its rounds remain usable.

Release criterion: all eight steps work without direct database edits; required checks pass or an explicit release-blocking dependency is recorded.

## Deferred from this sprint

Persistent OAuth, unattended sending, background sync, browser infrastructure, paid subscriptions, broad CRM functionality, team roles, and a full visual redesign. They remain in the roadmap, after the complete experiment loop.

## Sprint log

| Ticket | Status | Implementation/evidence | Follow-up |
| --- | --- | --- | --- |
| T1–T7 | Unstarted | Roadmap and acceptance criteria prepared | Begin T1 |
