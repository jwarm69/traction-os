# Traction Lab MVP

A private GTM workspace: research → owner calibration → ranked channels → draft generation → owner handoff → outcome review.

## Run locally

Requires Node 22.13+.

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. Choose **Try the demo**, confirm or correct every finding, save a goal and budget, suggest channels, and create one or two drafts. Complete a handoff with an action log, then record the measured result. Demo content is fictional and template-based.

Live mode: use **Connect AI** to enter an OpenAI API key for the current tab, then enter a real business URL. This uses the Responses API with web search for research and model-generated plans/drafts. API usage is billed to that account. Keys remain in React memory and are passed to the server per request; they are not stored in Turso, cookies, logs, or browser storage. Reloading disconnects the key.

## Verification

```sh
npx tsc --noEmit
npm run build
```

The deployed app uses the signed-in ChatGPT user header as the user key. Locally, set `ALLOW_DEV_IDENTITY=true` and send a test-only `x-traction-dev-user-id` header. The header is rejected in production.

Live provider calls require a user-supplied API key and have not been exercised without one. The source follows https://developers.openai.com/api/reference/cli/resources/responses/methods/create . Provider errors and malformed output leave saved work unchanged.

## MVP boundaries

- Turso persists one current workspace per authenticated user. The workspace follows that person across browsers when they are signed in to the same ChatGPT account.
- Turso also stores an owner-confirmed business brief after calibration and one concise readout per experiment after results are logged. That memory is included in later live channel planning and draft creation for the current workspace. Starting new research clears prior workspace memory so it cannot influence an unrelated business.
- New research replaces the current workspace after successful research. Export is available.
- Actual automated capabilities: public web research (live mode), planning, text artifact generation, state transitions and outcome readouts.
- External sending, publishing, spending, browser automation and CLI execution are not integrated. These create explicit manual owner handoffs. Completion logs are owner-reported, not independently verified.
- There is no background scheduler: actions run during requests and can be resumed explicitly after a handoff. Requests time out after 120 seconds and retain prior state on failure.
- Live channels use the calibrated brief. Demo channels and templates are intentionally fixed examples, with edited brief values included in drafts.
- Research statements are model-generated and require owner review, including checking source links. Channel targets are hypotheses, never predicted outcomes.
- The owner action unlocks measurement. Outcome readouts use a transparent target comparison, not causal attribution.
- Keep the site private. Shared access would need account-based ownership, abuse controls and a separate credential strategy.

The bundled component catalog has existing lint diagnostics in unused primitives. Application-source lint is checked separately with `npx oxlint app lib db tests`.
