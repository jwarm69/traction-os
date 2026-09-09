# Traction OS

## Public beta and shared AI

Anyone can visit the public URL. Sign in with ChatGPT to use private, per-account business records. The server-held `OPENAI_API_KEY` funds shared AI; it is never returned to the browser. Existing personal Google connections remain session-only.

The `public-beta` ledger in Turso starts with a cumulative $10 ceiling. Each request atomically reserves a conservative maximum before contacting OpenAI. This covers concurrent requests across users. Text calls reserve $0.125; web research reserves $1.25 for up to two search calls. Completed usage is settled at uncached published token rates plus both possible search fees and a 10% cushion. Missing/uncertain usage keeps the full reservation. The app may pause before exactly $10; saved work stays available. There is no automatic refill or budget reset. This ledger does not limit other applications using the same key or non-OpenAI services.

Pricing verified September 9, 2026: [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [search pricing](https://developers.openai.com/api/docs/pricing). The model is pinned to `gpt-5.4-mini-2026-03-17`, standard service tier, 3,500 output tokens, two maximum tool calls, and bounded prompts. Review these assumptions before changing the model or pricing. An operator can top up by increasing the existing ledger ceiling; never delete spend records to refill it.

Owner starter records attach only to the matching trusted sign-in email. AlignIQ Golf, Astro-Log, Tonight, and this product have private pilot briefs and provisional three-channel rounds. These are plans, not completed campaigns. Their research and proposed goals need owner calibration; no messages were sent.

A private, multi-business GTM operating system: inspectable memory → sourced signals → bottleneck diagnosis → experiment rounds → outreach → weekly review.

## Run locally

Requires Node 22.13+.

```sh
npm ci
npm run dev
```

For this configured Turso project, `node scripts/dev-turso.mjs` starts the local app with a one-day database credential obtained from the signed-in Turso CLI. The credential stays in process memory and is excluded from production builds. Plain `npm run dev` requires separately configured runtime bindings.

Open the local URL printed by the server. The demo is fully fictional and cannot send email. A real workspace remains useful without an AI key for owner facts, manual or CSV signals, deterministic diagnosis, saved results, and reviews. Live research, prospect discovery, tailored drafts, and new live experiment rounds require an OpenAI key for the current tab.

Live research and tailored experiment rounds use the Responses API and `gpt-5.4-mini`. OpenAI, Gmail, and GA4 bearer tokens remain in React memory, are passed only for the requested operation, and are never stored in business documents, cookies, or browser storage. Reloading disconnects them.

## Verification

```sh
npx tsc --noEmit
npx oxlint app lib db tests scripts vite.config.ts
node --test tests/*.test.mjs
node tests/business-api.mjs
node tests/turso-integration.mjs
npm run build
```

The last two integration tests require the configured Turso CLI account; the API test also requires the local server. They create isolated temporary records and delete those records after the run. Google adapter tests mock provider responses; no emails are sent by tests.

The deployed app uses the signed-in ChatGPT user header as the user key. Locally, set `ALLOW_DEV_IDENTITY=true` and send a test-only `x-traction-dev-user-id` header. The header is rejected in production.

Live provider calls require a user-supplied API key and have not been exercised without one. The source follows https://developers.openai.com/api/reference/cli/resources/responses/methods/create . Provider errors and malformed output leave saved work unchanged.

## Operational boundaries

- Turso stores independent business documents under the trusted signed-in user identity. Every mutation uses per-business optimistic concurrency. The user upsert and document write share one database transaction.
- `migrations/002_business_documents.sql` is additive. On first load, an earlier single workspace and its experiment memories are lazily imported into one business; the old tables remain intact.
- Facts expose source, observed date, confidence, and owner review state. Diagnostics preserve missing evidence as unknown rather than treating it as zero.
- CSV and owner-entered signals remain labeled by provenance. GA4 key events are never presented as leads or sales.
- Gmail uses `gmail.send` and `gmail.readonly`; GA4 uses `analytics.readonly`. Gmail approval is bound to one recipient, reviewed content, a stable message ID, and the verified sending mailbox. The app persists `sending` before the external request. An ambiguous outcome becomes `uncertain`, blocks retry, and requires explicit reconciliation.
- Reply sync and GA4 import are owner-triggered. Weekly reviews are generated on demand and show the next due date; no background scheduler is claimed.
- Model research and drafts still require owner review. Experiment targets are hypotheses and result comparisons are not causal attribution.

The bundled component catalog has existing lint diagnostics in unused primitives. Application-source lint is checked separately with `npx oxlint app lib db tests`.
