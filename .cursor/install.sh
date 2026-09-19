#!/bin/sh
set -eu

# Cloud dev install script. Runs when an agent runs in the cloud.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTFILES="${HOME}/.agentfiles"

# pull latest agentfiles
if [ ! -d "$AGENTFILES/.git" ]; then
  echo "agentfiles not found at $AGENTFILES" >&2
  exit 1
fi

git -C "$AGENTFILES" fetch origin master
git -C "$AGENTFILES" checkout -B master origin/master
HOME="$HOME" "$AGENTFILES/install"

# set up nvm and corepack
. "$NVM_DIR/nvm.sh"
corepack enable

# install dependencies
cd "$ROOT"
nvm install
corepack prepare --activate
pnpm install --frozen-lockfile
