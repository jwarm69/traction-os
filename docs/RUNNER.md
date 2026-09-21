# Local Codex runner

The runner pairs a local machine with Traction and executes queued jobs using the signed-in **official `codex` CLI**. Traction never reads or uploads Codex auth files. Pairing immediately starts the runner and by default keeps the device bearer only in process memory; it never prints the token. Persistent pairing is opt-in and macOS-only (see "Remembering a paired device").

Apply `migrations/007_runner.sql` to the intended database and set `RUNNER_ENABLED=true` on the Traction server to enable this beta. It is disabled by default. Never enable `ALLOW_DEV_IDENTITY` in production.

Install Codex separately. For a dedicated local login/configuration, sign in through the official CLI first (no credentials are copied from an existing login):

```sh
CODEX_HOME="$HOME/.codex-runner" codex login
```

Generate a pairing code in **Do → Paired desktop runner**, then run this command from the Traction checkout. Enter the code when prompted:

```sh
node scripts/traction-runner.mjs --server https://traction.example --pair --workspace "$HOME/TractionRunner" --name "My Mac" --codex-home "$HOME/.codex-runner"
```

## Remembering a paired device

By default every restart needs a fresh pairing code. Opt in to persistence with `--remember`, which stores the device credential in the macOS login Keychain as a generic-password item with service `traction-runner-device` and account set to the server origin (one item per server):

```sh
node scripts/traction-runner.mjs --server https://traction.example --pair --remember --workspace "$HOME/TractionRunner"
node scripts/traction-runner.mjs --server https://traction.example --resume --workspace "$HOME/TractionRunner"
node scripts/traction-runner.mjs --server https://traction.example --forget
```

`--resume` starts without a pairing code by reading that item. If the server answers `401` (device revoked or unauthorized), the runner deletes the item and exits telling you to pair again. `--forget` deletes the item and exits. The token is never printed, never accepted as a CLI argument, and never written to a file; the stored secret is a small JSON object holding the bearer token and device id. These three flags are refused on non-macOS platforms.

**Known limitation (not resolved):** the `security` CLI has no scriptable way to read a new secret from stdin — `add-generic-password -w` without a value prompts on the controlling terminal and asks for confirmation — so the credential is passed to `/usr/bin/security` as an argument and is briefly visible in that process's argument list to other processes running as the same user. It is spawned directly rather than through a shell, so it never reaches shell history. If that exposure is unacceptable for your machine, do not use `--remember`; the in-memory default is unchanged.

Verification status: the Keychain module is covered by unit tests with a mocked spawn (`tests/runner-keychain.test.mjs`), which do not touch the real Keychain. An end-to-end store/resume/revoke cycle against a real Keychain and a live server has not been exercised here.

`--allow-local-http` is required for `http://localhost` development servers. Redirects are refused. Choose a dedicated workspace; each job receives a fresh `job-...` directory and the server's current working directory is never used. The child receives an allow-listed environment and no Traction token.

Research jobs use `thread/start` and `turn/start` over Codex App Server stdio with `approvalPolicy: "on-request"`, `sandbox: "read-only"`, and user-reviewed approvals. Configurations containing MCP servers, plugins, or hooks are rejected in this beta; built-in Codex computer use remains disabled. The read-only sandbox is the default, not a guarantee about a command the owner explicitly approves. Review the full command, paths, network context, or file-change preview before approving once.

Job state, approval requests, and final text return to Traction. Approval requests use `POST /api/runner` and wait for one heartbeat decision. `acceptForSession` is never emitted. Revocation/cancellation are detected on heartbeat (normally within 20 seconds); connectivity failure or a 30-minute server deadline stops further work. A process restart never replays uncertain work automatically. Completed text results are stored on the job and imported into the originating endeavor as a new, unreviewed artifact whose source evidence is `runner-job:<id>`; a retried completion never imports twice, and the owner still reviews it before any external action.

Computer use is an opt-in local beta powered by [`typesafe-computer-use`](https://github.com/awlevin/typesafe-computer-use), pinned to commit `ccde756a3145cd177e6a7396ddbab48286afaf75`. Install it into a dedicated Python 3.12+ environment, set `TYPESAFE_API_KEY` locally, grant Screen Recording and Accessibility permissions to the runner terminal, and pair with `--enable-computer-use --python /absolute/path/to/python`. Traction auto-allows only scrolling, waiting, and bringing the configured browser forward. Clicks, off-screen control presses, navigation, typing, Escape, and Return each require one-time approval in Traction. **Plan grant (migration 009):** when queuing a Jev job the owner may name one to five https domains and allow routine steps there for up to 40 steps. Typing, Escape, and clicks on clearly labeled ordinary controls on those domains then run without a prompt (`scripts/computer-use/grant_policy.py`). Submit/send/publish/pay/delete/sign-in style controls, Return, navigation, unlabeled controls, and every other site still require one-time approval. Without a grant every action prompts. The policy is unit-tested; a real grant-backed run has not been performed yet. Raw and annotated screenshots stay in the job's local workspace and are not uploaded; extracted OCR/accessibility state is sent to TypeSafe to classify the next action. The integration is macOS-only and alpha; purchases, publishing, destructive actions, and authentication flows should be declined unless the preview is unambiguous and expected.

On the owner's configured Mac, `npm run runner:computer` loads the TypeSafe key from the `traction-typesafe-api` macOS Keychain item, resumes from a stored `traction-runner-device` item when one exists (otherwise prompting for a pairing code and remembering it), and starts the production computer-use runner. The key is passed only to the runner process and is never committed or placed in shell history.

```sh
uv venv --python 3.12 .venv-computer-use
uv pip install --python .venv-computer-use/bin/python "git+https://github.com/awlevin/typesafe-computer-use.git@ccde756a3145cd177e6a7396ddbab48286afaf75"
TYPESAFE_API_KEY="..." node scripts/traction-runner.mjs --server https://traction.example --pair --workspace "$HOME/TractionRunner" --enable-computer-use --python "$PWD/.venv-computer-use/bin/python"
```

Codex authenticates locally. A ChatGPT-backed Codex login uses that account's eligible Codex access; an API-key login uses API billing. Traction does not convert ChatGPT subscription allowance into Platform API credits.

The server contract is a single JSON operation endpoint: `POST /api/runner` with `op` values such as `pair`, `claim`, `heartbeat`, `event`, `complete`, and `fail`. Credentials are never accepted as CLI arguments or printed.

Validation: unit and in-memory SQLite tests do not call a model. The installed CLI handshake was exercised without an account or model call; a paid/signed-in end-to-end run remains a release check. See [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).
