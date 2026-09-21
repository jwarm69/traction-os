#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
account=$(/usr/bin/id -un)
typesafe_key=$(/usr/bin/security find-generic-password -a "$account" -s traction-typesafe-api -w)

if [[ -z "$typesafe_key" ]]; then
  echo "TypeSafe key is missing from macOS Keychain." >&2
  exit 1
fi

runner_workspace=${TRACTION_RUNNER_WORKSPACE:-$HOME/TractionRunner}
/bin/mkdir -p "$runner_workspace"
export TYPESAFE_API_KEY=$typesafe_key
unset typesafe_key

exec /opt/homebrew/bin/node "$project_dir/scripts/traction-runner.mjs" \
  --server https://traction-os.vercel.app \
  --pair \
  --workspace "$runner_workspace" \
  --name "Jack's Mac" \
  --enable-computer-use \
  --python "$project_dir/.venv-computer-use/bin/python"
