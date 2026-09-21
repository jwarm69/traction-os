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

Research jobs use `thread/start` and `turn/start` over Codex App Server stdio with `approvalPolicy: "on-request"`, `sandbox: "read-only"`, and user-reviewed approvals. Configurations containing MCP servers, plugins, or hooks are rejected in this beta; built-in Codex computer use remains disabled. The read-only sandbox is the default, not a guarantee about a command the owner explicitly approves. Review the full command, paths, network context, or file-change preview before approving once.

Job state, approval requests, and final text return to Traction. Approval requests use `POST /api/runner` and wait for one heartbeat decision. `acceptForSession` is never emitted. Revocation/cancellation are detected on heartbeat (normally within 20 seconds); connectivity failure or a 30-minute server deadline stops further work. A process restart never replays uncertain work automatically. Completed text results are stored on the job and imported into the originating endeavor as a new, unreviewed artifact whose source evidence is `runner-job:<id>`; a retried completion never imports twice, and the owner still reviews it before any external action.

Computer use is an opt-in local beta powered by [`typesafe-computer-use`](https://github.com/awlevin/typesafe-computer-use), pinned to commit `ccde756a3145cd177e6a7396ddbab48286afaf75`. Install it into a dedicated Python 3.12+ environment, set `TYPESAFE_API_KEY` locally, grant Screen Recording and Accessibility permissions to the runner terminal, and pair with `--enable-computer-use --python /absolute/path/to/python`. Traction auto-allows only scrolling, waiting, and bringing the configured browser forward. Clicks, off-screen control presses, navigation, typing, Escape, and Return each require one-time approval in Traction. Raw and annotated screenshots stay in the job's local workspace and are not uploaded; extracted OCR/accessibility state is sent to TypeSafe to classify the next action. The integration is macOS-only and alpha; purchases, publishing, destructive actions, and authentication flows should be declined unless the preview is unambiguous and expected.

On the owner's configured Mac, `npm run runner:computer` loads the TypeSafe key from the `traction-typesafe-api` macOS Keychain item, prompts for the current Traction pairing code, and starts the production computer-use runner. The key is passed only to the runner process and is never committed or placed in shell history.

```sh
uv venv --python 3.12 .venv-computer-use
uv pip install --python .venv-computer-use/bin/python "git+https://github.com/awlevin/typesafe-computer-use.git@ccde756a3145cd177e6a7396ddbab48286afaf75"
TYPESAFE_API_KEY="..." node scripts/traction-runner.mjs --server https://traction.example --pair --workspace "$HOME/TractionRunner" --enable-computer-use --python "$PWD/.venv-computer-use/bin/python"
```

Codex authenticates locally. A ChatGPT-backed Codex login uses that account's eligible Codex access; an API-key login uses API billing. Traction does not convert ChatGPT subscription allowance into Platform API credits.

The server contract is a single JSON operation endpoint: `POST /api/runner` with `op` values such as `pair`, `claim`, `heartbeat`, `event`, `complete`, and `fail`. Credentials are never accepted as CLI arguments or printed.

Validation: unit and in-memory SQLite tests do not call a model. The installed CLI handshake was exercised without an account or model call; a paid/signed-in end-to-end run remains a release check. See [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).
