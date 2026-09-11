# Traction product roadmap

Status: proposed working roadmap. No features below are implied to be shipped or externally authorized. This document consolidates the product, execution, computer-use, timeline, and operating-cost discussion and checks it against the current repository.

## Product direction

Traction pairs owners with AI to ideate, research, choose, and carry out marketing endeavors and product improvements across a portfolio. It keeps enough business context to improve the next decision, performs supported work with the owner's authorization, and shows evidence of what happened. Growth experiments are one way to structure the work; content production, creator outreach, channel research, and product improvements are also first-class endeavors.

The first customer hypothesis is a solo founder or small business owner with a usable offer, a specific audience, and limited time to find customers. Start with one owner per account and one active business during onboarding; preserve existing multi-business support. Validate this hypothesis with five invited owners before expanding the audience to agencies or teams.

The first useful outcome is a real experiment prepared for execution, with a usable deliverable, named audience, measurement plan, and clear next action. An accepted proposal alone does not count. The recurring value is completing the experiment and using its observations to decide what to do next.

Product loop: understand → ideate → research → choose → prepare → authorize → execute → verify → measure → decide.

Success means less owner work and better supported decisions. A listing submission or sent email is an execution result; a qualified conversation or activated customer is a business outcome. Neither implies the other.

## Explore, Do, and Portfolio

Owner clarification, September 11, 2026: the core use case includes selecting marketing endeavors, researching audiences and channels, finding creators/influencers, making content, and acting on those opportunities. Traction itself must also demonstrate its usefulness and improve its own product. The earlier activation-pilot examples were too narrow to define the whole product.

- **Explore:** persistent human/AI discussions linked to business context; develop multiple directions, research sources, challenge assumptions, compare effort/readiness/expected learning, and keep selected or parked ideas with reasons. Preserve uncertainty instead of inventing opportunity scores, creator rates, or audience statistics.
- **Do:** turn a selected endeavor into deliverables, tasks, owners, dependencies, authorized actions, and an observation plan. Support research, content, outreach, and product-improvement work. Use available APIs and manual handoffs first; browser adapters follow the reliability milestones below.
- **Portfolio:** show priorities, active endeavors, owner time committed, blocked work, and recent observations across AlignIQ Golf, Astro-Log, Tonight, and Traction. Suggest transferable lessons without sharing private data between unrelated accounts or treating one business's results as proof for another.

The handoff freezes the selected idea, supporting research, owner decisions, audience, deliverables, constraints, and intended outcome. Do returns artifacts, receipts, actual effort, observations, and open questions to Explore. Owners can explore many possibilities while limiting the amount of active work.

Use a shared endeavor record with a kind such as research, content, outreach, experiment, or product improvement. An experiment adds a hypothesis and success/stopping rules; a research task can finish with a sourced recommendation, and a content task can finish with an approved artifact. Do not force every task into an invented numerical experiment target. Keep stable links to the existing experiment history.

### Four-business application

These priorities reflect owner direction; examples below are proposed work, not researched opportunities or validated product capabilities.

| Business | Explore emphasis | Four-week Do deliverables | Evidence to bring back |
| --- | --- | --- | --- |
| AlignIQ Golf | Compare marketing endeavors, golfer/coach audiences as readiness permits, content angles, creators, communities, and partnerships | Sourced channel or creator shortlist, chosen campaign brief, editable outreach messages, content hooks/scripts, action checklist | Owner-confirmed sends/publications, replies, attributed visits/signups where available, product use, and effort |
| Astro-Log | Top-of-funnel acquisition, relevant influencers, shareable content, newsletter or creator collaborations | Creator shortlist with fit reasons and published contact routes, pitch drafts, a small content batch, campaign tracking plan | Published links, responses, referred subscribers, and subsequent reader behavior where observed |
| Tonight | Explore which local audiences, creators, content, and distribution methods are worth trying; keep channel and monetization uncertainty explicit | Local opportunity shortlist, editable content and collaboration pitches, one selected marketing endeavor | Visits, shared-shortlist use, reported dinner decisions, and repeat use where observable |
| Traction | Acquire owners, demonstrate useful work, identify product friction, prioritize improvements | Recruitment/content drafts, evidence-backed case-study draft after actual results, feedback-linked product tickets with acceptance criteria, release follow-up checklist | Usable deliverables, owner time, completed work, repeat use, willingness-to-pay observations, and whether fixes reduced friction |

Creator research must attach sources and retrieval dates; unknown reach, pricing, engagement, availability, and audience fit stay unknown. A proposed collaboration is not an agreement. Content MVP means editable copy, scripts, and visual briefs; automatic video production and broad social scheduling are later scope.

For product improvement, the four-week handoff is an actionable ticket or implementation brief linked to user evidence. Autonomous code changes, deployment, and access to each product's repository are separate capabilities to evaluate later. Traction may use its own results as evidence, but success claims need actual records and permission to publish customer material.

## Starting point: verified in the repository

| Existing capability | Current boundary | Roadmap implication |
| --- | --- | --- |
| Private business documents and optimistic concurrency | Most business state lives in one JSON document | Preserve it; add execution records incrementally |
| Guided brief, diagnosis agreement, one experiment proposal | `acceptGuidedProposal` ends at acceptance with preparation pending | Connect acceptance to actual preparation first |
| Older rounds, experiment results, weekly reviews | Reviews read `rounds`; guided proposals are a separate path | Use one consistent experiment identity and result history |
| Sourced facts, manual/CSV signals, GA4 import | Imports require owner action; facts may remain unreviewed | Keep provenance and freshness visible |
| Gmail approval, sending, replies, reconciliation | Tokens are supplied per session; actions are owner-triggered | Reuse the send safety pattern and add persistent connections |
| Owner action queue | Mostly tells the owner which tool to open | Evolve into an inbox of prepared work, blockers, and results |
| Username/PIN authentication | No established verified identity/recovery flow | Upgrade before retaining valuable account access |
| Shared AI reservation ledger | Global beta cap; no user execution allowances | Add per-run and per-account budgets before automation |
| Deterministic diagnosis and review | Rules and stored evidence; not a continuously learning agent | Improve from observed outcomes without overstating intelligence |

Evidence: [guided lifecycle](lib/engine.ts), [review and diagnosis](lib/engine.ts), [workspace actions](app/api/workspace/route.ts), [owner queue](lib/owner-queue.ts), [provider adapters](lib/connections.ts), [authentication](lib/auth.ts), [AI requests](lib/ai.ts), [budget accounting](lib/ai-budget.ts), and [operational boundaries](README.md).

## Priorities and sequencing

1. Establish the shared endeavor lifecycle and finish one useful marketing workflow through deliverables and observations.
2. Reduce owner effort through preparation, better connections, and automatic evidence collection.
3. Establish durable execution, precise authorization, and recovery.
4. Add one browser workflow that pilot users actually need.
5. Expand only where task reliability, customer value, and economics justify it.

The earlier idea to start with background monitoring is adjusted: the guided acceptance dead end comes first, and persistent OAuth must precede unattended Google sync. Directory submission remains a candidate browser workflow, not a requirement for every customer.

## Short-term roadmap: first 12 weeks

Time ranges assume one experienced full-time engineer using AI assistance and an owner available for product decisions and pilot sessions. They are estimates, not measured delivery forecasts. Provider verification, authentication review, and pilot recruitment can extend calendar time. Start counting from implementation kickoff; no calendar deadline is implied.

| Milestone | Planning window | Customer-visible result | Release gate |
| --- | --- | --- | --- |
| M1: Complete the work loop | Weeks 1–2 | Accept a selected endeavor, prepare a useful artifact, track progress, record observations, review a next decision | End-to-end workflow works after reload and preserves experiment history |
| M2: Explore and operate the portfolio | Weeks 3–4 | Persistent ideation/research, idea selection and handoff to Do, lightweight portfolio priorities, content/outreach preparation | Walkthroughs across all four businesses produce usable work; external pilot follows as owners are available |
| M3: Connect and execute reliably | Weeks 5–8 | Connect Google, execute exact approved work, see durable progress and receipts | Identity, token isolation, worker recovery, approvals, and budget gates pass |
| M4: Monitor and assist through a browser | Weeks 9–12 | Scheduled evidence checks plus one limited browser playbook | Monitoring is trustworthy; browser playbook meets measured release criteria |

M3 and M4 may span weeks 8–16 if provider approval or browser reliability requires more work. The previous eight-week browser beta estimate is an optimistic case. Keep delivering M1/M2 value while those dependencies resolve.

### M1 — Complete the experiment loop

Deliver the backlog in [docs/SPRINT-01.md](docs/SPRINT-01.md).

Sprint 01 supplies Do's foundation. Weeks 3–4 add a deliberately small Explore surface: business-linked discussions, saved ideas with sources and owner corrections, select/park actions, and a versioned handoff to Do. Add a portfolio list with priorities and effort commitments. Rich visual idea canvases, extensive branching interfaces, and multiple publishing integrations are deferred to protect the four-week scope.

- Create a stable active experiment from an accepted guided proposal without duplicate records.
- Show preparation, execution, observation, and review states with an explicit manual path.
- Prepare an editable task checklist and a usable artifact, such as a creator pitch, content draft, sourced opportunity shortlist, or interview guide, grounded in confirmed context.
- Attach contacts, drafts, evidence, and results to the experiment instead of leaving them disconnected.
- Record cohort counts and observations, including unknown and inconclusive outcomes.
- Make the next action obvious on Today, including recovery from blocked or abandoned work.
- Include guided experiments in reviews and future proposal context while preserving older rounds.

Gate: an owner can complete the workflow without a developer modifying records, and a repeated accept action creates no duplicate experiment. Starting work, attempting a send, and verifying success remain distinguishable.

### M2 — Test usefulness and reduce setup

Add these only to support the first complete workflow:

- Business setup from a URL plus a short owner explanation; propose editable facts and ask only questions that change the next experiment. Retain explicit confirmation of consequential assumptions.
- A small preparation pack: audience criteria, editable message or content artifact, checklist, tracking fields, and a finite stopping rule.
- A lightweight contact/outcome record: source, fit reason, contact status, qualified conversation, first useful outcome, and optional revenue observation. Avoid building a full CRM.
- Clear separation between what Traction can perform, what it can prepare, and what requires owner work or a missing connection. Unsupported tasks must have an honest manual handoff.
- Experiment-specific notes, attachments, correction history, and an export so owners can use the work outside Traction.
- In-app feedback and a minimal support path tied to the experiment/run ID.

First use the four portfolio businesses to check relevance across research, content, outreach, and product feedback. This is internal product evidence, not external demand validation. External pilot: the owner invites five suitable people through their own channel as recruitment permits. Ask them to bring a real marketing task. Observe the first session, then check whether they return and finish the endeavor within its chosen window. Recruitment or outreach is not authorized by this roadmap itself.

Provisional gate: at least 3 of 5 prepare something they can actually use; at least 2 complete an experiment and choose a next action. Record help needed, owner minutes, abandonment reasons, and whether anyone would pay. These are directional pilot thresholds, not statistical proof. If the preparation is irrelevant or too much work, improve it before adding automation breadth.

### M3 — Persistent connections and reliable execution

Identity and connection prerequisites:

- Migrate existing owners to verified sign-in with recovery and session revocation; choose a maintained authentication solution during implementation. Add passkeys or MFA appropriate to retained account access.
- Replace pasted Google access tokens with OAuth, encrypted refresh-token storage, account identity display, reconnect, and revoke controls.
- Verify Google's current scope and application-review requirements before committing a public launch date. Start with the least access needed; seek sending access when the user enables sending.
- Implement account export/deletion, token cleanup, browser-session cleanup, and published retention choices before the broader connected beta.

Execution foundation:

- Add durable runs, steps, approvals, evidence pointers, usage records, and worker leases.
- Keep long-running work outside the current synchronous workspace request.
- Bind approvals to business, account, destination, exact content/version, allowed action, and expiration. Content edits invalidate approval.
- Support cancellation, crash recovery, bounded safe retries, and reconciliation for ambiguous side effects. Never promise exactly-once delivery from a local retry mechanism alone.
- Enforce account and run budgets before starting paid work, settle actual usage, and keep uncertain charges conservative.
- Expose progress, pauses, failures, receipts, and actions the owner can take.

First execution path: prepare outreach for a small owner-selected cohort, approve specific recipients and text, send through Gmail, capture receipts, and link reply observations to that same experiment. Qualification remains an owner-confirmed judgment initially. Provide do-not-contact/suppression and duplicate prevention before any repeated outreach workflow; automated follow-up sending is deferred.

Gate: account boundaries hold; revoking access prevents new work; concurrent workers cannot duplicate an approved operation; crashes between external success and receipt persistence reconcile safely; budget exhaustion stops new paid work. No unattended sending is enabled simply because an experiment was accepted.

### M4 — Monitoring and first browser playbook

Monitoring, after M3 connections and worker infrastructure:

- User-configured schedules and time zone; jobs only run while the relevant consent and connection remain active.
- Automatic reply and GA4 checks with import deduplication, source dates, and last successful sync.
- Generate reviews from current observations; mark stale or failed imports visibly.
- Notify for meaningful replies, results, deadlines, failures, or owner decisions. Deduplicate alerts and provide quiet hours and pause controls.
- Avoid repeated model calls when nothing changed; use provider events where supported and economical, otherwise bounded polling.

Browser pilot:

- Choose one task repeated by at least three pilot owners and poorly served by an API.
- Candidate: prepare an approved listing on up to three supported directory sites, allow review, submit with authorization, and verify the receipt or live URL.
- Use an isolated remote browser with restricted access, a user takeover path for authentication, and separate session ownership per account.
- Show the exact proposed destination and data before transmission. A form may autosave while being filled, so "prepare only" does not automatically mean no external writes. Preview internally first and authorize the relevant transmission before filling such forms.
- Bound browser minutes, model calls, steps, and retries. Pause on access challenges; retain only necessary, redacted evidence under a defined retention policy.
- Test account isolation, adversarial page instructions, changed forms, missing fields, expired logins, interruption, and ambiguous submission results.

Provisional gate: at least 30 representative runs across supported sites and states, at least 90% verified completion among eligible attempts, zero observed unauthorized submissions or cross-account exposure, and all ambiguous outcomes surfaced. Report blocked runs and human interventions separately instead of hiding them from success rates. These numbers permit a small supervised beta; they do not establish general reliability.

## Long-term roadmap

| Horizon | Product investment | Evidence required before expanding |
| --- | --- | --- |
| Months 3–4 | Strengthen the first playbook; add one adjacent workflow such as CMS drafts or form preparation; support a second API integration only if demanded | First workflow saves owner time and customers repeat it |
| Months 4–6 | Three to five supported playbooks; richer outcome imports; versioned reusable business assets; paid usage allowances | Stable completion rates, manageable support, repeat usage, measured task costs |
| Months 6–9 | Approved recurring experiments; better channel/cohort comparison; optional collaborator roles and agency workspaces | Repeated customer demand for recurrence or collaboration; access and approval ownership proven |
| Months 9–12+ | Broader browser task coverage; reusable execution patterns; consider a browser extension or desktop companion | Cloud browser limitations repeatedly block valuable paid tasks and justify added security/support work |

Expansion should follow customer jobs rather than a fixed integration quota. Candidate playbooks include CMS content drafts, lead-capture form preparation, CRM updates, marketplace listings, and ad campaign drafts. Paid publishing, ad spend, purchases, destructive edits, and outbound messages retain explicit authorization tied to scope. Each new destination needs its own feasibility and provider-policy check.

Learning improvements should connect observed results to the brief, cohort, channel, artifact version, date window, and owner effort. Recommend repeat/change/stop with evidence and alternatives. Do not infer causal channel performance from unrelated totals or a single successful campaign.

## Product completeness: build when it earns its place

| Addition | Why it matters | Timing |
| --- | --- | --- |
| Versioned business assets: offer, audience, proof, voice, logos, approved copy | Reduces repeated setup and prevents contradictory output | M2 basics; expand months 3–6 |
| Contact and outcome tracking | Connects outreach to business observations | M1 linking; M2 lightweight records |
| Manual completion and blocked-state recovery | Keeps experiments useful when automation cannot proceed | M1 |
| Artifact preview, edit, download, and history | Makes prepared work usable and reviewable | M1/M2 |
| Connection health, account recovery, export, deletion | Gives owners control over their business access and data | M3 before broader connected beta |
| Usage display, hard caps, billing reconciliation | Makes paid automation sustainable and understandable | M3 metering; paid beta after measured usage |
| Support tooling and operational visibility | Makes failed work diagnosable without exposing private content broadly | M2 minimal; M3 structured |
| Team roles and approval ownership | Supports collaborators and agencies | Defer until demand supports it |

Defer universal desktop control, unrestricted web tasks, mass outreach, automatic ad-budget changes, a full CRM, a large content scheduler, a public playbook marketplace, and custom model training. Each would substantially widen the initial product and support burden.

## Architecture direction

Keep Next.js as the application/control surface and retain current business documents for brief and planning data. Introduce normalized execution storage incrementally instead of replacing all existing state.

Suggested records: `experiments` (or a backward-compatible canonical experiment representation), `execution_runs`, `execution_steps`, `approvals`, `connections`, `artifacts`, `usage_events`, `schedules`, and notification delivery records. Select exact schema names in implementation. Store large screenshots/files in object storage and keep ownership-scoped pointers in the database; do not put images into the capped business JSON.

Every run references a stable experiment and a frozen brief/artifact version. All records and workers enforce user/business ownership. Use leases, durable checkpoints, idempotency keys where providers support them, and external receipt reconciliation.

Adapters expose supported operations, required access, side effects, approval requirements, verification methods, and retry behavior. Prefer a supported API when available. Browser execution is a separate adapter using the same approvals, usage accounting, and result records.

Keep execution and experiment lifecycles distinct:

- Experiment: preparing → ready → running → observing → reviewed; blocked, stopped, and inconclusive outcomes are explicit.
- Run: queued → running → awaiting approval/user input → succeeded/failed/uncertain/canceled. Resumption requires valid scope and current authorization.
- A succeeded run does not mark the whole experiment successful. A stopped run does not erase already completed external actions.

## Measurement and release decisions

| Metric | Definition | Use |
| --- | --- | --- |
| First useful preparation | Owners who produce a usable reviewed artifact and actionable experiment / owners who start setup | Activation; inspect time and help needed |
| Completed experiment loop | Owners who record observations and a next decision / owners who start an experiment | Core usefulness |
| Repeat use | Owners starting another useful experiment within 30 days / eligible owners with a completed experiment | Retention signal |
| Verified execution rate | Attempts whose intended external result is verified / all eligible attempts | Reliability; also publish all-attempt, blocked, and takeover counts |
| Owner effort | Measured minutes preparing, supervising, correcting, and recovering | Check that automation actually saves work |
| Cost per verified task | All model, search, browser, storage, and retry costs / verified completed tasks | Unit economics |
| Business outcomes | Cohort-linked qualified conversations, activation, or revenue observations within the specified window | Decision support, with unknowns and attribution limits |

Instrument events with experiment/run IDs and timestamps. Avoid storing message bodies, credentials, or screenshots in general analytics. Initial targets are hypotheses; review them after each pilot cohort.

## Operating cost and commercial assumptions

Earlier discussion estimated $3–$10/month for a normal active customer, $15–$40 for heavy usage, and roughly $0.10–$4 for many bounded browser tasks. These are unvalidated scenarios, not measured costs or price guarantees. Browser provider minimums, model choice, accumulated screenshot/context tokens, failed attempts, concurrency, and human support can change them substantially. The biggest cost driver has not yet been measured.

Before promising included runs, benchmark 30 representative tasks and record median and p95 total cost, completion, elapsed time, and owner intervention. Recheck current provider pricing when selecting infrastructure. Distinguish machine cost from support labor, engineering, transaction fees, third-party subscriptions, and customer campaign spend.

Use a subscription with a visible execution allowance and hard limits as the initial commercial hypothesis. The earlier $29/$79 tiers and run counts remain placeholders for customer and cost validation. Do not promise unlimited execution or charge for a "successful result" without a clear failure/refund policy. A task's allowance must account for complexity, not merely its name.

Planning formula: monthly service cost = fixed infrastructure + model usage + search + browser runtime + artifact storage/egress + other provider fees. Track support effort separately and include it when evaluating contribution margin.

Keep the current global AI ceiling until an explicit funded allowance replaces or supplements it. Roadmap approval does not authorize raising spend, purchasing infrastructure, sending messages, or deploying connected automation.

## Working process and next decision

Start with [Initial slices for Sol](docs/INITIAL-SLICES.md). This is the updated implementation order: deliver a small persistent Explore workspace first, then discussions, selection into Do, artifacts, research, and portfolio/results. It refines the milestone sequence above; Sprint 01 remains supporting lifecycle detail. Keep slice status, evidence, and newly discovered dependencies in the slice log. At each milestone, review real owner sessions and decide whether to improve the current workflow or advance. Do not treat checklist completion as evidence of customer value.

Before M3, select the identity provider, worker platform, secrets management, and storage based on the deployment environment and pilot needs. Before M4, select the browser provider and first sites through a short feasibility spike. Those choices need not block M1.

The immediate release demonstration is: an owner accepts a useful experiment, receives an editable preparation pack, performs or delegates supported steps, records observations, and sees a justified next decision in the same workflow.
