# Local Codex runner

The runner pairs a local machine with Traction and executes queued jobs using the signed-in **official `codex` CLI**. Traction never reads or uploads Codex auth files. Pairing immediately starts the runner and keeps the device bearer only in process memory; it never prints or persists the token. Restarting requires a fresh pairing code; unattended credential storage is not implemented.

Apply `migrations/007_runner.sql` to the intended database and set `RUNNER_ENABLED=true` on the Traction server to enable this beta. It is disabled by default. Never enable `ALLOW_DEV_IDENTITY` in production.

Install Codex separately. For a dedicated local login/configuration, sign in through the official CLI first (no credentials are copied from an existing login):

```sh
CODEX_HOME="$HOME/.codex-runner" codex login
```

Generate a pairing code in **Do → Paired desktop runner**, then run this command from the Traction checkout. Enter the code when prompted:

```sh
node scripts/traction-runner.mjs --server https://traction.example --pair --workspace "$HOME/TractionRunner" --name "My Mac" --codex-home "$HOME/.codex-runner"
```

`--allow-local-http` is required for `http://localhost` development servers. Redirects are refused. Choose a dedicated workspace; each job receives a fresh `job-...` directory and the server's current working directory is never used. The child receives an allow-listed environment and no Traction token.

Each job uses `thread/start` and `turn/start` over Codex App Server stdio with `approvalPolicy: "untrusted"`, `sandbox: "read-only"`, and user-reviewed approvals. Configurations containing MCP servers, plugins, or hooks are rejected in this beta; connected apps and computer use are disabled. The read-only sandbox is the default, not a guarantee about a command the owner explicitly approves. Review the full command, paths, network context, or file-change preview before approving once.

Job state, approval requests, and final text return to Traction. Approval requests use `POST /api/runner` and wait for one heartbeat decision. `acceptForSession` is never emitted. Revocation/cancellation are detected on heartbeat (normally within 20 seconds); connectivity failure or a 30-minute server deadline stops further work. A process restart never replays uncertain work automatically. Completed results are stored on the job, not automatically merged into business artifacts. General browser/desktop control, repository checkout, and automated publishing are not implemented.

Codex authenticates locally. A ChatGPT-backed Codex login uses that account's eligible Codex access; an API-key login uses API billing. Traction does not convert ChatGPT subscription allowance into Platform API credits.

The server contract is a single JSON operation endpoint: `POST /api/runner` with `op` values such as `pair`, `claim`, `heartbeat`, `event`, `complete`, and `fail`. Credentials are never accepted as CLI arguments or printed.

Validation: unit and in-memory SQLite tests do not call a model. The installed CLI handshake was exercised without an account or model call; a paid/signed-in end-to-end run remains a release check. See [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).
