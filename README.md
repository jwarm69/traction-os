# Traction OS

## Product roadmap

See [ROADMAP.md](ROADMAP.md) for the short- and long-term product milestones, release gates, and operating assumptions. [Initial slices for Sol](docs/INITIAL-SLICES.md) records the implemented S1–S6 foundation and its acceptance evidence. [Sprint 01](docs/SPRINT-01.md) supplies supporting lifecycle requirements. Later roadmap items remain planned work.

The current product has three owner modes. Explore keeps ideas and durable human/AI discussion. Do freezes a selected direction, produces versioned artifacts, keeps sourced research inspectable, and records external observations without confusing drafts with outcomes. Portfolio shows priority, owner-time commitment, active/blocked work, and latest learning across businesses.

AI routing is deterministic: `DEEPSEEK_API_KEY` enables DeepSeek Flash for routine summaries, ideation, and drafting; `OPENAI_API_KEY` remains required for sourced web research and strategic experiment planning. A personal OpenAI key supplied in the session always overrides shared routing and is never persisted.

Do execution uses a server-authoritative control plane before spending or acting. Routine drafts stay in-app on DeepSeek, sourced research and strategic experiments stay in-app on OpenAI, product implementation routes to the paired Codex runner, and external computer actions route to Jev/TypeSafe only after an artifact has been owner-reviewed. Blocked, stopped, and completed work returns to the owner. The interface shows the route, reason, maximum shared API reservation, and approval boundary before a run; any desktop override is explicit.

The paired local Codex and computer-use runner is a gated beta. See [runner setup and limitations](docs/RUNNER.md). It adds device pairing, queued tasks, owner approval requests, and returned results without uploading Codex login credentials or raw screenshots to Traction. `RUNNER_ENABLED` defaults off; migrations 007–008 and a signed-in end-to-end check are required before rollout.

The owner portfolio also supports market-level operating records, so a business can keep campus, city, or segment progress distinct. Bite Club Meal Plan uses this to separate UF evidence from FAU and FSU expansion work while the venture is paused.

Partner view access, category-only network learning, playbooks, and the outreach pipeline are described in [docs/PARTNERS-AND-LEARNING.md](docs/PARTNERS-AND-LEARNING.md). They require migrations 009–011.

## Public beta and shared AI

Anyone can visit the public URL. People register a unique username with a 4–6 digit PIN to use private, per-account business records. PINs are PBKDF2 hashed with a random per-account salt. Login sessions use hashed opaque tokens in secure HTTP-only cookies, and failed login attempts are throttled per username. Server-held AI keys fund shared routing and are never returned to the browser. Existing personal Google connections remain session-only.

The `public-beta` ledger in Turso starts with a cumulative $5 ceiling. Each shared request atomically reserves a conservative maximum before contacting a provider. DeepSeek routine calls reserve $0.025, OpenAI text calls reserve $0.125, and OpenAI web research reserves $1.25 for up to two search calls. Completed usage is settled at peak uncached token rates, applicable search fees, and a 10% cushion; off-peak and cache discounts are therefore treated as extra safety margin. Missing or uncertain usage keeps the full reservation. Saved work remains available when the shared pool pauses. There is no automatic refill or reset, and the ledger cannot limit other applications using the same provider keys.

Pricing verified September 9, 2026: [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [search pricing](https://developers.openai.com/api/docs/pricing). The model is pinned to `gpt-5.4-mini-2026-03-17`, standard service tier, 3,500 output tokens, two maximum tool calls, and bounded prompts. Review these assumptions before changing the model or pricing. An operator can top up by increasing the existing ledger ceiling; never delete spend records to refill it.

Owner starter records attach only to the seeded owner account. AlignIQ Golf, Astro-Log, Tonight, Bite Club Meal Plan, and this product have private operating records. Bite Club is explicitly paused and its campus entries do not imply that UF progress transfers to FAU or FSU. Proposed plans need owner calibration; no messages were sent.

A private, multi-business GTM operating system: inspectable memory → sourced signals → bottleneck diagnosis → experiment rounds → outreach → weekly review.

## Run locally

Requires Node 22.13+.

```sh
npm ci
npm run dev
```

For local work, `npm run dev:local` mints a one-day token for the isolated `traction-dev` database (schema only, no owner data) and enables the dev identity header and runner. Put `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` in a gitignored `.env.local` to exercise Do runs. With that server running, `TEST_BASE_URL=http://localhost:3000 node tests/runner-import-api.mjs` checks that a completed runner job returns to its endeavor.

Local and production runs require `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Founder-funded auto routing uses server-side `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` values; OpenAI remains required for sourced research and strategic planning. Apply the SQL files in `migrations/` in order. To seed an owner, provide `OWNER_USERNAME`, `OWNER_PIN`, and `OWNER_EMAIL` alongside the Turso variables and run `node scripts/seed-owner.mjs`.

To add or refresh the paused Bite Club starter, provide `OWNER_EMAIL` and the Turso variables, then run `npm run seed:bite-club`. The seed is idempotent and keeps UF, FAU, and FSU as independent campus records.

Open the local URL printed by the server. The demo is fully fictional and cannot send email. A real workspace remains useful without an AI key for owner facts, manual or CSV signals, deterministic diagnosis, saved results, and reviews. Live research, prospect discovery, tailored drafts, and new live experiment rounds require an OpenAI key for the current tab.

Live research and tailored experiment rounds use the Responses API and `gpt-5.4-mini`. OpenAI, Gmail, and GA4 bearer tokens remain in React memory, are passed only for the requested operation, and are never stored in business documents, cookies, or browser storage. Reloading disconnects them.

## Verification

```sh
npx tsc --noEmit
npx oxlint app lib db tests scripts
node --test tests/*.test.mjs
TEST_BASE_URL=http://localhost:3000 node tests/business-api.mjs
node tests/turso-integration.mjs
npm run build
```

The last two integration tests require the configured Turso CLI account; the API test also requires the local server. They create isolated temporary records and delete those records after the run. Google adapter tests mock provider responses; no emails are sent by tests.

The deployed app uses its authenticated Turso account ID as the user key. Live provider calls use the capped server key when available, with an optional session-only user key fallback. Provider errors and malformed output leave saved work unchanged.

## Operational boundaries

- Turso stores independent business documents under the trusted signed-in user identity. Every mutation uses per-business optimistic concurrency. The user upsert and document write share one database transaction.
- `migrations/002_business_documents.sql` is additive. On first load, an earlier single workspace and its experiment memories are lazily imported into one business; the old tables remain intact.
- Facts expose source, observed date, confidence, and owner review state. Diagnostics preserve missing evidence as unknown rather than treating it as zero.
- CSV and owner-entered signals remain labeled by provenance. GA4 key events are never presented as leads or sales.
- Gmail uses `gmail.send` and `gmail.readonly`; GA4 uses `analytics.readonly`. Gmail approval is bound to one recipient, reviewed content, a stable message ID, and the verified sending mailbox. The app persists `sending` before the external request. An ambiguous outcome becomes `uncertain`, blocks retry, and requires explicit reconciliation.
- Reply sync and GA4 import are owner-triggered. Weekly reviews are generated on demand and show the next due date; no background scheduler is claimed.
- Model research and drafts still require owner review. Experiment targets are hypotheses and result comparisons are not causal attribution.

The bundled component catalog has existing lint diagnostics in unused primitives. Application-source lint is checked separately with `npx oxlint app lib db tests`.
