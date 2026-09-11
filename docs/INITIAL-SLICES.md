# Initial implementation slices for Sol

Status: S1 through S6 implemented locally and API-validated. Updated September 11, 2026.

This is the current execution order for the initial build. It refines [Sprint 01](SPRINT-01.md) and the [roadmap](../ROADMAP.md) around the owner's Explore / Do / Portfolio direction. Where sequencing differs, use this document. Sprint 01 remains a source of detailed lifecycle and verification requirements, not a second competing backlog.

## Product contract

Help the owner choose and carry out marketing endeavors across AlignIQ Golf, Astro-Log, Tonight, and Traction. Support channel and creator research, content, outreach, campaigns, and product-improvement briefs. Preserve broad ideation before committing to work. Experiments are one kind of endeavor; not every task requires a hypothesis or numeric target.

- Explore: discuss possibilities, capture corrections, research, compare, select, and park ideas.
- Do: produce editable deliverables, perform supported actions with authorization, record progress and evidence, and decide what follows.
- Portfolio: decide where limited owner attention goes across businesses.

Every slice must have a visible owner workflow and persisted state. Use the current design language, existing authentication and business ownership checks, and optimistic concurrency. Each slice ends with a working demonstration and recorded validation before starting another. Do not leave schema-only scaffolding as a completed slice.

## Ordered slices

| Slice | Owner-visible result | Dependency | Approximate engineering effort |
| --- | --- | --- | --- |
| S1 | Save and organize real marketing ideas in Explore | None | 1–2 days |
| S2 | Develop those ideas with AI that remembers the discussion | S1 | 2–3 days |
| S3 | Select an idea and prepare it in Do | S1; S2 adds AI context | 2–3 days |
| S4 | Produce and revise useful content, outreach, and product briefs | S3 | 2–3 days |
| S5 | Research channels and creators with inspectable sources | S2, S4 | 2–3 days |
| S6 | Review outcomes and prioritize across the portfolio | S3, S4 | 2–3 days |

Allow another 2–4 days for integration and owner walkthroughs. These are provisional estimates for one experienced engineer using AI assistance, not guarantees. Ship each slice independently; adjust breadth after observing actual implementation effort. If time tightens, defer S5's dedicated research operation and keep manual source capture, rather than compromising persistence or ownership checks.

## S1 — An Explore workspace that keeps ideas

Owner story: “For Astro-Log, save a creator-collaboration idea and a content-series idea. Park one, edit the other, and find them when I return.”

Implement:

- Add an Explore entry to the business workspace, with a usable idea list, empty state, and detail editor. Keep existing tools and guided work accessible.
- Persist ideas scoped to their business: stable ID, title, kind, description, intended audience/outcome, owner notes, source links, status, and timestamps. Kinds initially: research, content, outreach, campaign, experiment, product improvement.
- Support create, edit, park with reason, and restore. No irreversible deletion is needed for this slice. Selection into Do arrives in S3.
- Allow ideation with incomplete business context. Display missing context instead of requiring the five-field experiment wizard for every idea.
- Add optional backwards-compatible fields to business documents. Use existing revision checks and authenticated ownership; absent collections must load as empty without mutating records during reads.
- Extract small focused UI/domain modules instead of putting every new concern into the already large workspace component and route.

Out of scope: AI conversation, web research, portfolio aggregation, a complete navigation redesign, execution workers, OAuth changes.

Done when: create/edit/park/restore survive reload and business switching; one account cannot access another account's ideas; conflicting saves return a recoverable error and retain the user's unsaved text; older businesses and guided workflows remain usable. Check the actual UI at desktop and narrow widths.

Likely entry points: `lib/engine.ts`, `app/api/workspace/route.ts`, `app/workspace.tsx`; new focused idea helpers and Explore component as needed. Do not edit owner seed scripts or run them to demonstrate the feature.

## S2 — Human/AI ideation with durable context

Owner story: “Help me compare creator collaborations with a content series. Remember that I have no ad budget, and save the direction I choose.”

Implement:

- Add a business-linked discussion and optional idea-linked discussion with persisted user and assistant messages.
- Give the model bounded business context, owner corrections, relevant ideas, and recent discussion. Distinguish confirmed facts, proposals, and unknowns.
- Provide a useful conversational response, alternatives, and focused questions. Do not make every response a formal experiment proposal.
- Let the owner explicitly save a suggested idea or apply a proposed revision. Conversation text must not silently overwrite confirmed business facts or selected work.
- Preserve exact owner messages alongside any summaries. Bound history and document size; make older discussion accessible and fail gracefully before the existing storage limit.
- Reuse the capped AI request/accounting path. Handle timeout, budget exhaustion, malformed output, and stale revisions without losing owner text or writing into a newly selected business.

Done when: a correction remains available after reload; an AI suggestion can become an editable idea; switching businesses during a request cannot cross-write data; failures leave existing discussion and drafts intact. Model output is labeled as a suggestion, not researched evidence.

Before changing AI request contracts, inspect `lib/ai.ts` and `lib/ai-budget.ts`; preserve existing callers and reservation behavior. Consult current official API documentation for actual API changes.

## S3 — Select an idea and open it in Do

Owner story: “Let's pursue this creator collaboration. Give it a work brief and show me what needs doing.”

Implement:

- Introduce the minimal canonical endeavor record and an explicit Explore → Do handoff. Freeze the selected idea version, context used, owner decisions, intended deliverables, effort/budget notes, and completion criteria.
- Make selection idempotent. Repeating a request opens the same work item; deliberately creating another version is an explicit action.
- Show a Do list and detail with preparing, ready, in progress, blocked, completed, and stopped states; define valid transitions and resumption behavior. Keep experiment-specific observation/review state where needed.
- Bridge accepted guided experiments into this representation with their original rules intact. Do not duplicate or rewrite legacy rounds. Older accepted proposals get an explicit prepare/open path.
- Keep task completion separate from business outcome: completed research can mean a reviewed shortlist; completed content can mean an approved draft. Manual progress is owner-reported.
- Edits to Explore or the business brief leave selected work unchanged and display when its source context has changed.

Done when: selection, reload, editing the original idea, duplicate submission, and returning from a blocked item all behave predictably. An old accepted guided proposal can open preparation, preserving its identity/history. Existing results are not counted twice.

This slice implements the core intent of Sprint 01 T1/T2; use their integrity requirements without forcing non-experiment work into numeric result fields.

## S4 — Preparation that produces usable work

Owner story: “Draft the Astro-Log creator pitch, three content scripts, or a Traction improvement brief. Let me edit and copy the result.”

Implement:

- Support lightweight text artifacts for creator/outreach pitches, content copy/scripts, sourced research notes, and product-improvement briefs with acceptance criteria. Use one versioned artifact system with small templates.
- Persist draft versions and owner edits; regeneration creates a new version. Support preview, edit, review, copy, and text/Markdown download.
- Attach an editable checklist, owner dependencies, artifact version, and next action to the endeavor. Use existing facts and sources; do not invent creator contacts, partnerships, product availability, performance claims, or results.
- Keep manual preparation available when AI is disabled. Show unsupported delivery actions honestly.
- Where practical, link an outreach artifact to the existing recipient/draft workflow; existing exact-content Gmail approval remains necessary. Otherwise use a clear manual handoff without a pretend send button.

Done when: all four artifact templates produce editable, persistent work; regeneration preserves reviewed content; an exhausted budget leaves a usable manual workflow; artifact completion cannot imply sent, published, or deployed work.

## S5 — Evidence-backed channel and creator research

Owner story: “Research creators or channels for this idea. Show why each might fit and what we actually know.”

Implement:

- Add an explicit bounded research action tied to an idea or endeavor, using the existing search capability and budget accounting.
- Save candidates with source URLs, retrieval dates, fit rationale, observed facts, uncertainties, and owner review state. Use a small result batch initially.
- Preserve source-supported statements separately from AI interpretation. Do not present model-generated URLs alone as proof that a claim was verified; retain available provider citation evidence and make supporting material inspectable.
- Allow shortlist, reject with reason, and export/copy to a preparation artifact. Capture contact routes only when supported by a source; unknown follower counts, audience statistics, fees, and availability remain unknown.
- Keep manually added sources useful if a site is inaccessible. Blocked research must not silently become a fabricated result.

Done when: research results remain attached to the correct idea after reload; duplicates are handled; unknown data is visibly unknown; each factual candidate claim has supporting evidence or is flagged for verification; no contacting or publishing occurs during research.

## S6 — Learn from the work and choose portfolio priorities

Owner story: “What did we accomplish, what needs me, and where should I spend my next few hours?”

Implement:

- Attach observations, evidence URLs, dates, source, actual effort, and next decisions to endeavors. Missing counts remain unknown, and qualitative or inconclusive outcomes are valid.
- Return a concise evidence-linked result summary to the originating Explore idea/discussion. Let the owner repeat, revise, park, or stop a direction.
- Update reviews to include new work and legacy experiments without double-counting. Distinguish deliverables from external actions and business outcomes.
- Add a lightweight account-scoped Portfolio list: business, current priority, selected endeavors, owner effort commitment, blockers, and latest observation. Owners choose priorities; AI suggestions need rationale and do not autonomously reallocate budgets.
- Fetch minimal summaries through authorized server reads; do not load all business documents into one model request or the browser merely to show the portfolio.

Done when: a result informs the next discussion, zero differs from unknown, an artifact is not reported as a customer acquisition, and cross-business priorities persist without exposing another account's data.

## Shared delivery and verification rules

- Check repo instructions and current git state first. Preserve uncommitted roadmap work and unrelated edits. No reseeding or overwriting live businesses.
- Implement one numbered slice at a time with narrow, reviewable changes. Do not install browser infrastructure or implement the whole roadmap while delivering S1.
- Cover meaningful persistence, version conflict, stale request, ownership, and compatibility invariants. Avoid tests that only assert UI copy or mirror implementation.
- Run type checking, focused lint, relevant tests, and production build as appropriate. Read existing scripts before choosing commands. Distinguish passing checks from checks blocked on credentials/services.
- Use fictional fixtures for verification. Actual owner business records are not a testing sandbox; sending, publishing, spending, and deployment are outside these implementation briefs unless separately authorized.
- For each slice, record changed files, the owner workflow demonstrated, validation, known gaps, and the next slice in the log below. Report observed behavior rather than claiming all acceptance criteria passed without evidence.

## Ready-to-use Sol starting prompt

> Implement S1 from docs/INITIAL-SLICES.md in this repository. Read ROADMAP.md for product context and use INITIAL-SLICES.md as the authoritative initial implementation order. Deliver a persistent Explore workspace where an owner can create, edit, park, and restore marketing ideas for the selected business. Keep existing guided work accessible and use backwards-compatible data additions, authenticated ownership checks, and optimistic concurrency. Preserve unsaved edits on conflicts and existing uncommitted documentation. Implement the actual UI and persistence, verify meaningful isolation/compatibility cases and the desktop/mobile workflow, and update the slice log with evidence. Complete S1 only; do not expand into AI discussions, browser infrastructure, live outreach, deployment, or later slices. End with the demonstrated behavior, checks, any remaining limitations, and the next handoff for S2.

## Slice log

| Slice | Status | Evidence / limitations | Next handoff |
| --- | --- | --- | --- |
| S1 | Implemented and API-validated | Persistent business-scoped ideas support create, edit, park, and restore; older documents read an empty Explore state without mutation. Ownership isolation, invalid sources, and stale writes are exercised by the API suite. | Completed |
| S2 | Implemented and API-validated | Exact owner/assistant messages persist; model context is bounded; suggestions are explicitly saved as ideas; owner text survives AI and revision failures. A broad three-direction ideation action is also available. | Completed; live-provider quality still needs owner use |
| S3 | Implemented and API-validated | Explore → Do freezes the selected idea, selection is idempotent, source changes are visible, lifecycle transitions are guarded, and accepted guided proposals can open in Do without rewriting their history. | Completed |
| S4 | Implemented and API-validated | Content, outreach, research-note, and product-brief artifacts keep immutable versions, manual editing, review state, copy, and Markdown download. AI/demo generation never implies delivery. | Completed |
| S5 | Implemented and API-validated | Manual and AI research store HTTPS source, retrieval date, observed facts, rationale, unknowns, and shortlist/reject state. Live candidates must match Responses API search/citation source metadata. Shortlists can become versioned research-note artifacts. | Completed; real web-search quality still needs owner review |
| S6 | Implemented and API-validated | Observations with provenance/evidence feed back to Explore; weekly review distinguishes completed work from impact; Portfolio persists priority, owner hours, blockers, and latest learning across businesses. | Completed; calibrate the next roadmap wave after owner testing |
