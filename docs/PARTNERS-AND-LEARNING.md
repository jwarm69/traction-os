# Partner access, network learning, playbooks, and pipeline

Status: implemented and verified against the isolated `traction-dev` database. Migrations 009–011 were applied to production on 2026-09-21. Nothing here has been used by real outside accounts yet.

## Partner access (migration 010)

An owner shares **one business** with an existing account by username (Records → Partners with view access). The partner:

- sees that business only, addressed as `<ownerId>~<businessId>`; the owner's other businesses are never listed or loadable;
- is view-only: every write, AI run, runner job, and re-share is rejected by the server (403), and the interface is locked;
- loses access immediately when the owner removes them.

Limits: view-only is the only role. There is no email invitation; the partner must register first. Login is still username + PIN, so treat shared material accordingly until identity is upgraded. Verified by `tests/sharing-api.mjs`.

## Network learning (migration 011)

Goal: improve suggestions from everyone's use without taking their data.

What is stored per endeavor, and nothing else: kind, a channel category derived by fixed keyword rules, lifecycle status, the owner's verdict (repeat / adjust / drop / unknown), whether an artifact was reviewed, whether an observation exists, and the ISO week. No names, text, URLs, contacts, or numbers. Rows are keyed by a hash that includes a random per-account contributor id. Demo businesses contribute nothing.

How it is used: aggregates appear only when **at least three distinct accounts** contributed to a kind/channel pair. They are shown in Explore and appended to ideation prompts explicitly labeled as self-reported weak priors, not evidence for this business.

Consent: contribution is **on by default** with a visible control in Explore; turning it off deletes that account's contributions. Owner decision to revisit before inviting outside users: whether the default should be opt-in.

Honest limits: with few accounts nothing clears the threshold, so the panel is empty. Verdicts are owner opinions, not measured outcomes. The `network_contributors` table links an account to its contributor id inside the same database that already holds the account's records; the pattern table alone carries no content. Verified by `tests/network.test.mjs` and `tests/growth-api.mjs`.

## Playbooks and pipeline

Playbooks (`lib/playbooks.ts`) start an idea, an endeavor, and a step checklist in one action: creator outreach, directory submissions, content batch, customer interviews. Copy describes work, never promised results.

The pipeline (`lib/pipeline.ts`) tracks contacts through identified → contacted → replied → conversation → won/lost with one-step transitions, a required reason to reopen, and assistant-created contacts limited to `identified`. Reply and win rates stay unknown until the denominator reaches five.

## Runner

- Completed runner text returns to the endeavor as an unreviewed artifact.
- Jev's goal now includes the most recently owner-reviewed artifact copy, within the runner's 1,000-character limit; longer copy is truncated, so keep submissions short or split them.
- `--remember` / `--resume` / `--forget` keep a paired device in the macOS Keychain (see `docs/RUNNER.md` for the argv exposure limitation).
- Plan grants let routine steps on owner-named domains run without per-action prompts; consequential steps still pause (see `docs/RUNNER.md`). Not yet exercised in a real run.
