# Autonomous Do

Traction OS should understand the business, recommend work, execute through the owner's chosen account, and return for judgment when needed.

## This slice

- A Do run uses the saved business context and endeavor brief to prepare an artifact. Research and outreach preparation use provider web search; other kinds prepare a draft.
- The run and its original context are recorded before calling AI. Results remain drafts for review; producing an artifact does not establish customer acquisition or complete an external action.
- An explicit personal OpenAI API key takes priority over shared credits. It lives in browser memory for the session and is sent to the server for that request. A failed personal key must never fall back to shared billing.
- A downloadable agent brief lets an owner continue manually in their own Codex environment. This does not pair the website to their desktop or automatically import results.

## Paired local execution beta

The repository now includes an expiring pairing flow, device revocation, a durable SQL task queue, per-action approval decisions, a local Codex App Server worker, and a Do panel for results. Setup is in [RUNNER.md](./RUNNER.md). Enable only after applying migration 007 and validating the intended deployment. The feature is off by default; no production migration was applied by this implementation pass.

The worker returns text results from an isolated task directory. It does not yet check out repositories, drive desktop/browser apps, or auto-publish. Returned text is imported into the originating endeavor as an unreviewed artifact. Codex authentication remains local, and a signed-in end-to-end model run is still a release check.

## Continuing connected execution

Extend the paired desktop runner using the documented Codex App Server interface. The runner owns local authentication; Traction must not collect ChatGPT session cookies or copy the owner's Codex credential file to the server.

1. Authenticate the owner in Traction and pair a device using an expiring, single-use code.
2. The device pulls only jobs authorized for that owner, with scoped credentials and a revocable device identity.
3. Each job carries a versioned business/endeavor snapshot, allowed actions, output requirements, and runtime limits.
4. Start a local Codex task and relay progress, approval requests, errors, and artifact references.
5. Return results against the originating job ID; reject duplicates, expired leases, and mismatched owners.
6. Resume after a specific approval, or stop when the owner cancels. A lost connection must not silently rerun external actions.

The browser should show whether a result was drafted, actually executed, verified, or still awaiting judgment. Tool availability is discovered on the runner; starting Codex must not imply that desktop computer use is available.

## Execution routes

Use direct APIs for supported operations, a code agent for repository/file work, and a browser or desktop environment when an API is unavailable. Sending, publishing, and spending require the job's explicit authorization. Every claimed external result needs a receipt or other verifiable evidence.

Subscription entitlement is provider-specific. ChatGPT subscription access in official Codex clients is distinct from Platform API billing; do not present an API key as a subscription connection. Claude subscription integration requires provider approval before offering it in a third-party product. API provider support and subscription support are separate features.

## Completion gates for the next slice

- Pair and revoke a device without exposing AI credentials to Traction.
- Run one repository task and return an artifact with its source job ID.
- Demonstrate interrupted-run recovery and duplicate prevention.
- Relay one real approval request and resume the same task.
- Verify one browser task in an isolated environment before enabling general computer use.

References: [Codex App Server](https://developers.openai.com/codex/app-server), [Codex authentication](https://developers.openai.com/codex/auth), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).
